import React, { useEffect, useState } from "react";
import { api } from "../api/client";

function Stat({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function BarRow({ label, value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm mb-2">
      <div className="w-32 truncate text-slate-600">{label}</div>
      <div className="flex-1 bg-slate-100 rounded h-3 overflow-hidden">
        <div className="bg-slate-700 h-3" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right text-slate-500">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [ragStats, setRagStats] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);

  useEffect(() => {
    api.ragStats().then(setRagStats);
    api.complaintStats().then(setComplaintStats);
  }, []);

  const catMax = complaintStats ? Math.max(1, ...Object.values(complaintStats.by_category)) : 1;
  const urgMax = complaintStats ? Math.max(1, ...Object.values(complaintStats.by_urgency)) : 1;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-800 mb-4">Tableau de bord</h1>

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Assistant IA</h2>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Stat label="Questions posées" value={ragStats?.total_questions ?? "…"} />
        <Stat label="Utiles" value={ragStats?.helpful_count ?? "…"} />
        <Stat label="Pas utiles" value={ragStats?.not_helpful_count ?? "…"} />
        <Stat
          label="Temps moyen"
          value={ragStats ? `${Math.round(ragStats.avg_response_time_ms)} ms` : "…"}
        />
      </div>

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Réclamations</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Total" value={complaintStats?.total ?? "…"} />
        <Stat
          label="Temps moyen de résolution"
          value={
            complaintStats?.avg_resolution_hours != null
              ? `${complaintStats.avg_resolution_hours.toFixed(1)} h`
              : "—"
          }
        />
        <Stat label="Questions les + posées" value={ragStats?.top_questions?.length ?? 0} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Par catégorie</h3>
          {complaintStats &&
            Object.entries(complaintStats.by_category).map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={catMax} />
            ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Par urgence</h3>
          {complaintStats &&
            Object.entries(complaintStats.by_urgency).map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={urgMax} />
            ))}
        </div>
      </div>

      {ragStats?.top_questions?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Questions les plus posées</h3>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
            {ragStats.top_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
