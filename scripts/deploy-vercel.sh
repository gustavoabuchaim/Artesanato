set -euo pipefail

: "${VERCEL_TOKEN:?Missing VERCEL_TOKEN}"
: "${VERCEL_ORG_ID:?Missing VERCEL_ORG_ID}"
: "${VERCEL_PROJECT_ID:?Missing VERCEL_PROJECT_ID}"

cd "$(dirname "$0")/../comunidade-online-mvp"

npx --yes vercel@latest pull --yes --environment=production --token "$VERCEL_TOKEN"
npx --yes vercel@latest build --prod --token "$VERCEL_TOKEN"
npx --yes vercel@latest deploy --prebuilt --prod --token "$VERCEL_TOKEN"

