import React, { useState } from "react";
import { api } from "../api/client";

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question;
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.ask(q, history);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.answer,
          sources: res.sources,
          questionId: res.question_id,
          feedback: null,
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Erreur : ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function rate(index, feedback) {
    const msg = messages[index];
    if (!msg?.questionId) return;
    await api.sendFeedback(msg.questionId, feedback);
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, feedback } : x)));
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-slate-800 mb-1">Assistant IA — Procédures internes</h1>
      <p className="text-sm text-slate-500 mb-4">
        Posez une question sur les procédures internes. Les réponses sont générées à partir des
        documents téléversés par l'administrateur, avec citation des sources.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 min-h-[300px] flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 italic">
            Exemple : "Comment ouvrir un CCP ?" ou "Quelle est la procédure pour un mandat international ?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end max-w-[80%]" : "self-start max-w-[85%]"}>
            <div
              className={`rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.text}
            </div>
            {m.sources?.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">
                <span className="font-medium">Sources : </span>
                {m.sources.map((s, si) => (
                  <span key={si} className="mr-2 underline decoration-dotted" title={s.chunk_text}>
                    {s.doc_title}
                  </span>
                ))}
              </div>
            )}
            {m.role === "assistant" && m.questionId && (
              <div className="mt-1 flex gap-2 text-xs">
                <button
                  onClick={() => rate(i, "helpful")}
                  className={`px-2 py-0.5 rounded ${
                    m.feedback === "helpful" ? "bg-green-100 text-green-700" : "text-slate-400 hover:text-green-700"
                  }`}
                >
                  👍 Utile
                </button>
                <button
                  onClick={() => rate(i, "not_helpful")}
                  className={`px-2 py-0.5 rounded ${
                    m.feedback === "not_helpful" ? "bg-red-100 text-red-700" : "text-slate-400 hover:text-red-700"
                  }`}
                >
                  👎 Pas utile
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-slate-400 italic">L'assistant réfléchit...</p>}
      </div>

      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
          placeholder="Posez votre question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          disabled={busy}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
