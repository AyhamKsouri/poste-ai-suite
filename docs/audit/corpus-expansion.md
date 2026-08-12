# RAG corpus expansion — addendum to Phase 0

Date: 2026-08-12. Done between Phase 0 and Phase 1, on explicit user instruction,
to unblock the Phase 4 RAG eval plan (§7 of `phase-0-inventory.md` flagged the
original 1-document corpus as insufficient to build the planned 20-question
eval set).

## What was done

1. Web search for La Poste Tunisienne's real service categories, to ground new
   documents in real service names rather than inventing fictional services.
   Sources consulted (facts only — no text copied/reproduced from these pages):
   - https://idaraty.tn/fr/procedures/utilisation-du-service-ccpnet-personne-physique-la-poste-tunisienne
   - https://my.poste.tn/
   - https://en.wikipedia.org/wiki/La_Poste_Tunisienne
   - https://www.la-poste.tn/index_service.php?code_menu=82&code_sous_menu=93
2. Wrote 8 new original French-language procedure documents (same style/length
   as the existing `sample_procedure_ccp.txt`), staged at
   `docs/audit/rag-corpus/*.txt`:
   - `procedure_mandat_international.txt`
   - `procedure_mandat_national.txt`
   - `procedure_colis_postal.txt`
   - `procedure_epargne.txt`
   - `procedure_edinar.txt`
   - `procedure_reclamation.txt`
   - `procedure_tarifs.txt`
   - `procedure_procuration.txt`
3. Uploaded all 8 through the real running API (`POST /rag/documents`, logged
   in as `admin@poste.tn`) rather than writing directly to the DB — this
   exercises the actual upload → extract → chunk → index pipeline as a live
   user would. All 8 returned `status: "ready"`, HTTP 200.
4. Verified via direct SQLite query: `documents` table went from 1 → 9 rows,
   `document_chunks` went from 1 → 9 rows (each doc is short enough to be a
   single ~200-word chunk under the 500-word chunk size in
   `backend/app/services/documents.py:26`).
5. Smoke-tested retrieval with a deliberately cross-document question
   ("Quel est le dépôt minimum pour ouvrir un CCP et quels sont les frais pour
   un mandat national ?") via `POST /rag/ask`. The TF-IDF retriever returned
   chunks from `procedure_tarifs`, `procedure_mandat_national`,
   `sample_procedure_ccp`, and `procedure_mandat_international`, and the live
   Groq answer correctly combined the 5 DT (CCP deposit) and 3%/min 2 DT
   (mandat national fee) facts with correct sourcing. Confirms the expanded
   corpus is retrievable end-to-end before Phase 4 builds on it.

## Facts deliberately duplicated/linked across documents (for cross-doc eval questions)

These overlaps were designed on purpose so Phase 4 can build genuine
"answerable only by combining 2 documents" questions instead of fabricating
them:

| Cross-document question theme | Documents involved |
|---|---|
| CCP minimum deposit + mandat national fee | `sample_procedure_ccp` / `procedure_tarifs` / `procedure_mandat_national` |
| Identity documents required for CCP opening vs. mandat international withdrawal | `sample_procedure_ccp` / `procedure_mandat_international` |
| Épargne minimum deposit + colis pricing by weight | `procedure_epargne` / `procedure_tarifs` / `procedure_colis_postal` |
| Réclamation delay for a lost colis vs. mandat return-to-sender delay | `procedure_reclamation` / `procedure_mandat_international` |
| Procuration documents/validity + mandat withdrawal delay | `procedure_procuration` / `procedure_mandat_national` or `procedure_mandat_international` |

## Topics deliberately left uncovered (for the "5 unanswerable" eval questions)

Office opening hours, MyPoste password reset, international parcel pricing to
a specific named country, recruitment/hiring procedure, Poste Mobile SIM
cards. None of these appear in any of the 9 documents — confirmed by not
writing them into any document, not by testing yet (that's Phase 4).

## State change this caused

- `backend/data/poste.db` (git-ignored, not committed) now has 9 `documents`
  rows / 9 `document_chunks` rows instead of 1/1. This is local runtime state,
  reproducible from the 9 source `.txt` files by re-uploading them to a fresh
  instance — the source files are the durable, committable artifact.
- `docs/audit/rag-corpus/*.txt` (8 new files) are new, uncommitted-as-of-this-
  addendum, tracked in git going forward as the audit's test fixtures.
- No application source code was modified. Only data (documents) and audit
  docs were added, per the user's explicit go-ahead to "search the web for
  more documents or create more documents... do whatever you need."
