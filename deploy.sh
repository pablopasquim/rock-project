#!/usr/bin/env bash
# ─── Rock Finance — Secure Deploy Script ─────────────────────────────────────
# Uso: bash deploy.sh
# Pré-requisitos: gcloud CLI autenticado, Secret Manager configurado
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-rock-finance-prod}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="rock-finance"
IMAGE_NAME="rock-finance-api"

HOUSEHOLD_ID="${HOUSEHOLD_ID:-rock-family}"
ALLOWED_USER_EMAILS="${ALLOWED_USER_EMAILS:-user1@example.com,user2@example.com}"
APP_ORIGINS="${APP_ORIGINS:-https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app}"

FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
FIREBASE_AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN:-${PROJECT_ID}.firebaseapp.com}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${PROJECT_ID}}"
FIREBASE_APP_ID="${FIREBASE_APP_ID:-}"

# Cores
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Validações pré-deploy
[[ -z "$PROJECT_ID" || "$PROJECT_ID" == "seu-projeto-gcp" ]] && error "Configure GCP_PROJECT_ID antes de rodar o deploy!"
[[ -z "$ALLOWED_USER_EMAILS" ]] && error "Configure ALLOWED_USER_EMAILS antes de rodar o deploy!"

info "Iniciando validação e build para $PROJECT_ID ($SERVICE_NAME)..."

# 1. Configurar gcloud
gcloud config set project "$PROJECT_ID" --quiet

# 2. Habilitar APIs necessárias
info "Habilitando APIs GCP necessárias..."
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

# 3. Gerar arquivo temporário de env-vars (YAML) para tratar com segurança valores com vírgula
ENV_YAML_TMP="tmp_env_vars_deploy.yaml"
trap 'rm -f "$ENV_YAML_TMP"' EXIT

cat <<EOF > "$ENV_YAML_TMP"
ENVIRONMENT: "production"
GCP_PROJECT_ID: "${PROJECT_ID}"
FIRESTORE_DATABASE: "(default)"
HOUSEHOLD_ID: "${HOUSEHOLD_ID}"
ALLOWED_USER_EMAILS: "${ALLOWED_USER_EMAILS}"
APP_ORIGINS: "${APP_ORIGINS}"
FIREBASE_API_KEY: "${FIREBASE_API_KEY}"
FIREBASE_AUTH_DOMAIN: "${FIREBASE_AUTH_DOMAIN}"
FIREBASE_PROJECT_ID: "${FIREBASE_PROJECT_ID}"
FIREBASE_APP_ID: "${FIREBASE_APP_ID}"
AUTH_DEV_BYPASS: "false"
EOF

# 4. Build via Google Cloud Build
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/rock-finance/${IMAGE_NAME}:latest"
info "Construindo imagem de produção via Cloud Build: $IMAGE_URI"
gcloud builds submit --tag "$IMAGE_URI" .
success "Imagem construída com sucesso!"

# 5. Deploy no Cloud Run (max-instances=1, secrets via Secret Manager)
info "Fazendo deploy no Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60 \
  --env-vars-file="$ENV_YAML_TMP" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")

success "Deploy de produção concluído com sucesso!"
echo ""
echo -e "${GREEN}🚀 App disponível em: ${SERVICE_URL}${NC}"
echo -e "${GREEN}📊 Health Check: ${SERVICE_URL}/api/health${NC}"
