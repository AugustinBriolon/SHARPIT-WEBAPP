#!/usr/bin/env bash
# Migre le schéma Prisma et les données locales vers le projet Neon SHARPIT.
# Usage : ./scripts/migrate-to-neon.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NEON_PROJECT_ID="${NEON_PROJECT_ID:-old-resonance-08367176}"
NEON_ORG_ID="${NEON_ORG_ID:-org-muddy-sun-34347227}"

LOCAL_HOST="${LOCAL_PG_HOST:-localhost}"
LOCAL_USER="${LOCAL_PG_USER:-sharpit}"
LOCAL_PASS="${LOCAL_PG_PASSWORD:-sharpit}"
LOCAL_DB="${LOCAL_PG_DATABASE:-sharpit}"

echo "→ Récupération des URLs Neon (projet ${NEON_PROJECT_ID})…"
POOLED=$(npx neonctl connection-string \
  --project-id "$NEON_PROJECT_ID" \
  --org-id "$NEON_ORG_ID" \
  --pooled 2>/dev/null | tail -1)
DIRECT=$(npx neonctl connection-string \
  --project-id "$NEON_PROJECT_ID" \
  --org-id "$NEON_ORG_ID" 2>/dev/null | tail -1)

if [[ -z "$POOLED" || -z "$DIRECT" ]]; then
  echo "Erreur : impossible de récupérer les URLs Neon. Lance : npx neonctl auth"
  exit 1
fi

echo "→ Mise à jour de .env (DATABASE_URL + DIRECT_URL)…"
python3 - "$POOLED" "$DIRECT" <<'PY'
import pathlib, re, sys
pooled, direct = sys.argv[1], sys.argv[2]
path = pathlib.Path(".env")
lines = path.read_text().splitlines() if path.exists() else []
out, seen = [], set()
for line in lines:
    if line.startswith("DATABASE_URL="):
        out.append(f'DATABASE_URL="{pooled}"')
        seen.add("DATABASE_URL")
    elif line.startswith("DIRECT_URL="):
        out.append(f'DIRECT_URL="{direct}"')
        seen.add("DIRECT_URL")
    else:
        out.append(line)
for key, val in [("DATABASE_URL", pooled), ("DIRECT_URL", direct)]:
    if key not in seen:
        out.append(f'{key}="{val}"')
path.write_text("\n".join(out) + "\n")
print("  .env mis à jour.")
PY

echo "→ Application du schéma Prisma sur Neon (schéma vierge)…"
export DATABASE_URL="$POOLED"
export DIRECT_URL="$DIRECT"
psql "$DIRECT" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
npx prisma migrate deploy

echo "→ Export / import des données (table par table)…"
export PGPASSWORD="$LOCAL_PASS"

TABLES=(
  "StravaAccount"
  "AthleteProfile"
  "DailyHealth"
  "Goal"
  "PhysicalNote"
  "Activity"
  "RunMetrics"
  "BikeMetrics"
  "SwimMetrics"
  "StrengthSet"
  "ActivityStream"
  "PhysicalCheckin"
  "PlannedSession"
)

for table in "${TABLES[@]}"; do
  DUMP="/tmp/sharpit-${table}.sql"
  pg_dump -h "$LOCAL_HOST" -U "$LOCAL_USER" -d "$LOCAL_DB" \
    --data-only --no-owner --no-acl \
    -t "\"${table}\"" \
    -f "$DUMP" 2>/dev/null || true
  if [[ -s "$DUMP" ]]; then
    echo "  · ${table}"
    psql "$DIRECT" -v ON_ERROR_STOP=1 -f "$DUMP" >/dev/null
    rm -f "$DUMP"
  fi
done

echo "→ Vérification…"
psql "$DIRECT" -t -c "SELECT 'activities='||count(*) FROM \"Activity\";" 
psql "$DIRECT" -t -c "SELECT 'strava='||count(*) FROM \"StravaAccount\";"

echo ""
echo "✓ Migration terminée. Relance : npm run dev"
echo "  Pense à configurer les mêmes DATABASE_URL / DIRECT_URL sur Vercel (dashboard → Environment Variables)."
