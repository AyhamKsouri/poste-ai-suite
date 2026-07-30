import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md text-sm font-medium ${
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-200"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-slate-800">La Poste Tunisienne · AI Suite</span>
            <nav className="flex gap-1">
              <NavItem to="/assistant">Assistant</NavItem>
              <NavItem to="/complaints">Réclamations</NavItem>
              {user?.role === "admin" && <NavItem to="/dashboard">Dashboard</NavItem>}
              {user?.role === "admin" && <NavItem to="/documents">Documents</NavItem>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user?.full_name} <span className="text-slate-400">({user?.role})</span>
            </span>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-slate-500 hover:text-slate-800"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
