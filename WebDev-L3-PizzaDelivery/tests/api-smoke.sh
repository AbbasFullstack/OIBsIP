#!/usr/bin/env bash
# API smoke test for the Pizza Delivery server.
#
# Requires the API to be running and the database to be seeded. Override how
# mongosh is reached with MONGO_SH if you are not using the Docker container:
#   MONGO_SH="mongosh --quiet pizza_delivery" bash tests/api-smoke.sh
#
# Real Razorpay test credentials are not available here, so gateway order
# creation is expected to fail cleanly (asserted in test 9b). Everything
# downstream of it — signature verification, stock decrement, idempotency,
# status transitions — is exercised for real by inserting an order document
# exactly as the server would after a successful gateway call.
set -u
API="${API_URL:-http://localhost:5000/api}"
MONGO_SH="${MONGO_SH:-sudo docker exec -i pizza-mongo mongosh --quiet pizza_delivery}"
PASS=0
FAIL=0

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  ✅ $1 ($2)"; PASS=$((PASS+1));
  else echo "  ❌ $1 — expected $3, got $2"; FAIL=$((FAIL+1)); fi
}

# Runs a mongosh script and prints its output.
mongo() { $MONGO_SH --eval "$1"; }
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }
# mongosh renders ObjectId('...'); extract the bare hex.
oid() { mongo "$1" | sed -E "s/.*ObjectId\('([0-9a-f]+)'\).*/\1/" | tr -d '\r'; }

EMAIL="smoke$(date +%s)@example.com"
echo "== Using $EMAIL =="

echo "-- 1. Register"
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke User\",\"email\":\"$EMAIL\",\"password\":\"Passw0rd123\"}" \
  | grep -q '"success":true' && check "register ok" "1" "1" || check "register ok" "0" "1"

echo "-- 2. Login before verify must be 403"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd123\"}")
check "unverified login blocked" "$CODE" "403"

echo "-- 3. Verification token is stored hashed (never plaintext)"
HASH=$(mongo "db.users.findOne({email:'$EMAIL'}).verificationTokenHash" | tr -d '\r')
check "verification hash is 64-char sha256" "${#HASH}" "64"

echo "-- 4. Invalid verify token must 400"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/auth/verify-email \
  -H 'Content-Type: application/json' -d '{"token":"not-a-real-token"}')
check "bad verify token rejected" "$CODE" "400"

echo "-- 5. Forgot password is enumeration-safe"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"nobody-here@example.com"}')
check "forgot-password generic 200" "$CODE" "200"

echo "-- 6. Admin login"
ATOKEN=$(curl -s -X POST $API/admin/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@pizzadelivery.test","password":"Admin@12345"}' | jget "d['token']")
check "admin token issued" "$([ -n "$ATOKEN" ] && echo 1 || echo 0)" "1"

echo "-- 7. Admin endpoint refuses a non-admin token"
mongo "db.users.updateOne({email:'$EMAIL'},{\$set:{isVerified:true}})" > /dev/null
CTOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd123\"}" | jget "d['token']")
check "customer token issued" "$([ -n "$CTOKEN" ] && echo 1 || echo 0)" "1"
CODE=$(curl -s -o /dev/null -w "%{http_code}" $API/admin/inventory -H "Authorization: Bearer $CTOKEN")
check "customer blocked from admin" "$CODE" "403"

echo "-- 8. /auth/me"
NAME=$(curl -s $API/auth/me -H "Authorization: Bearer $CTOKEN" | jget "d['user']['name']")
check "me returns name" "$NAME" "Smoke User"

echo "-- 9a. Catalog + inventory"
TOTAL=$(curl -s $API/admin/inventory -H "Authorization: Bearer $ATOKEN" | jget "d['summary']['total']")
check "inventory total" "$TOTAL" "20"
PCOUNT=$(curl -s $API/pizzas | jget "d['count']")
check "menu pizza count" "$PCOUNT" "6"

echo "-- 9b. Order creation without valid gateway keys fails cleanly (no orphan order)"
CUSTID=$(oid "db.users.findOne({email:'$EMAIL'})._id")
PIZZA_ID=$(curl -s $API/pizzas | jget "d['pizzas'][0]['id']")
ADDR='{"line1":"1 Test St","city":"Pune","postalCode":"411001","phone":"9999999999"}'
BEFORE=$(mongo "db.orders.countDocuments({user:ObjectId('$CUSTID')})" | tr -d '\r')
RESP=$(curl -s -w '\n%{http_code}' -X POST $API/orders -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"items\":[{\"kind\":\"menu\",\"pizzaId\":\"$PIZZA_ID\",\"quantity\":2}],\"deliveryAddress\":$ADDR}")
CODE=$(echo "$RESP" | tail -1)
check "gateway failure surfaced as 502" "$CODE" "502"
echo "$RESP" | head -1 | grep -q 'Could not start payment' && check "error names the cause" "1" "1" || check "error names the cause" "0" "1"
AFTER=$(mongo "db.orders.countDocuments({user:ObjectId('$CUSTID')})" | tr -d '\r')
check "no orphan order left behind" "$BEFORE" "$AFTER"

echo "-- 10. Quantity above the per-line cap is rejected (400)"
BASE=$(curl -s $API/ingredients | jget "[i['id'] for i in d['ingredients'] if i['category']=='base'][0]")
SAUCE=$(curl -s $API/ingredients | jget "[i['id'] for i in d['ingredients'] if i['category']=='sauce'][0]")
CHEESE=$(curl -s $API/ingredients | jget "[i['id'] for i in d['ingredients'] if i['category']=='cheese'][0]")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/orders -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"items\":[{\"kind\":\"custom\",\"baseId\":\"$BASE\",\"sauceId\":\"$SAUCE\",\"cheeseId\":\"$CHEESE\",\"veggieIds\":[],\"quantity\":999}],\"deliveryAddress\":$ADDR}")
check "over-cap quantity rejected" "$CODE" "400"

echo "-- 11. Stock shortage inside the allowed quantity is rejected by stock rules (409)"
CAPSID=$(oid "db.ingredients.findOne({name:'Capsicum'})._id")
ORIG=$(mongo "db.ingredients.findOne({name:'Capsicum'}).stock" | tr -d '\r')
mongo "db.ingredients.updateOne({name:'Capsicum'},{\$set:{stock:2}})" > /dev/null
RESP=$(curl -s -w '\n%{http_code}' -X POST $API/orders -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"items\":[{\"kind\":\"custom\",\"baseId\":\"$BASE\",\"sauceId\":\"$SAUCE\",\"cheeseId\":\"$CHEESE\",\"veggieIds\":[\"$CAPSID\"],\"quantity\":10}],\"deliveryAddress\":$ADDR}")
CODE=$(echo "$RESP" | tail -1)
check "stock shortage rejected" "$CODE" "409"
echo "$RESP" | head -1 | grep -q 'left in stock' && check "shortage names ingredient" "1" "1" || check "shortage names ingredient" "0" "1"
mongo "db.ingredients.updateOne({name:'Capsicum'},{\$set:{stock:$ORIG}})" > /dev/null

echo "-- 12. Unauthenticated order creation must 401"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/orders -H 'Content-Type: application/json' -d '{}')
check "order requires auth" "$CODE" "401"

# --- Seed an order the way the server does after a successful gateway call ---
RZP="order_smoke$(date +%s)"
BASEID=$(oid "db.ingredients.findOne({name:'Classic Hand Tossed'})._id")
SAUCEID=$(oid "db.ingredients.findOne({name:'Classic Tomato'})._id")
CHEESEID=$(oid "db.ingredients.findOne({name:'Mozzarella'})._id")
STOCK_BEFORE=$(mongo "db.ingredients.findOne({name:'Capsicum'}).stock" | tr -d '\r')
echo "== seeded razorpay order id: $RZP =="
mongo "
db.orders.insertOne({
  user: ObjectId('$CUSTID'),
  items: [{
    kind:'custom', name:'Custom — smoke',
    ingredientIds:[ObjectId('$BASEID'),ObjectId('$SAUCEID'),ObjectId('$CHEESEID'),ObjectId('$CAPSID')],
    stockUsage:[{ingredient:ObjectId('$BASEID'),quantity:1},{ingredient:ObjectId('$SAUCEID'),quantity:1},{ingredient:ObjectId('$CHEESEID'),quantity:1},{ingredient:ObjectId('$CAPSID'),quantity:1}],
    unitPrice:300, quantity:3
  }],
  itemsTotal:900, taxAmount:45, deliveryFee:0, totalAmount:945, currency:'INR',
  deliveryAddress:{line1:'1 Test St',line2:'',city:'Pune',state:'MH',postalCode:'411001',phone:'9999999999'},
  paymentStatus:'Pending', orderStatus:'Pending Payment', razorpayOrderId:'$RZP',
  razorpayPaymentId:'', razorpaySignature:'',
  statusHistory:[{status:'Pending Payment',at:new Date(),note:'seeded'}],
  createdAt:new Date(), updatedAt:new Date()
})" > /dev/null

echo "-- 13. Payment verify with a BAD signature must 400 and mark the order Failed"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/payments/verify -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"razorpay_order_id\":\"$RZP\",\"razorpay_payment_id\":\"pay_smoke1\",\"razorpay_signature\":\"deadbeef\"}")
check "bad signature rejected" "$CODE" "400"
PS=$(mongo "db.orders.findOne({razorpayOrderId:'$RZP'}).paymentStatus" | tr -d '\r')
check "order marked Failed" "$PS" "Failed"

echo "-- 14. Good signature confirms payment and decrements stock"
GOODSIG=$(python3 -c "import hmac,hashlib;print(hmac.new(b'dummysecret123',('$RZP'+'|'+'pay_smoke1').encode(),hashlib.sha256).hexdigest())")
VERIFY=$(curl -s -X POST $API/payments/verify -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"razorpay_order_id\":\"$RZP\",\"razorpay_payment_id\":\"pay_smoke1\",\"razorpay_signature\":\"$GOODSIG\"}")
check "payment verified" "$(echo "$VERIFY" | jget "d['success']")" "True"
check "order status Received" "$(echo "$VERIFY" | jget "d['order']['orderStatus']")" "Received"
check "payment status Paid" "$(echo "$VERIFY" | jget "d['order']['paymentStatus']")" "Paid"
STOCK_AFTER=$(mongo "db.ingredients.findOne({name:'Capsicum'}).stock" | tr -d '\r')
check "stock decremented by 3" "$((STOCK_BEFORE - STOCK_AFTER))" "3"

echo "-- 15. Replayed verify is idempotent (no double stock decrement)"
curl -s -X POST $API/payments/verify -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CTOKEN" \
  -d "{\"razorpay_order_id\":\"$RZP\",\"razorpay_payment_id\":\"pay_smoke1\",\"razorpay_signature\":\"$GOODSIG\"}" > /dev/null
STOCK_REPLAY=$(mongo "db.ingredients.findOne({name:'Capsicum'}).stock" | tr -d '\r')
check "stock unchanged on replay" "$STOCK_AFTER" "$STOCK_REPLAY"
OID=$(oid "db.orders.findOne({razorpayOrderId:'$RZP'})._id")

echo "-- 16. Admin can make a legal transition (Received -> In Kitchen)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $API/admin/orders/$OID/status \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ATOKEN" -d '{"status":"In Kitchen"}')
check "valid transition accepted" "$CODE" "200"

echo "-- 17. Illegal transition (In Kitchen -> Delivered) must 400"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $API/admin/orders/$OID/status \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $ATOKEN" -d '{"status":"Delivered"}')
check "invalid transition rejected" "$CODE" "400"

echo "-- 18. Customer cannot read another customer's order (403)"
OTHER="nosy$(date +%s)@example.com"
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d "{\"name\":\"Nosy\",\"email\":\"$OTHER\",\"password\":\"Passw0rd123\"}" > /dev/null
mongo "db.users.updateOne({email:'$OTHER'},{\$set:{isVerified:true}})" > /dev/null
OTOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OTHER\",\"password\":\"Passw0rd123\"}" | jget "d['token']")
CODE=$(curl -s -o /dev/null -w "%{http_code}" $API/orders/$OID -H "Authorization: Bearer $OTOKEN")
check "other customer blocked" "$CODE" "403"

echo "-- 19. Owner can read their own order"
CODE=$(curl -s -o /dev/null -w "%{http_code}" $API/orders/$OID -H "Authorization: Bearer $CTOKEN")
check "owner can read order" "$CODE" "200"

echo "-- 20. /orders/mine lists the customer's orders"
COUNT=$(curl -s $API/orders/mine -H "Authorization: Bearer $CTOKEN" | jget "len(d['orders'])")
check "my orders includes the order" "$([ "${COUNT:-0}" -ge 1 ] && echo 1 || echo 0)" "1"

echo
echo "===================================="
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "===================================="
exit $FAIL
