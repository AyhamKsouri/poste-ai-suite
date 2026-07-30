import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const STATUS_COLOR = {
  ready: "bg-green-100 text-green-700",
  processing: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export default function AdminDocuments() {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function load() {
    setDocuments(await api.listDocuments());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadDocument(file);
      fileRef.current.value = "";
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    await api.deleteDocument(id);
    await load();
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-800 mb-4">Documents de procédure</h1>

      <form onSubmit={handleUpload} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex gap-3 items-center">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="text-sm" />
        <button
          disabled={uploading}
          className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? "Traitement..." : "Téléverser"}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Titre</th>
              <th className="px-4 py-2">Fichier</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Téléversé le</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={5}>
                  Aucun document. Téléversez un PDF/DOCX/TXT de procédure interne.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{d.title}</td>
                <td className="px-4 py-2 text-slate-500">{d.original_filename}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[d.status] || ""}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-400 text-xs">
                  {new Date(d.created_at).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => handleDelete(d.id)} className="text-red-500 hover:underline text-xs">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
