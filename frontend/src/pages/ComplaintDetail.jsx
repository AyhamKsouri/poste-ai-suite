import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function ComplaintDetail() {
  const { id } = useParams();
  const [complaint, setComplaint] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const c = await api.getComplaint(id);
    setComplaint(c);
    setReply(c.final_reply || c.draft_reply || "");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSend(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.replyComplaint(id, reply);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!complaint) return <p className="text-slate-400">Chargement...</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/complaints" className="text-sm text-slate-500 hover:underline">
        ← Retour
      </Link>
      <h1 className="text-lg font-bold text-slate-800 mt-2 mb-4">
        Réclamation de {complaint.customer_name || "(anonyme)"}
      </h1>

      <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-slate-400">Catégorie</div>
          <div className="font-medium">{complaint.category}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-slate-400">Urgence</div>
          <div className="font-medium">{complaint.urgency}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-slate-400">Statut</div>
          <div className="font-medium">{complaint.status}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Texte original</h2>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{complaint.raw_text}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Résumé IA</h2>
        <p className="text-sm text-slate-600">{complaint.ai_summary}</p>
      </div>

      <form onSubmit={handleSend} className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          Réponse {complaint.status === "replied" ? "envoyée" : "(brouillon IA — modifiable)"}
        </h2>
        <textarea
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-3"
          rows={8}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={complaint.status === "replied"}
        />
        {complaint.status !== "replied" && (
          <button
            disabled={busy}
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Envoi..." : "Approuver et envoyer"}
          </button>
        )}
        {complaint.status === "replied" && complaint.final_reply !== complaint.draft_reply && (
          <p className="text-xs text-slate-400 mt-2">
            Note : cette réponse a été modifiée par l'agent avant envoi (brouillon IA original conservé
            dans l'historique).
          </p>
        )}
      </form>
    </div>
  );
}
