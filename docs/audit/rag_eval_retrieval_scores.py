"""Phase 4 RAG eval - retrieval-only pass (real TF-IDF/cosine scores).

Read-only: opens the same DB the live dev server (backend/.env DATABASE_URL)
uses, rebuilds the TF-IDF index in this separate process (same algorithm,
same code, just a second in-memory copy - no writes to any table), and
queries it for each of the 20 eval questions to log real similarity scores
and which document(s) were actually retrieved. Run from backend/ with the
venv's python so imports resolve.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

from app.db import SessionLocal
from app.services import vectorstore

QUESTIONS = [
    # 10 answerable (single document)
    ("Q1", "Quel est le dépôt initial minimum pour ouvrir un compte CCP ?", ["sample_procedure_ccp"]),
    ("Q2", "Quels documents sont nécessaires pour ouvrir un compte CCP ?", ["sample_procedure_ccp"]),
    ("Q3", "Quel est le montant maximum autorisé pour un mandat international ?", ["procedure_mandat_international"]),
    ("Q4", "Après combien de temps un mandat international non retiré est-il retourné à l'expéditeur ?", ["procedure_mandat_international"]),
    ("Q5", "Quel est le poids maximum autorisé pour un colis postal ?", ["procedure_colis_postal"]),
    ("Q6", "Quel est le dépôt initial minimum pour ouvrir un Livret Poste ?", ["procedure_epargne"]),
    ("Q7", "Quel est le plafond de retrait quotidien standard de la carte e-Dinar Post ?", ["procedure_edinar"]),
    ("Q8", "Combien de temps faut-il pour la fabrication de la carte e-Dinar Post ?", ["procedure_edinar"]),
    ("Q9", "Quel est le délai de traitement d'une réclamation pour un colis perdu ou endommagé ?", ["procedure_reclamation"]),
    ("Q10", "Quelle est la durée de validité d'une procuration postale ?", ["procedure_procuration"]),
    # 5 cross-document (need facts from 2 different docs)
    ("Q11", "Quel est le dépôt minimum pour ouvrir un CCP et quels sont les frais d'un mandat national de 100 dinars ?", ["sample_procedure_ccp", "procedure_tarifs", "procedure_mandat_national"]),
    ("Q12", "Quels documents d'identité faut-il pour ouvrir un CCP et pour retirer un mandat international ?", ["sample_procedure_ccp", "procedure_mandat_international"]),
    ("Q13", "Quel est le dépôt minimum pour un Livret Poste et le tarif d'un colis de 3 kg ?", ["procedure_epargne", "procedure_tarifs", "procedure_colis_postal"]),
    ("Q14", "Quel est le délai de traitement d'une réclamation pour un colis perdu, et après combien de temps un mandat international non retiré est-il renvoyé à l'expéditeur ?", ["procedure_reclamation", "procedure_mandat_international"]),
    ("Q15", "Quels documents faut-il pour établir une procuration postale, et quel est le délai de mise à disposition des fonds d'un mandat international ?", ["procedure_procuration", "procedure_mandat_international"]),
    # 5 deliberately unanswerable (not in corpus)
    ("Q16", "Quels sont les horaires d'ouverture des bureaux de poste le vendredi ?", []),
    ("Q17", "Comment postuler à un emploi à La Poste Tunisienne ?", []),
    ("Q18", "Quel est le tarif d'envoi d'un colis vers la France ?", []),
    ("Q19", "Comment réinitialiser mon mot de passe sur MyPoste ?", []),
    ("Q20", "Quelle est la procédure pour obtenir une carte SIM Poste Mobile ?", []),
]

if __name__ == "__main__":
    db = SessionLocal()
    vectorstore.rebuild_index(db)
    results = []
    for qid, question, expected_docs in QUESTIONS:
        matches = vectorstore.query(question, top_k=4)
        retrieved_docs = []
        from app.models import DocumentChunk
        for m in matches:
            chunk = db.get(DocumentChunk, m["chunk_id"])
            if chunk:
                retrieved_docs.append({"doc_title": chunk.document.title, "similarity": round(m["similarity"], 4)})
        results.append({
            "id": qid,
            "question": question,
            "expected_docs": expected_docs,
            "retrieved": retrieved_docs,
        })
        print(f"{qid}: retrieved {len(retrieved_docs)} chunks above threshold | expected docs: {expected_docs}")
        for r in retrieved_docs:
            print(f"    - {r['doc_title']} (sim={r['similarity']})")
    db.close()

    out_path = Path(__file__).resolve().parent / "rag_eval_retrieval_results.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path}")
