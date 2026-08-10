import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import Icon from "../components/Icon";

const STATUS_LABEL = { ready: "Prêt", processing: "Traitement...", failed: "Échec" };
const STATUS_STYLE = {
  ready: "bg-green-100 text-green-700",
  processing: "bg-secondary-fixed text-on-secondary-fixed-variant",
  failed: "bg-error-container text-on-error-container",
};

function fileIcon(filename) {
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { icon: "picture_as_pdf", bg: "bg-error-container", fg: "text-on-error-container" };
  if (ext === "docx" || ext === "doc") return { icon: "description", bg: "bg-primary-fixed", fg: "text-on-primary-fixed" };
  return { icon: "draft", bg: "bg-surface-variant", fg: "text-on-surface-variant" };
}

export default function AdminDocuments() {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  async function load() {
    setDocuments(await api.listDocuments());
  }

  useEffect(() => {
    load();
  }, []);

  async function doUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadDocument(file);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  }

  async function handleDelete(id) {
    await api.deleteDocument(id);
    await load();
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-headline-lg text-on-surface">Gestion des Documents</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Importez et gérez les documents de référence pour la base de connaissances IA.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-1">
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant p-6 h-full flex flex-col">
            <h3 className="text-headline-sm text-on-surface mb-4">Nouvel Import</h3>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center gap-4 transition-colors cursor-pointer flex-1 min-h-[220px] ${
                dragOver ? "border-primary bg-surface-container-low" : "border-outline-variant hover:border-primary hover:bg-surface-container-low"
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center">
                <Icon name="cloud_upload" className="text-primary" style={{ fontSize: 32 }} />
              </div>
              <div>
                <p className="text-body-md text-on-surface font-semibold mb-1">
                  {selectedFile ? selectedFile.name : "Glissez-déposez vos fichiers ici"}
                </p>
                <p className="text-body-sm text-on-surface-variant mb-4">Formats supportés : PDF, DOCX, TXT</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                  className="bg-primary hover:bg-primary-container text-on-primary text-label-md px-6 py-2 rounded-full transition-colors"
                >
                  Parcourir les fichiers
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            {selectedFile && (
              <button
                disabled={uploading}
                onClick={() => doUpload(selectedFile)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-on-primary rounded-lg py-2.5 text-label-md hover:bg-primary-container transition-colors disabled:opacity-50"
              >
                <Icon name="upload" style={{ fontSize: 18 }} />
                {uploading ? "Traitement..." : "Téléverser"}
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant p-6 h-full">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-outline-variant/50">
              <h3 className="text-headline-sm text-on-surface">Documents ({documents.length})</h3>
            </div>
            <div className="flex flex-col gap-3">
              {documents.length === 0 && (
                <p className="text-body-sm text-on-surface-variant py-4">
                  Aucun document. Téléversez un PDF/DOCX/TXT de procédure interne.
                </p>
              )}
              {documents.map((d) => {
                const fi = fileIcon(d.original_filename);
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low transition-colors group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${fi.bg}`}>
                        <Icon name={fi.icon} className={fi.fg} filled />
                      </div>
                      <div className="min-w-0">
                        <p className="text-body-md font-semibold text-on-surface truncate">{d.title}</p>
                        <p className="text-body-sm text-on-surface-variant truncate">
                          {d.original_filename} • {new Date(d.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[d.status] || ""}`}>
                        {STATUS_LABEL[d.status] || d.status}
                      </span>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error-container/50 opacity-0 group-hover:opacity-100"
                        title="Supprimer"
                      >
                        <Icon name="delete" style={{ fontSize: 18 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
