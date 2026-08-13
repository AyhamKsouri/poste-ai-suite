import React, { useEffect, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { api } from "../api/client";
import Icon from "../components/Icon";
import { CATEGORY_LABEL, URGENCY_LABEL } from "../constants";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const NAVY = "#17459f";
const GOLD = "#fecb00";
const TEXT = "#434652";
const GRID = "#e2e8f0";
const URGENCY_COLOR = { high: "#ba1a1a", medium: GOLD, low: NAVY };

const chartFont = { family: "Geist", size: 12 };

function barOptions(horizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? "y" : "x",
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: !horizontal, color: GRID, drawBorder: false }, ticks: { color: TEXT, font: chartFont } },
      y: { grid: { display: horizontal, color: GRID, drawBorder: false }, ticks: { color: TEXT, font: chartFont } },
    },
  };
}

function Kpi({ icon, label, value }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card border border-outline-variant/30 flex flex-col gap-3">
      <div className="p-2.5 bg-surface-container rounded-lg text-primary-container w-fit">
        <Icon name={icon} />
      </div>
      <div>
        <h3 className="text-body-sm text-on-surface-variant uppercase tracking-wider mb-1">{label}</h3>
        <p className="text-headline-lg text-on-surface">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [ragStats, setRagStats] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // QA audit finding M3: neither call here had a .catch() - a failed
    // request left both stat panels stuck on their "…" loading placeholders
    // forever with no indication anything had gone wrong.
    api.ragStats().then(setRagStats).catch((err) => setError(err.message));
    api.complaintStats().then(setComplaintStats).catch((err) => setError(err.message));
  }, []);

  const satisfactionPct =
    ragStats && ragStats.helpful_count + ragStats.not_helpful_count > 0
      ? Math.round((ragStats.helpful_count / (ragStats.helpful_count + ragStats.not_helpful_count)) * 100)
      : null;

  const categoryKeys = complaintStats ? Object.keys(complaintStats.by_category) : [];
  const categoryLabels = categoryKeys.map((k) => CATEGORY_LABEL[k] || k);
  const categoryData = complaintStats ? Object.values(complaintStats.by_category) : [];
  const urgencyKeys = complaintStats ? Object.keys(complaintStats.by_urgency) : [];
  const urgencyLabels = urgencyKeys.map((k) => URGENCY_LABEL[k] || k);
  const urgencyData = complaintStats ? Object.values(complaintStats.by_urgency) : [];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-headline-lg text-on-surface">Tableau de bord</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Analyse des performances de l&apos;assistant IA et du traitement des réclamations.
        </p>
      </header>

      {error && (
        <div className="flex items-center gap-2 text-body-sm text-error bg-error-container/40 border border-error/30 rounded-lg px-4 py-3">
          <Icon name="error" style={{ fontSize: 16 }} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
        <Kpi icon="contact_support" label="Questions posées" value={ragStats?.total_questions ?? "…"} />
        <Kpi icon="forum" label="Réclamations totales" value={complaintStats?.total ?? "…"} />
        <Kpi
          icon="timer"
          label="Temps de réponse moyen"
          value={ragStats ? `${Math.round(ragStats.avg_response_time_ms)} ms` : "…"}
        />
        <Kpi icon="star_rate" label="Satisfaction assistant" value={satisfactionPct != null ? `${satisfactionPct}%` : "—"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card border border-outline-variant/30">
          <h3 className="text-body-sm text-on-surface-variant uppercase tracking-wider mb-1">
            Temps moyen de résolution
          </h3>
          <p className="text-headline-md text-on-surface">
            {complaintStats?.avg_resolution_hours != null ? `${complaintStats.avg_resolution_hours.toFixed(1)} h` : "—"}
          </p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card border border-outline-variant/30">
          <h3 className="text-body-sm text-on-surface-variant uppercase tracking-wider mb-1">Réponses utiles</h3>
          <p className="text-headline-md text-on-surface">{ragStats?.helpful_count ?? "…"}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card border border-outline-variant/30">
          <h3 className="text-body-sm text-on-surface-variant uppercase tracking-wider mb-1">Réponses non utiles</h3>
          <p className="text-headline-md text-on-surface">{ragStats?.not_helpful_count ?? "…"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/30 p-6">
          <h3 className="text-headline-sm text-on-surface mb-4">Réclamations par catégorie</h3>
          <div className="h-[280px]">
            {complaintStats && (
              <Bar
                data={{
                  labels: categoryLabels,
                  datasets: [{ data: categoryData, backgroundColor: NAVY, borderRadius: 4, barThickness: 28 }],
                }}
                options={barOptions(true)}
              />
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/30 p-6">
          <h3 className="text-headline-sm text-on-surface mb-4">Réclamations par urgence</h3>
          <div className="h-[280px] flex items-center justify-center">
            {complaintStats && urgencyLabels.length > 0 && (
              <Doughnut
                data={{
                  labels: urgencyLabels,
                  datasets: [
                    {
                      data: urgencyData,
                      backgroundColor: urgencyKeys.map((k) => URGENCY_COLOR[k] || TEXT),
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: "bottom", labels: { font: chartFont, color: TEXT, usePointStyle: true } } },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {ragStats?.top_questions?.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/30 p-6">
          <h3 className="text-headline-sm text-on-surface mb-3">Questions les plus posées</h3>
          <ul className="text-body-sm text-on-surface-variant list-disc pl-5 space-y-1.5">
            {ragStats.top_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
