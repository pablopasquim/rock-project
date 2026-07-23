#!/usr/bin/env bash
# ─── Agent Finance — Deploy Script ───────────────────────────────────────────
# Uso: bash deploy.sh
# Pré-requisitos: gcloud CLI autenticado, Docker instalado
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Configuração — EDITE AQUI ───────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-dev-pablo}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="agent-finance"
IMAGE_NAME="agent-finance-api"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
# Se não estiver exportada no terminal, tenta puxar do .env
if [[ -z "$GEMINI_API_KEY" && -f "backend/.env" ]]; then
  GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' backend/.env | cut -d '=' -f 2- | tr -d '\r' | tr -d '"' | tr -d "'")
fi
# ─────────────────────────────────────────────────────────────────────────────

# Cores para output
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Validações ───────────────────────────────────────────────────────────────
[[ -z "$PROJECT_ID" || "$PROJECT_ID" == "seu-projeto-gcp" ]] && error "Configure GCP_PROJECT_ID antes de rodar o deploy!"
[[ -z "$GEMINI_API_KEY" ]] && error "Configure GEMINI_API_KEY antes de rodar o deploy!"

info "Projeto GCP: $PROJECT_ID"
info "Região: $REGION"
info "Serviço: $SERVICE_NAME"

# ─── Configurar gcloud ────────────────────────────────────────────────────────
info "Configurando gcloud..."
gcloud config set project "$PROJECT_ID" --quiet

# ─── Habilitar APIs necessárias ───────────────────────────────────────────────
info "Habilitando APIs GCP..."
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

# ─── Criar repositório no Artifact Registry (se não existir) ─────────────────
REPO_EXISTS=$(gcloud artifacts repositories list --location="$REGION" --format="value(name)" 2>/dev/null | grep -c "agent-finance" || true)
if [[ "$REPO_EXISTS" -eq 0 ]]; then
  info "Criando repositório no Artifact Registry..."
  gcloud artifacts repositories create agent-finance \
    --repository-format=docker \
    --location="$REGION" \
    --description="Agent Finance Docker images" \
    --quiet
  success "Repositório criado"
else
  info "Repositório já existe, pulando criação"
fi

# ─── Configurar Firestore (se necessário) ─────────────────────────────────────
info "Verificando Firestore..."
gcloud firestore databases list --quiet 2>/dev/null | grep -q "(default)" && \
  info "Firestore já configurado" || \
  gcloud firestore databases create --location="$REGION" --quiet && success "Firestore criado"

# ─── Build e Push da imagem (Cloud Build) ────────────────────────────────────
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/agent-finance/${IMAGE_NAME}:latest"
info "Construindo e enviando imagem via Google Cloud Build (sem precisar de Docker local): $IMAGE_URI"

gcloud builds submit --tag "$IMAGE_URI" .
success "Imagem construída e enviada com sucesso"

# ─── Deploy no Cloud Run ──────────────────────────────────────────────────────
info "Fazendo deploy no Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60 \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},ENVIRONMENT=production,GEMINI_API_KEY=${GEMINI_API_KEY}" \
  --quiet

# ─── Resultado ────────────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="value(status.url)")

success "Deploy concluído!"
echo ""
echo -e "${GREEN}🚀 App disponível em: ${SERVICE_URL}${NC}"
echo -e "${GREEN}📊 Health check: ${SERVICE_URL}/api/health${NC}"
echo ""
