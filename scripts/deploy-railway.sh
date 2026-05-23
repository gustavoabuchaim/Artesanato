set -euo pipefail

: "${RAILWAY_TOKEN:?Missing RAILWAY_TOKEN}"
: "${RAILWAY_PROJECT_ID:?Missing RAILWAY_PROJECT_ID}"

cd "$(dirname "$0")/../comunidade-ai-backend"

npx --yes @railway/cli@latest login --token "$RAILWAY_TOKEN"
npx --yes @railway/cli@latest link --project "$RAILWAY_PROJECT_ID"
npx --yes @railway/cli@latest up --detach ${RAILWAY_SERVICE_ID:+--service "$RAILWAY_SERVICE_ID"}
