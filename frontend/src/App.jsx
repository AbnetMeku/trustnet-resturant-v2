import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import CashierDashboard from './pages/CashierDashboard';
import WaiterDashboard from './pages/WaiterDashboard';
import WaiterLogin from './pages/WaiterLogin';
import StationLogin from './pages/StationLogin';
import KDS from './pages/KDS';
import { AuthProvider, useAuth } from './context/AuthContext';

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

// ----------------- App Component ----------------- //
function App() {
  return (
    <AuthProvider>
      <Router>
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
