"""Phase 4 RAG eval - live end-to-end pass against the real running dev
server (real Groq API calls, real HTTP requests through the actual /rag/ask
endpoint - not a direct function call). Logs the real answer + sources for
each of the 20 eval questions."""
import json
import time
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"

QUESTIONS = [
    ("Q1", "Quel est le dépôt initial minimum pour ouvrir un compte CCP ?"),
    ("Q2", "Quels documents sont nécessaires pour ouvrir un compte CCP ?"),
    ("Q3", "Quel est le montant maximum autorisé pour un mandat international ?"),
    ("Q4", "Après combien de temps un mandat international non retiré est-il retourné à l'expéditeur ?"),
    ("Q5", "Quel est le poids maximum autorisé pour un colis postal ?"),
    ("Q6", "Quel est le dépôt initial minimum pour ouvrir un Livret Poste ?"),
    ("Q7", "Quel est le plafond de retrait quotidien standard de la carte e-Dinar Post ?"),
    ("Q8", "Combien de temps faut-il pour la fabrication de la carte e-Dinar Post ?"),
    ("Q9", "Quel est le délai de traitement d'une réclamation pour un colis perdu ou endommagé ?"),
    ("Q10", "Quelle est la durée de validité d'une procuration postale ?"),
    ("Q11", "Quel est le dépôt minimum pour ouvrir un CCP et quels sont les frais d'un mandat national de 100 dinars ?"),
    ("Q12", "Quels documents d'identité faut-il pour ouvrir un CCP et pour retirer un mandat international ?"),
    ("Q13", "Quel est le dépôt minimum pour un Livret Poste et le tarif d'un colis de 3 kg ?"),
    ("Q14", "Quel est le délai de traitement d'une réclamation pour un colis perdu, et après combien de temps un mandat international non retiré est-il renvoyé à l'expéditeur ?"),
    ("Q15", "Quels documents faut-il pour établir une procuration postale, et quel est le délai de mise à disposition des fonds d'un mandat international ?"),
    ("Q16", "Quels sont les horaires d'ouverture des bureaux de poste le vendredi ?"),
    ("Q17", "Comment postuler à un emploi à La Poste Tunisienne ?"),
    ("Q18", "Quel est le tarif d'envoi d'un colis vers la France ?"),
    ("Q19", "Comment réinitialiser mon mot de passe sur MyPoste ?"),
    ("Q20", "Quelle est la procédure pour obtenir une carte SIM Poste Mobile ?"),
]

if __name__ == "__main__":
    login = requests.post(f"{BASE}/auth/login", json={"email": "admin@poste.tn", "password": "admin123"})
    login.raise_for_status()
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    results = []
    for qid, question in QUESTIONS:
        start = time.time()
        resp = requests.post(f"{BASE}/rag/ask", json={"question": question, "history": []}, headers=headers)
        elapsed = time.time() - start
        if resp.status_code != 200:
            print(f"{qid}: HTTP {resp.status_code} - {resp.text[:200]}")
            results.append({"id": qid, "question": question, "error": resp.text, "status": resp.status_code})
            continue
        body = resp.json()
        results.append({
            "id": qid,
            "question": question,
            "answer": body["answer"],
            "sources": [s["doc_title"] for s in body["sources"]],
            "elapsed_s": round(elapsed, 2),
        })
        print(f"{qid} ({elapsed:.1f}s): {body['answer'][:150]}")
        print(f"    sources: {[s['doc_title'] for s in body['sources']]}")

    out_path = Path(__file__).resolve().parent / "rag_eval_live_answers_results.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path}")
