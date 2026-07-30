import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Assistant from "./pages/Assistant";
import Complaints from "./pages/Complaints";
import ComplaintDetail from "./pages/ComplaintDetail";
import Dashboard from "./pages/Dashboard";
import AdminDocuments from "./pages/AdminDocuments";

function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-400">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/assistant" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/assistant"
        element={
          <Protected>
            <Assistant />
          </Protected>
        }
      />
      <Route
        path="/complaints"
        element={
          <Protected>
            <Complaints />
          </Protected>
        }
      />
      <Route
        path="/complaints/:id"
        element={
          <Protected>
            <ComplaintDetail />
          </Protected>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Protected adminOnly>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/documents"
        element={
          <Protected adminOnly>
            <AdminDocuments />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/assistant" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
