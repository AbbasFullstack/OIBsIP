import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import ProtectedRoute, { AdminRoute } from './routes/ProtectedRoute.jsx';

import Dashboard from './pages/user/Dashboard.jsx';
import CustomPizzaBuilder from './pages/user/CustomPizzaBuilder.jsx';
import Cart from './pages/user/Cart.jsx';
import MyOrders from './pages/user/MyOrders.jsx';
import OrderTracking from './pages/user/OrderTracking.jsx';

import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import VerifyEmail from './pages/auth/VerifyEmail.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import AdminLogin from './pages/auth/AdminLogin.jsx';

import AdminOrders from './pages/admin/Orders.jsx';
import AdminInventory from './pages/admin/Inventory.jsx';

import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      {/* Auth screens sit outside the customer layout (no cart/nav chrome). */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/build" element={<CustomPizzaBuilder />} />
        <Route path="/cart" element={<Cart />} />

        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute>
              <OrderTracking />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/orders" replace />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="inventory" element={<AdminInventory />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}