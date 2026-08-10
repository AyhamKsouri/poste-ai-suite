import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import Icon from "../components/Icon";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@poste.tn");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-margin-mobile"
      style={{ background: "linear-gradient(135deg, #f8f9ff 0%, #dce9ff 100%)" }}
    >
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 50%, rgba(23,69,159,0.06) 0%, transparent 50%), radial-gradient(circle at 85% 30%, rgba(23,69,159,0.08) 0%, transparent 50%)",
        }}
      />

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-panel p-8 md:p-10"
      >
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded bg-secondary-container flex items-center justify-center">
              <Icon name="mail" className="text-on-secondary-container" style={{ fontSize: 24 }} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-headline-sm text-primary">La Poste Tunisienne</span>
              <span className="text-label-md text-on-surface-variant uppercase tracking-widest -mt-0.5">
                Institution Nationale
              </span>
            </div>
          </div>
          <h1 className="text-headline-md text-on-surface mb-2">Poste AI Suite</h1>
          <p className="text-body-md text-on-surface-variant">
            Veuillez vous authentifier pour accéder à la plateforme interne.
          </p>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-label-md text-on-surface block" htmlFor="email">
            Adresse électronique
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-outline pointer-events-none">
              <Icon name="person" />
            </span>
            <input
              id="email"
              type="email"
              required
              className="w-full pl-10 pr-3 py-3 border border-outline-variant rounded bg-surface-container-lowest text-body-md text-on-surface focus:outline-none focus:border-secondary-container focus:ring-2 focus:ring-secondary-container/20 transition-colors"
              placeholder="prenom.nom@poste.tn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-label-md text-on-surface block" htmlFor="password">
            Mot de passe
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-outline pointer-events-none">
              <Icon name="lock" />
            </span>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              className="w-full pl-10 pr-10 py-3 border border-outline-variant rounded bg-surface-container-lowest text-body-md text-on-surface focus:outline-none focus:border-secondary-container focus:ring-2 focus:ring-secondary-container/20 transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-on-surface transition-colors"
            >
              <Icon name={showPassword ? "visibility" : "visibility_off"} />
            </button>
          </div>
        </div>

        {error && <p className="text-body-sm text-error mb-4">{error}</p>}

        <button
          disabled={busy}
          className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded bg-primary-container text-on-primary hover:bg-primary text-label-md uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          <Icon name="login" style={{ fontSize: 18 }} />
          {busy ? "Connexion..." : "Se connecter"}
        </button>

        <div className="mt-8 text-center border-t border-outline-variant pt-6">
          <p className="text-body-sm text-outline flex items-center justify-center gap-1">
            <Icon name="shield" style={{ fontSize: 16 }} />
            Accès restreint au personnel autorisé
          </p>
          <p className="text-body-sm text-on-surface-variant mt-3">
            Compte admin par défaut : admin@poste.tn / admin123
          </p>
        </div>
      </form>
    </div>
  );
}
