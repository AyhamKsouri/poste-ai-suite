import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import Icon from "../components/Icon";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_STYLE, URGENCY_DOT, URGENCY_LABEL, URGENCY_STYLE } from "../constants";

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "", raw_text: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // QA audit finding M3: load() previously had no error handling at all - a
  // failed request left `loading` stuck true forever, showing "Chargement..."
  // indefinitely with no way to recover short of a manual reload.
  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.listComplaints(filters);
      setComplaints(data);
    } catch (err) {
      setLoadError(err.message || "Échec du chargement des réclamations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitComplaint(form);
      setForm({ customer_name: "", customer_contact: "", raw_text: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setSubmitError(err.message || "Échec de l'envoi de la réclamation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-headline-lg text-on-surface">Triage des réclamations</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Gérez et répondez aux requêtes client avec l&apos;assistance de l&apos;IA.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg text-label-md hover:bg-primary-container transition-colors shadow-sm self-start"
        >
          <Icon name={showForm ? "close" : "add"} style={{ fontSize: 18 }} />
          {showForm ? "Annuler" : "Nouvelle réclamation"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-card p-5 mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border border-outline-variant rounded px-3 py-2 text-body-sm bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary-container/30 focus:border-secondary-container"
              placeholder="Nom du client"
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            />
            <input
              className="border border-outline-variant rounded px-3 py-2 text-body-sm bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary-container/30 focus:border-secondary-container"
              placeholder="Contact (email/téléphone)"
              value={form.customer_contact}
              onChange={(e) => setForm({ ...form, customer_contact: e.target.value })}
            />
          </div>
          <textarea
            className="w-full border border-outline-variant rounded px-3 py-2 text-body-sm bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary-container/30 focus:border-secondary-container"
            rows={4}
            placeholder="Texte de la réclamation..."
            value={form.raw_text}
            onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
            required
          />
          {submitError && (
            <p className="text-body-sm text-error bg-error-container/40 border border-error/30 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}
          <button
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            {submitting && <Icon name="autorenew" style={{ fontSize: 16 }} />}
            {submitting ? "Analyse IA en cours..." : "Soumettre et analyser"}
          </button>
        </form>
      )}

      <div className="flex bg-surface-container-highest rounded-lg p-1 border border-outline-variant mb-4 w-fit text-body-sm">
        {["", "new", "reviewed", "replied"].map((s) => (
          <button
            key={s}
            onClick={() => setFilters((f) => ({ ...f, status: s || undefined }))}
            className={`px-3 py-1.5 rounded-md text-label-md transition-colors ${
              (filters.status || "") === s
                ? "bg-surface-container-lowest shadow-sm text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {s ? STATUS_LABEL[s] : "Tous"}
          </button>
        ))}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant shadow-card rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="py-3 px-4 text-label-md text-on-surface-variant uppercase tracking-wider">Client</th>
              <th className="py-3 px-4 text-label-md text-on-surface-variant uppercase tracking-wider">Catégorie</th>
              <th className="py-3 px-4 text-label-md text-on-surface-variant uppercase tracking-wider">Urgence</th>
              <th className="py-3 px-4 text-label-md text-on-surface-variant uppercase tracking-wider">Statut</th>
              <th className="py-3 px-4 text-label-md text-on-surface-variant uppercase tracking-wider">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {loading && (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant text-body-sm" colSpan={5}>
                  Chargement...
                </td>
              </tr>
            )}
            {!loading && loadError && (
              <tr>
                <td className="px-4 py-6 text-body-sm" colSpan={5}>
                  <div className="flex items-center justify-between gap-3 text-error">
                    <span>{loadError}</span>
                    <button
                      onClick={load}
                      className="px-3 py-1.5 rounded-md border border-error/30 hover:bg-error-container/30 transition-colors shrink-0"
                    >
                      Réessayer
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !loadError && complaints.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-on-surface-variant text-body-sm" colSpan={5}>
                  Aucune réclamation.
                </td>
              </tr>
            )}
            {complaints.map((c) => (
              <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/complaints/${c.id}`} className="text-on-surface font-medium hover:text-primary transition-colors">
                    {c.customer_name || "(anonyme)"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                  {c.categories && c.categories.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.categories.map((cat) => (
                        <span
                          key={cat}
                          className="px-2 py-0.5 rounded-full text-[11px] bg-surface-container-highest text-on-surface-variant border border-outline-variant"
                        >
                          {CATEGORY_LABEL[cat] || cat}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.urgency ? (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${URGENCY_STYLE[c.urgency] || ""}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${URGENCY_DOT[c.urgency] || "bg-outline"}`} />
                      {URGENCY_LABEL[c.urgency] || c.urgency}
                    </span>
                  ) : (
                    <span className="text-on-surface-variant text-body-sm">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-label-md px-2 py-1 rounded ${STATUS_STYLE[c.status] || "text-on-surface-variant"}`}>
                    {STATUS_LABEL[c.status] || c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-on-surface-variant text-body-sm">
                  {new Date(c.created_at).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
