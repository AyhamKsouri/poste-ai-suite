import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import Icon from "../components/Icon";
import { CATEGORY_LABEL, STATUS_LABEL, URGENCY_LABEL } from "../constants";

const LOW_CONFIDENCE_THRESHOLD = 0.5;

export default function ComplaintDetail() {
  const { id } = useParams();
  const [complaint, setComplaint] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sendError, setSendError] = useState(null);

  // QA audit finding M3: load() previously had no error handling - a failed
  // request left the page stuck on "Chargement..." forever with no way out.
  async function load() {
    setLoadError(null);
    try {
      const c = await api.getComplaint(id);
      setComplaint(c);
      setReply(c.final_reply || c.draft_reply || "");
    } catch (err) {
      setLoadError(err.message || "Échec du chargement de la réclamation.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSend(e) {
    e.preventDefault();
    setBusy(true);
    setSendError(null);
    try {
      await api.replyComplaint(id, reply);
      await load();
    } catch (err) {
      setSendError(err.message || "Échec de l'envoi de la réponse.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 text-error bg-error-container/40 border border-error/30 rounded-lg px-4 py-3">
          <span>{loadError}</span>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-md border border-error/30 hover:bg-error-container/30 transition-colors shrink-0"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!complaint) return <p className="text-on-surface-variant">Chargement...</p>;

  const isReplied = complaint.status === "replied";
  const isLowConfidence =
    typeof complaint.confidence === "number" && complaint.confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/complaints" className="text-body-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <Icon name="arrow_back" style={{ fontSize: 16 }} />
        Retour
      </Link>
      <h1 className="text-headline-lg-mobile text-on-surface mt-3 mb-5">
        Réclamation de {complaint.customer_name || "(anonyme)"}
      </h1>

      {isLowConfidence && (
        <div className="flex items-center gap-2 text-body-sm text-on-error-container bg-error-container/50 border border-error/30 rounded-lg px-3 py-2 mb-3">
          <Icon name="warning" style={{ fontSize: 16 }} />
          Confiance IA faible sur cette classification — à vérifier manuellement.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3">
          <div className="text-label-md text-on-surface-variant uppercase">Catégorie</div>
          <div className="text-body-md font-medium text-on-surface mt-1">
            {complaint.category ? CATEGORY_LABEL[complaint.category] || complaint.category : "—"}
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3">
          <div className="text-label-md text-on-surface-variant uppercase">Urgence</div>
          <div className="text-body-md font-medium text-on-surface mt-1">
            {complaint.urgency ? URGENCY_LABEL[complaint.urgency] || complaint.urgency : "—"}
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3">
          <div className="text-label-md text-on-surface-variant uppercase">Statut</div>
          <div className="text-body-md font-medium text-on-surface mt-1">
            {STATUS_LABEL[complaint.status] || complaint.status}
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 mb-4 relative">
        <div className="absolute -top-3 left-4 bg-surface-container-lowest px-2 text-label-md text-outline">
          Message original
        </div>
        <p className="text-body-sm text-on-surface whitespace-pre-wrap pt-1">{complaint.raw_text}</p>
      </div>

      {complaint.ai_summary && (
        <div className="bg-surface-container-lowest border border-outline-variant border-l-4 border-l-secondary-container rounded-lg shadow-card overflow-hidden mb-4">
          <div className="bg-surface-container-low px-4 py-2.5 flex items-center gap-2 border-b border-outline-variant">
            <Icon name="auto_awesome" className="text-secondary-container" style={{ fontSize: 18 }} />
            <h4 className="text-label-md text-on-surface">Résumé IA</h4>
          </div>
          <p className="p-4 text-body-sm text-on-surface-variant">{complaint.ai_summary}</p>
        </div>
      )}

      <form onSubmit={handleSend} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4">
        <h2 className="text-label-md text-on-surface mb-2 flex items-center gap-1">
          Réponse {isReplied ? "envoyée" : "(brouillon IA — modifiable)"}
        </h2>
        <textarea
          className="w-full border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface bg-surface-container-lowest mb-3 focus:outline-none focus:ring-2 focus:ring-secondary-container/30 focus:border-secondary-container disabled:bg-surface-container-low disabled:text-on-surface-variant"
          rows={8}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={isReplied}
        />
        {sendError && (
          <p className="text-body-sm text-error bg-error-container/40 border border-error/30 rounded-lg px-3 py-2 mb-3">
            {sendError}
          </p>
        )}
        {!isReplied && (
          <button
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg text-label-md hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            <Icon name="send" style={{ fontSize: 18 }} />
            {busy ? "Envoi..." : "Approuver et envoyer"}
          </button>
        )}
        {isReplied && complaint.final_reply !== complaint.draft_reply && (
          <p className="text-body-sm text-on-surface-variant mt-2">
            Note : cette réponse a été modifiée par l'agent avant envoi (brouillon IA original conservé dans
            l'historique).
          </p>
        )}
      </form>
    </div>
  );
}
