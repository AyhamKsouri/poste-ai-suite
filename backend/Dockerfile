# Dev-oriented image: mirrors `pip install -r requirements.txt && uvicorn ... --reload`,
# the workflow documented in the README, just containerized. Not a production
# build (no multi-stage slim-down, no gunicorn workers) - see ARCHITECTURE.md.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source is bind-mounted over this in docker-compose.yml for live reload;
# copied here too so `docker build` alone still produces a runnable image.
COPY . .

EXPOSE 8000

# Migrations only ALTER existing tables (they assume `create_all` already
# built them, matching the app's own startup logic in main.py's lifespan) -
# so on a genuinely fresh DB volume, skip straight to the app and let it
# create + stamp the schema itself. On a DB that already exists (recreated
# container, or a teammate's pre-Alembic dev DB), run migrations first so
# it's brought up to date before the app starts.
CMD ["sh", "-c", "test -f data/poste.db && alembic upgrade head; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
