# Audit fonctionnel end-to-end — poste-ai-suite

Date : 2026-08-20
Environnement : Windows 11, installation complète depuis zéro (git, Python 3.12.10, Node 24.19.0 LTS installés via winget), backend et frontend lancés en local, mode mock (aucune `GROQ_API_KEY`).

**Important — ce projet contient déjà un audit QA antérieur très complet** dans `docs/audit/` (`REPORT.md` + phases 0 à 5, suite `tests/` de 97 tests pytest). La quasi-totalité de ses findings HIGH/MEDIUM ont déjà été corrigés dans le code actuel (chaque correctif porte un commentaire `QA audit finding Xn` traçable). Ce document :
1. vérifie ce qui a réellement été corrigé (pour ne pas dupliquer un audit déjà fait),
2. liste ce qui reste ouvert de cet audit précédent,
3. **ajoute des bugs neufs**, non couverts par cet audit précédent, trouvés en relisant le code et en testant en direct via l'API.

Aucun fichier source n'a été modifié pendant cet audit (`git status` reste propre sur `main`).

---

## 1. Environnement vérifié

| Outil | Avant | Après installation |
|---|---|---|
| git | absent | 2.55.0.windows.3 |
| python | stub Microsoft Store (inopérant) | 3.12.10 |
| node | absent | v24.19.0 (LTS) |
| npm | absent | 11.17.0 |

- `winget` était déjà présent (v1.29.280) ; aucune des 3 installations n'a nécessité d'élévation manuelle bloquante.
- Piège rencontré : chaque commande shell de cette session tourne dans un nouveau processus qui hérite du PATH *avant* installation — il a fallu recharger le PATH depuis le registre à chaque commande. En usage normal, rouvrir un terminal suffit.
- Suite `tests/` (pytest) : **97/97 tests passent**, 0 échec.
- `npm audit` (frontend) : **4 vulnérabilités actuelles** (1 high : `vite`/`esbuild` ; transitives : `react-router`, `react-router-dom`, toutes moderate) — `npm audit fix` (sans breaking change) en corrige 3/4 ; la 4e (`vite`) nécessite un bump majeur.

## 2. Vérification du mode mock (sans `GROQ_API_KEY`)

Confirmé fonctionnel de bout en bout :
- `GET /` renvoie `{"status":"ok","ai_enabled":false}`.
- Log de démarrage : `WARNING: GROQ_API_KEY is not set - ... running on mock responses`.
- `/rag/ask` : réponse déterministe basée sur le chunk le plus pertinent (TF-IDF), "je ne sais pas" propre pour une question hors-sujet, réponse de salutation dédiée pour "Bonjour".
- `/complaints` : classification par mots-clés fonctionnelle (`retard`+`!!!` → `delivery_delay`/`high`/confiance 0.8 ; texte incompréhensible → `other`/`low`/confiance 0.3, correctement signalé "confiance faible" côté frontend).

Le fallback mock marche réellement, pas seulement sur le papier.

## 3. État des fonctionnalités

| Fonctionnalité | État | Note |
|---|---|---|
| `POST /auth/register` (admin) | OK | rejet correct pour un non-admin (403) |
| `POST /auth/login` | OK | |
| `GET /auth/me` | OK | |
| `POST /rag/documents` (upload) | OK | testé avec `sample_procedure_ccp.txt`, extraction + chunking corrects |
| `GET /rag/documents` | OK | non protégé admin-only côté API (finding L1 de l'audit précédent, toujours vrai — probablement voulu) |
| `POST /rag/ask` | OK | pertinent, sources citées, fallback "je ne sais pas" correct |
| `POST /rag/questions/{id}/feedback` | OK | |
| `POST /complaints` (triage) | OK | catégorie/urgence/confiance cohérentes |
| `GET/PATCH /complaints/{id}` | **Partiel** | fonctionne, mais trace d'audit incomplète — voir Bug NEW-2 |
| `GET /rag/stats`, `/complaints/stats` | OK | |
| Frontend — Assistant / Réclamations / Documents / Dashboard | OK (code review) | Markdown, labels, mobile sidebar déjà corrigés (audit précédent) |
| Frontend — Upload/suppression de document (`AdminDocuments.jsx`) | **Partiel** | fonctionne sur le chemin heureux, aucune gestion d'erreur — voir Bug NEW-3 |
| Proxy Vite `/api/*` → backend | OK | vérifié en direct sur `localhost:5173/api/auth/login` |

Rien n'est **cassé** (aucun endpoint ne renvoie une erreur inattendue sur le chemin nominal).

## 4. Bugs trouvés

### Bloquant
Aucun.

### Important

**NEW-1 — L'`AuditLog` de `POST /rag/ask` a toujours `target_id = NULL`, contrairement à toutes les autres actions auditées.**
`backend/app/routers/rag.py:156` :
```python
question = Question(...)          # question.id pas encore généré (default Python, appliqué au flush)
db.add(question)
db.add(AuditLog(..., target_id=question.id))   # capture None ici
db.commit()
db.refresh(question)
```
`question.id` est un défaut Python (`default=gen_id` dans `models.py`), appliqué seulement au flush/commit — donc `question.id` vaut `None` au moment où l'`AuditLog` est construit. Contrairement à `complaints.py` (qui commit `complaint` *avant* de référencer `complaint.id`) ou à `rag.py` upload (qui pré-génère `doc_id` manuellement), ce chemin capture toujours `NULL`.
**Reproduction confirmée** : j'ai posé 3 questions via `/rag/ask` puis requêté directement `data/poste.db` :
```
('rag.question_asked', 'questions', None, ...)   # x3, target_id toujours NULL
```
**Correctif** : générer l'id de la question manuellement (`str(uuid.uuid4())`) comme c'est déjà fait pour les documents, ou déplacer la création de l'`AuditLog` après `db.commit()`/`db.refresh(question)`.

**NEW-2 — `PATCH /complaints/{id}/status` n'écrit aucune entrée dans `audit_log`, contrairement à ce que promet le README.**
`backend/app/routers/complaints.py:137-153`. Comparer avec `submit_complaint` (ligne 42) et `send_reply` (ligne 129), qui ajoutent bien un `AuditLog`. Le README affirme : *"every login, document upload/delete, question asked, and complaint action is recorded in the audit_log table"* — faux pour ce endpoint précis.
**Reproduction confirmée** : `PATCH /complaints/{id}/status` avec `{"status":"reviewed"}`, puis requête SQL sur `audit_log` → aucune ligne créée pour cette action.
**Correctif** : ajouter un `db.add(AuditLog(user_id=user.id, action="complaint.status_updated", ...))` avant le commit, à l'identique des deux autres handlers du même fichier.

**NEW-3 — `AdminDocuments.jsx` : upload et suppression de document n'ont aucune gestion d'erreur (rejet de promesse non capturé).**
`frontend/src/pages/AdminDocuments.jsx:34-45` (`doUpload`) et `:54-57` (`handleDelete`) appellent `api.uploadDocument`/`api.deleteDocument` sans `try/catch`. C'est exactement le pattern que l'audit précédent (finding M3) a corrigé dans `Complaints.jsx`, `ComplaintDetail.jsx` et `Dashboard.jsx` — mais `AdminDocuments.jsx` n'a jamais reçu le même correctif.
**Reproduction** : uploader un fichier > 10 Mo ou d'extension non supportée → `api.uploadDocument` lève (le backend renvoie 400), le composant reste bloqué sur "Traitement..." sans aucun message d'erreur visible ; la seule façon de s'en sortir est de recharger la page.
**Correctif** : appliquer le même pattern `try { … } catch (err) { setUploadError(err.message) } finally { … }` que dans les autres pages.

**NEW-4 — Aucune contrainte de longueur/force sur le mot de passe, et `role` accepte n'importe quelle chaîne à l'inscription.**
`backend/app/schemas.py:8-9` (`UserCreate.password: str`, sans `min_length`) et `:11` (`role: str = "agent"`, sans `Literal["agent","admin"]`).
**Reproduction confirmée en direct** : `POST /auth/register` avec `password="a"` → `200 OK`, compte créé. Idem avec `role="superadmin_totally_fake"` → accepté tel quel (n'accorde pas les droits admin réels puisque seul `role == "admin"` compte, mais pollue la donnée).
Ceci recoupe le finding L3 déjà documenté dans l'audit précédent ("no max_length/min_length validation on any free-text schema field"), avec une reproduction concrète sur les deux champs les plus sensibles.
**Correctif** : `password: str = Field(min_length=8)` et `role: Literal["agent", "admin"] = "agent"`.

### Cosmétique

- `datetime.utcnow()` (déprécié en Python 3.12+) toujours utilisé dans `backend/app/models.py` (colonnes `created_at`) et `backend/app/routers/complaints.py:127` (`replied_at`). **Incohérence intéressante** : `auth.py` a déjà été corrigé pour utiliser `datetime.now(timezone.utc)` (commentaire explicite sur le bug d'interprétation de fuseau horaire) mais le même correctif n'a pas été propagé aux autres usages de `utcnow()`. Confirmé par les `DeprecationWarning` de la suite pytest.
- `GET /rag/documents` toujours non restreint aux admins côté API (finding L1 de l'audit précédent) alors que la page frontend correspondante l'est. Probablement voulu (exposition d'information mineure : titres/statuts de documents).
- Pas de scoping de propriété sur les réclamations (finding L2) — tout agent authentifié voit toutes les réclamations. Design assumé (file partagée), confirmé par le nom du test `test_list_complaints_any_authenticated_user_sees_all`.
- `npm audit` : 4 vulnérabilités résiduelles (`esbuild`/`vite` high, `react-router`/`react-router-dom` moderate) — corrigibles en grande partie par `npm audit fix` sans breaking change.

## 5. Ce qui était cassé et a déjà été corrigé (crédit à l'audit précédent)

Vérifié dans le code actuel, avec preuve :

| Finding audit précédent | État vérifié maintenant |
|---|---|
| H1 — crash non géré si Groq renvoie `content=None` | **Corrigé** — garde explicite `choice.message.content is None` dans `ai_client.py` (classification et RAG) |
| H2 — sidebar mobile casse la mise en page (260px fixe) | **Corrigé** — tiroir off-canvas sous le breakpoint `md`, confirmé dans `Layout.jsx` |
| M1 — pas de timeout sur les appels Groq (hang 16s) | **Corrigé** — `GROQ_TIMEOUT_SECONDS = 10` sur les deux appels |
| M2 — perte de session sur simple coupure réseau | **Corrigé** — classe `NetworkError` dédiée + `AuthContext` ne purge plus le token sur erreur réseau |
| M3 — pages sans gestion d'erreur, bloquées sur "Chargement..." | **Corrigé sur `Complaints.jsx`/`ComplaintDetail.jsx`/`Dashboard.jsx`** — mais **pas propagé à `AdminDocuments.jsx`** (voir NEW-3 ci-dessus) |
| M4 — exception d'extraction de document avalée sans log | **Corrigé** — `logger.exception(...)` ajouté avant `document.status = "failed"` |
| M5 — pypdf obsolète, pas de limite de taille/type | **Corrigé** — `pypdf==6.15.0` (à jour), limite 10 Mo + whitelist d'extensions |
| M6 — dépendances obsolètes (`python-multipart`, `pyjwt`, `starlette`) | **Corrigé** — versions actuelles installées (confirmé par `pip install`) |
| M7 — catégorie manquante pour les mandats | **Corrigé** — `money_order_issue` ajoutée, testé en direct |
| M8 — aucun signal de confiance sur la classification | **Corrigé** — champ `confidence`, seuil d'alerte à 0.5 côté frontend, testé en direct (gibberish → 0.3) |
| M9 — icônes lues à voix haute par les lecteurs d'écran | **Corrigé** — `aria-hidden="true"` sur `Icon.jsx` |
| L4 — Markdown non rendu dans le chat | **Corrigé** — `react-markdown` intégré dans `Assistant.jsx` |
| L5 — labels catégorie/statut incohérents entre pages | **Corrigé** — `constants.js` centralisé, utilisé par les deux pages |
| L6 — message d'erreur trompeur sur coupure réseau | **Corrigé** — conséquence directe du fix M2 |

## 6. Incohérences README vs code

- Le README affirme que **toute** action sur une réclamation est tracée dans `audit_log` — **faux** pour `PATCH /complaints/{id}/status` (voir NEW-2).
- Le reste du README (architecture, flux de démo, structure du projet, tech stack) correspond fidèlement au code actuel — pas d'autre écart trouvé.

## 7. Roadmap — 5 prochaines actions (rentabilité décroissante)

1. **Corriger NEW-1** (`rag.py:156`) — changement d'une ligne (générer l'id manuellement ou déplacer la création de l'`AuditLog` après le commit). Répare une trace d'audit silencieusement cassée sur l'action la plus fréquente de l'app (poser une question).
2. **Corriger NEW-2** — ajouter l'`AuditLog` manquant sur `update_status`, à l'identique du pattern déjà utilisé deux fois dans le même fichier. Ferme l'écart README/code identifié en §6.
3. **Corriger NEW-3** (`AdminDocuments.jsx`) — appliquer le pattern try/catch déjà en place ailleurs. Petit changement, ferme une vraie lacune UX (upload échoué = page bloquée sans message).
4. **Corriger NEW-4** — `min_length` sur le mot de passe + `Literal` sur le rôle dans `schemas.py`. Deux lignes, ferme un vrai gap de validation sur les champs les plus sensibles.
5. **`npm audit fix`** (sans breaking change) puis évaluer le bump majeur de `vite` séparément. Gain rapide sur 3 des 4 vulnérabilités JS restantes.

*(Au-delà de ces 5 : les points déjà identifiés comme non prioritaires par l'audit précédent — Docker/déploiement, migrations Alembic, CI — restent valables et ne sont pas répétés ici.)*
