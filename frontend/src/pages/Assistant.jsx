import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";
import Icon from "../components/Icon";

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-surface-container-high px-1 py-0.5 rounded text-[13px]">{children}</code>
  ),
};

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
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-outline-variant shrink-0">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Icon name="model_training" />
        </div>
        <div>
          <h1 className="text-headline-sm text-on-surface flex items-center gap-2">
            Assistant IA — Procédures internes
            <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] rounded-full border border-outline-variant/50">
              RAG
            </span>
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Réponses générées à partir des documents téléversés, avec citation des sources.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-6 flex flex-col gap-6">
        {messages.length === 0 && (
          <p className="text-body-sm text-on-surface-variant italic text-center mt-8">
            Exemple : « Comment ouvrir un CCP ? » ou « Quelle est la procédure pour un mandat international ? »
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="self-end max-w-[75%] bg-surface-variant text-on-surface p-4 rounded-2xl rounded-tr-sm shadow-sm border border-outline-variant/20"
            >
              <p className="text-body-md whitespace-pre-wrap">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="self-start max-w-[85%] flex gap-3 w-full group">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 mt-1 shadow-sm">
                <Icon name="smart_toy" style={{ fontSize: 18 }} />
              </div>
              <div className="bg-surface-container-lowest border border-outline-variant/30 shadow-card p-5 rounded-2xl rounded-tl-sm w-full space-y-4">
                <div className="text-body-md text-on-surface leading-relaxed">
                  <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.text}</ReactMarkdown>
                </div>

                {m.sources?.length > 0 && (
                  <details className="border border-outline-variant/50 rounded-xl overflow-hidden bg-surface-bright group/sources">
                    <summary className="p-3 flex items-center justify-between hover:bg-surface-container transition-colors text-on-surface-variant text-label-md cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        <Icon name="library_books" className="text-primary/70" style={{ fontSize: 16 }} />
                        <span className="font-semibold text-on-surface">
                          {m.sources.length} source{m.sources.length > 1 ? "s" : ""} consultée
                          {m.sources.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      <Icon
                        name="expand_more"
                        className="transition-transform group-open/sources:rotate-180"
                        style={{ fontSize: 16 }}
                      />
                    </summary>
                    <div className="p-3 border-t border-outline-variant/50 flex flex-col gap-2">
                      {m.sources.map((s, si) => (
                        <div key={si} className="flex gap-3 p-2 rounded-lg">
                          <div className="w-5 h-5 rounded bg-surface-container-high border border-outline-variant/50 text-on-surface-variant flex items-center justify-center text-[10px] shrink-0">
                            {si + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-label-md text-primary truncate mb-0.5">{s.doc_title}</h4>
                            {s.chunk_text && (
                              <p className="text-[12px] text-on-surface-variant truncate">{s.chunk_text}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {m.questionId && (
                  <div className="flex items-center gap-1 pt-1">
                    <button
                      onClick={() => rate(i, "helpful")}
                      className={`p-1.5 rounded-md transition-colors ${
                        m.feedback === "helpful"
                          ? "text-green-700 bg-green-100"
                          : "text-on-surface-variant hover:text-green-700 hover:bg-surface-container"
                      }`}
                      title="Bonne réponse"
                    >
                      <Icon name="thumb_up" style={{ fontSize: 16 }} />
                    </button>
                    <button
                      onClick={() => rate(i, "not_helpful")}
                      className={`p-1.5 rounded-md transition-colors ${
                        m.feedback === "not_helpful"
                          ? "text-error bg-error-container/60"
                          : "text-on-surface-variant hover:text-error hover:bg-error-container/50"
                      }`}
                      title="Mauvaise réponse"
                    >
                      <Icon name="thumb_down" style={{ fontSize: 16 }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="self-start flex gap-3 items-center">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 shadow-sm">
              <Icon name="smart_toy" style={{ fontSize: 18 }} />
            </div>
            <p className="text-body-sm text-on-surface-variant italic">L&apos;assistant réfléchit...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleAsk} className="shrink-0 pt-3 border-t border-outline-variant">
        <div className="relative bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-panel focus-within:border-secondary-container focus-within:ring-1 focus-within:ring-secondary-container transition-all flex items-end gap-2 p-2">
          <input
            className="flex-1 bg-transparent border-none px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-0"
            placeholder="Posez une question sur les procédures, la réglementation..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            disabled={busy}
            className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-container rounded-xl text-label-md flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            Envoyer
            <Icon name="send" style={{ fontSize: 18 }} />
          </button>
        </div>
        <p className="text-center text-[11px] text-on-surface-variant mt-2 tracking-wide">
          L&apos;Assistant Poste AI peut générer des informations inexactes. Vérifiez toujours les données critiques.
        </p>
      </form>
    </div>
  );
}
