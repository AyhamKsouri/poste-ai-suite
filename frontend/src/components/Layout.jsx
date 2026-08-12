import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import Icon from "./Icon";
import logo from "../assets/logo.png";

function NavItem({ to, icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 border-l-4 ${
          isActive
            ? "text-on-primary font-bold border-secondary-container bg-primary-fixed-dim/10"
            : "text-on-primary/70 border-transparent hover:text-on-primary hover:bg-on-primary/10"
        }`
      }
    >
      <Icon name={icon} />
      <span className="text-body-md">{children}</span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-surface">
      <nav className="fixed left-0 top-0 h-screen w-sidebar-width bg-primary text-on-primary flex flex-col py-8 px-4 shadow-md z-50">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 p-1">
            <img src={logo} alt="La Poste Tunisienne" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-headline-sm font-bold text-on-primary truncate">Poste AI Suite</h1>
            <p className="text-label-md text-on-primary/70 uppercase tracking-widest">La Poste Tunisienne</p>
          </div>
        </div>

        <ul className="flex-1 flex flex-col gap-2">
          <li>
            <NavItem to="/assistant" icon="smart_toy">
              Assistant
            </NavItem>
          </li>
          <li>
            <NavItem to="/complaints" icon="forum">
              Réclamations
            </NavItem>
          </li>
          {user?.role === "admin" && (
            <li>
              <NavItem to="/documents" icon="description">
                Documents
              </NavItem>
            </li>
          )}
          {user?.role === "admin" && (
            <li>
              <NavItem to="/dashboard" icon="dashboard">
                Tableau de bord
              </NavItem>
            </li>
          )}
        </ul>

        <div className="mt-auto pt-4 border-t border-on-primary/10">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-on-primary/10 flex items-center justify-center text-body-sm font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-on-primary truncate">{user?.full_name}</p>
              <p className="text-label-md text-on-primary/60 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-on-primary/70 hover:text-on-primary hover:bg-on-primary/10 transition-colors duration-200"
          >
            <Icon name="logout" />
            <span className="text-body-md">Déconnexion</span>
          </button>
        </div>
      </nav>

      <main className="ml-sidebar-width min-h-screen p-margin-desktop max-w-container-max mx-auto">
        {children}
      </main>
    </div>
  );
}
