// Verifies the real-time contract end to end using the public API plus a socket
// connection:
//  - an unauthenticated handshake is rejected
//  - an authenticated customer socket receives order:statusUpdated
//    when an admin advances their order
import { io } from 'socket.io-client';
import { execFileSync } from 'node:child_process';

const URL = process.env.SOCKET_URL || 'http://localhost:5000';
const api = (p, opts = {}) =>
  fetch(`${URL}/api${p}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

// Runs a mongosh script by piping it over stdin (avoids quoting pitfalls).
// Override with MONGO_SH if you are not using the Docker container, e.g.
//   MONGO_SH="mongosh --quiet pizza_delivery" node tests/socket-check.mjs
const mongoCmd = process.env.MONGO_SH || 'sudo docker exec -i pizza-mongo mongosh --quiet pizza_delivery';
const mongo = (script) => {
  const [bin, ...args] = mongoCmd.split(' ');
  return execFileSync(bin, args, { input: script }).toString().trim();
};

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  ok ? pass++ : fail++;
};

// --- unauthenticated socket ---
const unauth = io(URL, { transports: ['websocket'], reconnection: false });
const unauthOutcome = await new Promise((resolve) => {
  const t = setTimeout(() => resolve('timeout'), 6000);
  unauth.on('connect', () => {
    clearTimeout(t);
    resolve('connected');
  });
  unauth.on('connect_error', () => {
    clearTimeout(t);
    resolve('rejected');
  });
});
check('unauthenticated socket rejected', unauthOutcome === 'rejected');
unauth.close();

// --- authenticated customer socket ---
const email = `sock${Date.now()}@example.com`;
await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ name: 'Socket User', email, password: 'Passw0rd123' }),
});
// No real inbox in the sandbox, so mark the account verified before logging in.
mongo(`db.users.updateOne({email:'${email}'},{$set:{isVerified:true}})`);

const token = (
  await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Passw0rd123' }),
  })
).body.token;
check('customer login succeeded', Boolean(token));

const adminToken = (
  await api('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@pizzadelivery.test', password: 'Admin@12345' }),
  })
).body.token;

// Seed a paid order, then move it along through the admin API.
const userId = (mongo(`print('USER:' + db.users.findOne({email:'${email}'})._id.toString())`).match(/USER:([0-9a-f]{24})/) || [])[1];
const RZP = `order_sock${Date.now()}`;
const out = mongo(`
const caps = db.ingredients.findOne({name:'Capsicum'});
const base = db.ingredients.findOne({name:'Classic Hand Tossed'});
const sauce = db.ingredients.findOne({name:'Classic Tomato'});
const cheese = db.ingredients.findOne({name:'Mozzarella'});
db.orders.insertOne({
  user: ObjectId('${userId}'),
  items:[{kind:'custom',name:'Socket pizza',
    ingredientIds:[base._id,sauce._id,cheese._id,caps._id],
    stockUsage:[{ingredient:base._id,quantity:1},{ingredient:sauce._id,quantity:1},{ingredient:cheese._id,quantity:1},{ingredient:caps._id,quantity:1}],
    unitPrice:200,quantity:1}],
  itemsTotal:200,taxAmount:10,deliveryFee:40,totalAmount:250,currency:'INR',
  deliveryAddress:{line1:'1 Test St',line2:'',city:'Pune',state:'MH',postalCode:'411001',phone:'9999999999'},
  paymentStatus:'Paid',orderStatus:'Received',razorpayOrderId:'${RZP}',
  razorpayPaymentId:'pay_sock',razorpaySignature:'',
  statusHistory:[{status:'Received',at:new Date(),note:'seeded'}],
  createdAt:new Date(),updatedAt:new Date()
});
print('ORDER:' + db.orders.findOne({razorpayOrderId:'${RZP}'})._id.toString());
`);
const orderId = (out.match(/ORDER:([0-9a-f]{24})/) || [])[1];
check('order seeded', Boolean(orderId));

const sock = io(URL, { transports: ['websocket'], auth: { token }, reconnection: false });
const received = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 9000);
  sock.on('connect', () => {
    sock.emit('order:subscribe', orderId);
    setTimeout(async () => {
      await api(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'In Kitchen' }),
      });
    }, 700);
  });
  sock.on('order:statusUpdated', (p) => {
    clearTimeout(t);
    resolve(p);
  });
  sock.on('connect_error', (e) => {
    clearTimeout(t);
    resolve({ error: e.message });
  });
});

check('authenticated socket received an update', Boolean(received?.orderStatus));
if (received?.orderStatus) console.log(`     pushed status: ${received.orderStatus}`);
sock.close();

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail);
