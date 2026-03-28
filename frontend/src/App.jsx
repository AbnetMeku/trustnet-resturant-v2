import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import CashierDashboard from './pages/CashierDashboard';
import WaiterDashboard from './pages/WaiterDashboard';
import WaiterLogin from './pages/WaiterLogin';
import StationLogin from './pages/StationLogin';
import KDS from './pages/KDS';
import InventoryDashboard from './pages/InventoryDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useBranding } from './hooks/useBranding';
import { Toaster } from "react-hot-toast";
// ----------------- Protected Route for normal users ----------------- //
function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" />;
  return children;
}

// ----------------- Protected Route for stations ----------------- //
function StationProtectedRoute({ children }) {
  const token = localStorage.getItem('station_token');
  if (!token) return <Navigate to="/station-login" />;
  return children;
}

// ----------------- Protected Route for waiters ----------------- //
function WaiterProtectedRoute({ children }) {
  const token = localStorage.getItem('auth_token');
  const user = JSON.parse(localStorage.getItem('user'));
  if (!token || !user || user.role !== 'waiter') return <Navigate to="/waiter-login" />;
  return children;
}


function LowPowerModeToggle() {
  const location = useLocation();
  const branding = useBranding();

  useEffect(() => {
    const lowPowerRoutes = ["/waiter", "/waiter-login", "/kds", "/station-login"];
    const isLowPower = lowPowerRoutes.some((route) => location.pathname.startsWith(route));
    const isEnabled = branding?.low_power_mode_enabled !== false;
    const root = document.documentElement;

    if (isLowPower && isEnabled) {
      root.classList.add("low-power");
    } else {
      root.classList.remove("low-power");
    }

    return () => root.classList.remove("low-power");
  }, [location.pathname, branding?.low_power_mode_enabled]);

  return null;
}

// ----------------- App Component ----------------- //
function App() {
  return (
    <AuthProvider>
      <Router>
        <LowPowerModeToggle />
        {/* ----------------- Toaster for global toast notifications ----------------- */}
        <Toaster
          position="top-center" // position does not matter for custom, but good practice
          containerStyle={{ top: 0, left: 0, right: 0, bottom: 0 }} // ensure full screen
        />
        <Routes>
          {/* ----------------- Login Pages ----------------- */}
          <Route path="/login" element={<Login />} />
          <Route path="/waiter-login" element={<WaiterLogin />} />
          <Route path="/station-login" element={<StationLogin />} />

          {/* ----------------- Admin & Manager & Cashier ----------------- */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager"
            element={
              <ProtectedRoute roles={['manager']}>
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cashier"
            element={
              <ProtectedRoute roles={['cashier']}>
                <CashierDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute roles={['admin', 'manager']}>
                <InventoryDashboard />
              </ProtectedRoute>
            }
          />

          {/* ----------------- Waiter (PIN) ----------------- */}
          <Route
            path="/waiter"
            element={
              <WaiterProtectedRoute>
                <WaiterDashboard />
              </WaiterProtectedRoute>
            }
          />

          {/* ----------------- Station KDS (PIN) ----------------- */}
          <Route
            path="/kds"
            element={
              <StationProtectedRoute>
                <KDS />
              </StationProtectedRoute>
            }
          />

          {/* ----------------- Catch-all ----------------- */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
