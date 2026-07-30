import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@poste.tn");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/assistant");
    } catch (err) {
      setError(err.message || "Échec de connexion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-8 w-full max-w-sm border border-slate-200">
        <h1 className="text-xl font-bold text-slate-800 mb-1">La Poste Tunisienne</h1>
        <p className="text-sm text-slate-500 mb-6">Suite IA — connexion agent</p>

        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
        <input
          className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          disabled={busy}
          className="w-full bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Connexion..." : "Se connecter"}
        </button>

        <p className="text-xs text-slate-400 mt-4">
          Compte admin par défaut : admin@poste.tn / admin123
        </p>
      </form>
    </div>
  );
}
