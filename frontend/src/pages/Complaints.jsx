import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const STATUS_LABEL = { new: "Nouveau", reviewed: "Analysé", replied: "Répondu" };
const URGENCY_COLOR = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_contact: "", raw_text: "" });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const data = await api.listComplaints(filters);
    setComplaints(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.submitComplaint(form);
      setForm({ customer_name: "", customer_contact: "", raw_text: "" });
      setShowForm(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-slate-800">Réclamations</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          {showForm ? "Annuler" : "+ Nouvelle réclamation"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="Nom du client"
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            />
            <input
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="Contact (email/téléphone)"
              value={form.customer_contact}
              onChange={(e) => setForm({ ...form, customer_contact: e.target.value })}
            />
          </div>
          <textarea
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            rows={4}
            placeholder="Texte de la réclamation..."
            value={form.raw_text}
            onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
            required
          />
          <button
            disabled={submitting}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Analyse IA en cours..." : "Soumettre et analyser"}
          </button>
        </form>
      )}

      <div className="flex gap-2 mb-3 text-sm">
        {["", "new", "reviewed", "replied"].map((s) => (
          <button
            key={s}
            onClick={() => setFilters((f) => ({ ...f, status: s || undefined }))}
            className={`px-3 py-1 rounded-md ${
              (filters.status || "") === s ? "bg-slate-900 text-white" : "bg-white border border-slate-200"
            }`}
          >
            {s ? STATUS_LABEL[s] : "Tous"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Client</th>
              <th className="px-4 py-2">Catégorie</th>
              <th className="px-4 py-2">Urgence</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  Chargement...
                </td>
              </tr>
            )}
            {!loading && complaints.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  Aucune réclamation.
                </td>
              </tr>
            )}
            {complaints.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/complaints/${c.id}`} className="text-slate-800 font-medium hover:underline">
                    {c.customer_name || "(anonyme)"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.category || "—"}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${URGENCY_COLOR[c.urgency] || ""}`}>
                    {c.urgency || "—"}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{STATUS_LABEL[c.status] || c.status}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">
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
