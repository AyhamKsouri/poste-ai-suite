import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import Icon from "./Icon";
import logo from "../assets/logo.png";

function NavItem({ to, icon, children, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
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
  // QA audit finding H2: the sidebar used to be a fixed 260px-wide element
  // with margin-left:260px on the content area and no responsive override at
  // any breakpoint - on a 375px phone that left ~115px for all page content.
  // It's now an off-canvas drawer below the `md` breakpoint, permanently
  // visible (as before) at `md` and above.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-surface">
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-primary text-on-primary flex items-center gap-3 px-4 shadow-md z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
          className="p-1 -ml-1 rounded hover:bg-on-primary/10 transition-colors"
        >
          <Icon name="menu" />
        </button>
        <span className="text-body-md font-bold truncate">Poste AI Suite</span>
      </header>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <nav
        className={`fixed left-0 top-0 h-screen w-sidebar-width bg-primary text-on-primary flex flex-col py-8 px-4 shadow-md z-50 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 p-1">
            <img src={logo} alt="La Poste Tunisienne" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-headline-sm font-bold text-on-primary truncate">Poste AI Suite</h1>
            <p className="text-label-md text-on-primary/70 uppercase tracking-widest">La Poste Tunisienne</p>
          </div>
          <button
            onClick={closeSidebar}
            aria-label="Fermer le menu"
            className="md:hidden p-1 rounded hover:bg-on-primary/10 transition-colors shrink-0"
          >
            <Icon name="close" />
          </button>
        </div>

        <ul className="flex-1 flex flex-col gap-2">
          <li>
            <NavItem to="/assistant" icon="smart_toy" onNavigate={closeSidebar}>
              Assistant
            </NavItem>
          </li>
          <li>
            <NavItem to="/complaints" icon="forum" onNavigate={closeSidebar}>
              Réclamations
            </NavItem>
          </li>
          {user?.role === "admin" && (
            <li>
              <NavItem to="/documents" icon="description" onNavigate={closeSidebar}>
                Documents
              </NavItem>
            </li>
          )}
          {user?.role === "admin" && (
            <li>
              <NavItem to="/dashboard" icon="dashboard" onNavigate={closeSidebar}>
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

      <main className="md:ml-sidebar-width min-h-screen pt-14 md:pt-0 p-margin-mobile md:p-margin-desktop max-w-container-max mx-auto">
        {children}
      </main>
    </div>
  );
}
