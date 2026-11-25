#!/usr/bin/env bash
# ─── Agent Finance — Secure Deploy Script ─────────────────────────────────────
# Uso: bash deploy.sh
# Pré-requisitos: gcloud CLI autenticado, Secret Manager configurado
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Cores
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Carrega variáveis do arquivo backend/.env se disponível (com suporte a CRLF do Windows)
if [[ -f "backend/.env" ]]; then
  info "Carregando variáveis de ambiente de backend/.env..."
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=$(echo "$line" | tr -d '\r')
    if [[ -n "$line" && ! "$line" =~ ^[[:space:]]*# ]]; then
      export "$line" 2>/dev/null || true
    fi
  done < "backend/.env"
fi

SERVICE_NAME="${SERVICE_NAME:-agent-finance}"
IMAGE_NAME="${IMAGE_NAME:-agent-finance-api}"
ARTIFACT_REPO="${ARTIFACT_REPO:-agent-finance}"

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-}"
HOUSEHOLD_ID="${HOUSEHOLD_ID:-}"
ALLOWED_USER_EMAILS="${ALLOWED_USER_EMAILS:-}"
ALLOWED_USER_UIDS="${ALLOWED_USER_UIDS:-}"
AI_ENABLED="${AI_ENABLED:-false}"
AI_DAILY_LIMIT="${AI_DAILY_LIMIT:-20}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
APP_ORIGINS="${APP_ORIGINS:-}"

FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
FIREBASE_AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN:-}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${PROJECT_ID}}"
FIREBASE_APP_ID="${FIREBASE_APP_ID:-}"
GEMINI_KEY="${GEMINI_API_KEY:-}"

# ─── Validações Estritas de Variáveis de Ambiente ─────────────────────────────
[[ -z "$PROJECT_ID" || "$PROJECT_ID" == *"seu-projeto"* ]] && error "Configure GCP_PROJECT_ID explicitamente!"
[[ -z "$FIRESTORE_DATABASE" ]] && error "Configure FIRESTORE_DATABASE explicitamente (ex: '(default)' ou o nome do seu banco)!"
[[ -z "$HOUSEHOLD_ID" || "$HOUSEHOLD_ID" == *"placeholder"* ]] && error "Configure HOUSEHOLD_ID explicitamente!"
[[ -z "$ALLOWED_USER_EMAILS" ]] && error "Configure ALLOWED_USER_EMAILS explicitamente!"
[[ -z "$ALLOWED_USER_UIDS" ]] && error "Configure ALLOWED_USER_UIDS (1 ou 2 UIDs do Firebase Auth, separados por vírgula)!"
[[ "$ALLOWED_USER_EMAILS" == *"example.com"* ]] && error "ALLOWED_USER_EMAILS não pode conter e-mails 'example.com' de placeholder!"
[[ -z "$APP_ORIGINS" ]] && error "Configure APP_ORIGINS com a URL de produção do seu app!"
[[ "$APP_ORIGINS" == *"DOMINIO-DO-CLOUD-RUN"* ]] && error "APP_ORIGINS não pode ser um placeholder!"
[[ -z "$FIREBASE_API_KEY" || -z "$FIREBASE_APP_ID" ]] && error "Configure FIREBASE_API_KEY e FIREBASE_APP_ID explicitamente!"

info "Iniciando validação e build para $PROJECT_ID (Serviço: $SERVICE_NAME)..."

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

# 3. Garantir permissões de Secret Manager para a Service Account do Cloud Run
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)" 2>/dev/null || echo "")
if [[ -n "$PROJECT_NUMBER" ]]; then
  COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  info "Garantindo permissões no Secret Manager para a Service Account: $COMPUTE_SA"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet &>/dev/null || true
fi

# 4. Verificar e provisionar a secret 'gemini-api-key' no Secret Manager se não existir
if [[ -n "$GEMINI_KEY" ]]; then
  if ! gcloud secrets describe gemini-api-key --project="$PROJECT_ID" &>/dev/null; then
    info "Criando secret 'gemini-api-key' no Secret Manager..."
    printf "%s" "$GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=- --project="$PROJECT_ID" --quiet
  fi
fi

# 5. Validar URL atual do Cloud Run antes do deploy (se o serviço já existir)
EXISTING_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")

if [[ -n "$EXISTING_URL" ]]; then
  info "Serviço já existente encontrado no Cloud Run: $EXISTING_URL"
  if [[ "$APP_ORIGINS" != *"$EXISTING_URL"* ]]; then
    error "A URL atual do Cloud Run ($EXISTING_URL) não está presente em APP_ORIGINS ($APP_ORIGINS)! Abortando deploy com origem divergente."
  fi
fi

# 6. Verificar existência do repositório no Artifact Registry
info "Verificando se o repositório '$ARTIFACT_REPO' existe no Artifact Registry ($REGION)..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" &>/dev/null; then
  error "Repositório '$ARTIFACT_REPO' não existe no Artifact Registry na região '$REGION'. Crie o repositório primeiro."
fi

# 7. Gerar arquivo temporário de env-vars seguro
ENV_YAML_TMP=$(mktemp /tmp/agent_finance_env_XXXXXX.yaml 2>/dev/null || mktemp tmp_agent_finance_env_XXXXXX.yaml)
chmod 600 "$ENV_YAML_TMP"
trap 'rm -f "$ENV_YAML_TMP"' EXIT

cat <<EOF > "$ENV_YAML_TMP"
ENVIRONMENT: "production"
GCP_PROJECT_ID: "${PROJECT_ID}"
FIRESTORE_DATABASE: "${FIRESTORE_DATABASE}"
HOUSEHOLD_ID: "${HOUSEHOLD_ID}"
ALLOWED_USER_EMAILS: "${ALLOWED_USER_EMAILS}"
ALLOWED_USER_UIDS: "${ALLOWED_USER_UIDS}"
AI_ENABLED: "${AI_ENABLED}"
AI_DAILY_LIMIT: "${AI_DAILY_LIMIT}"
GEMINI_MODEL: "${GEMINI_MODEL}"
APP_ORIGINS: "${APP_ORIGINS}"
FIREBASE_API_KEY: "${FIREBASE_API_KEY}"
FIREBASE_AUTH_DOMAIN: "${FIREBASE_AUTH_DOMAIN:-${PROJECT_ID}.firebaseapp.com}"
FIREBASE_PROJECT_ID: "${FIREBASE_PROJECT_ID}"
FIREBASE_APP_ID: "${FIREBASE_APP_ID}"
AUTH_DEV_BYPASS: "false"
EOF

# 8. Build via Google Cloud Build
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_NAME}:latest"
info "Construindo imagem de produção via Cloud Build: $IMAGE_URI"
gcloud builds submit --tag "$IMAGE_URI" .
success "Imagem construída com sucesso!"

# 9. Deploy no Cloud Run (max-instances=1, secrets via Secret Manager)
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

# 10. Obter e validar a URL pós-deploy do Cloud Run
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")

if [[ -z "$SERVICE_URL" ]]; then
  error "Não foi possível obter a URL do Cloud Run para o serviço '$SERVICE_NAME'."
fi

if [[ "$APP_ORIGINS" != *"$SERVICE_URL"* ]]; then
  error "A URL pós-deploy do Cloud Run ($SERVICE_URL) não está presente em APP_ORIGINS ($APP_ORIGINS)! Origem divergente detectada."
fi

success "Deploy de produção concluído com sucesso!"
echo ""
echo -e "${GREEN}🚀 App disponível em: ${SERVICE_URL}${NC}"
echo -e "${GREEN}📊 Health Check: ${SERVICE_URL}/api/health${NC}"
