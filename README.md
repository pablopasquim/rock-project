# 💰 Rock Finance

> Aplicação de gerenciamento financeiro pessoal para casais/famílias, com suporte a **Shared Household**, **Firebase Authentication**, **XSS Prevention** e o assistente de IA **Rock Advisor** (Gemini 2.5 Flash).

---

## ✨ Funcionalidades Principais

- **Shared Household (Casa Financeira Compartilhada)** — Os dois usuários autorizados compartilham a mesma base de transações, histórico e dados financeiros sob o mesmo `HOUSEHOLD_ID`.
- **Firebase Authentication** — Autenticação por e-mail e senha com Firebase Web SDK v10 Modular e validação no backend via Firebase Admin SDK.
- **Controle de Acesso por E-mail** — Apenas e-mails listados na variável `ALLOWED_USER_EMAILS` recebem autorização (HTTP 403 para os demais).
- **Rock Advisor (Gemini 2.5 Flash)** — Assistente de IA refinado com `google-genai` SDK, `system_instruction` contínua, contexto do mês selecionado (`month_key`) e proteção contra XSS via DOMPurify.
- **Proteção XSS e Segurança** — Sanitização estrita de textos simples, parsing de Markdown seguro com DOMPurify, Content Security Policy (CSP) nos headers HTTP e handlers refatorados para `addEventListener`.
- **Rate Limiter Thread-Safe** — Limite de ~15 requisições por minuto por usuário no chat em memória (retornando HTTP 429).
- **Ferramentas de Migração Idempotente** — Script com modo **dry-run por padrão** para copiar transações legadas sem sobrescrever dados.

---

## 🏗️ Arquitetura

```
rock-project/
├── backend/                    ← Python + FastAPI
│   ├── main.py                 ← Entrypoint da API, CORS, CSP e handlers
│   ├── requirements.txt        ← Dependências (fastapi, google-genai, firebase-admin)
│   ├── requirements-dev.txt    ← Dependências de desenvolvimento e teste
│   ├── .env.example            ← Template de variáveis de ambiente
│   ├── models/
│   │   └── schemas.py          ← Validation schemas Pydantic & Month Key Validator
│   ├── routers/
│   │   ├── config.py           ← Configurações públicas do Firebase
│   │   ├── transactions.py     ← CRUD de transações com metadados do autor
│   │   ├── dashboard.py        ← Resumo e gráficos
│   │   ├── history.py          ← Histórico mensal + Exportação CSV autenticada
│   │   └── chat.py             ← Chat com Rock Advisor (Rate Limiter)
│   ├── services/
│   │   ├── auth_service.py     ← Verificação Firebase ID Token & Dev Bypass Guard
│   │   ├── firestore_service.py ← Scoping sob households/{HOUSEHOLD_ID}/transactions
│   │   └── gemini_service.py    ← Integração google-genai SDK
│   └── tests/
│       ├── conftest.py          ← Fixtures, mocks e setup
│       ├── test_auth.py         ← 5 testes de autenticação/dev bypass
│       ├── test_transactions.py ← 18 testes de transações
│       ├── test_dashboard.py    ← 15 testes de dashboard
│       ├── test_history.py      ← 14 testes de histórico
│       └── test_chat.py         ← 20 testes de chat e rate limit
├── frontend/                   ← SPA (HTML + CSS + JS)
│   ├── index.html              ← Template limpo, login card e acessibilidade
│   ├── index.css               ← Design System dark mode, tokens e animações
│   ├── auth.js                 ← Módulo centralizado de Auth (Firebase Modular v10)
│   ├── app.js                  ← Router, API Client com Token Interceptor e Modais
│   └── modules/
│       ├── dashboard.js        ← Dashboard e gráficos
│       ├── transactions.js     ← Lista de transações e filtros
│       ├── history.js          ← Histórico e comparação
│       └── chat.js             ← UI do Rock Advisor sanitizada com DOMPurify
├── scripts/
│   └── migrate_legacy_data.py  ← Script de migração idempotente (dry-run por padrão)
├── Dockerfile
├── deploy.sh                   ← Script de deploy automatizado em Cloud Run
└── pytest.ini
```

---

## 🛠️ Configuração Manual & Guia Passo a Passo

### 1. Criar o Segredo no Secret Manager (GCP)
```bash
gcloud secrets create gemini-api-key --replication-policy="automatic"
echo -n "SUA_CHAVE_GEMINI" | gcloud secrets versions add gemini-api-key --data-file=-
```

### 2. Conceder Acesso à Service Account do Cloud Run
```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Ativar o Firebase Authentication
1. Acesse o [Console do Firebase](https://console.firebase.google.com/).
2. Adicione o seu projeto Google Cloud ao Firebase.
3. No menu **Authentication**, clique em **Get Started** e ative o provedor **E-mail / Senha**.

### 4. Criar Manualmente os Usuários Autorizados
1. No console do Firebase em **Authentication > Users**, adicione os dois usuários da família (ex: `user1@example.com` e `user2@example.com`).
2. Defina as senhas para cada usuário.

### 5. Obter as Configurações Web do Firebase
1. Vá em **Project Settings (Configurações do Projeto) > General**.
2. Na seção **Your apps**, adicione uma Web App (`</>`).
3. Copie o objeto `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `appId`).

### 6. Executar a Migração de Dados Legados (via `uv`)
```bash
# Simulação (Dry-run por padrão):
uv run python scripts/migrate_legacy_data.py

# Execução real:
uv run python scripts/migrate_legacy_data.py --confirm
```

### 7. Configurar Alerta de Orçamento no Google Cloud
1. Acesse **Billing > Budgets & alerts** no Console GCP.
2. Crie um orçamento (ex: R$ 20/mês ou USD $5/mês) com alertas por e-mail em 50%, 90% e 100%.

### 8. Política de Limpeza no Artifact Registry
```bash
gcloud artifacts repositories set-cleanup-policies agent-finance \
  --location=us-central1 \
  --policy=policy.json
```

---

## 💻 Ambiente Local & Execução

### Usando `uv` (Recomendado):

**Linux / macOS:**
```bash
uv venv
source .venv/bin/activate
uv pip install -r backend/requirements.txt
uv pip install -r backend/requirements-dev.txt
uv run pytest -v
uvicorn backend.main:app --reload --port 8080
```

**Windows:**
```powershell
uv venv
.venv\Scripts\activate
uv pip install -r backend/requirements.txt
uv pip install -r backend/requirements-dev.txt
.venv\Scripts\python.exe -m pytest -v
uvicorn backend.main:app --reload --port 8080
```

> **Aviso sobre AUTH_DEV_BYPASS:**
> O parâmetro `AUTH_DEV_BYPASS=true` destina-se **exclusivamente a testes em desenvolvimento local**. A aplicação possui uma trava de segurança no startup que recusará a inicialização se `AUTH_DEV_BYPASS=true` for detectado em `ENVIRONMENT=production`. Nunca utilize o bypass em redes públicas.

---

## 🧪 Testes Automatizados

A suíte de testes cobre autenticação, isolamento de dados do household, sanitização XSS, validações Pydantic, rate limit no chat e rotas públicas vs protegidas.

```bash
# Executar todos os testes
.venv\Scripts\python.exe -m pytest -v
```

### Resultado dos Testes:
- **Testes atuais:** 80 passavam (100% sucesso)

---

## 📱 PWA e Firebase Hosting

O frontend é instalável como PWA no Android, iOS e desktop. O Service Worker mantém
somente o shell estático no cache; rotas `/api/**`, tokens e respostas financeiras
sempre passam pela rede.

As ilustrações do Rock Advisor ficam em `frontend/image/mascot/` no formato WebP
com transparência. As animações são feitas em CSS e respeitam a preferência
`prefers-reduced-motion` do sistema.

A experiência mobile inclui saldo com modo de privacidade, troca de mês por gesto,
atalhos de ação, cards que abrem o extrato já filtrado, skeletons de carregamento,
transições curtas entre módulos e formulário de transação em bottom sheet. Os
alvos interativos visíveis mantêm pelo menos 44 px e o layout é validado sem
overflow horizontal em uma viewport de 430 × 932. O avatar no cabeçalho abre o
perfil mobile com e-mail conectado, instalação, tema e logout confirmado.

O `firebase.json` serve os arquivos de `frontend/` pela CDN do Firebase Hosting e
encaminha `/api/**` para o serviço `agent-finance` no Cloud Run em `us-central1`.
Se o nome ou a região do serviço forem diferentes, ajuste esses dois campos antes
do deploy.

```bash
# Autenticar uma única vez e publicar o frontend
firebase login
firebase deploy --only hosting
```

Após o deploy:

1. Adicione `SEU_GCP_PROJECT_ID.web.app` aos domínios autorizados em
   **Firebase Authentication > Settings > Authorized domains**.
2. Para usar um endereço próprio, abra **Firebase Hosting > Add custom domain**,
   informe um domínio como `app.seudominio.com.br` e configure no provedor os
   registros DNS exibidos pelo Firebase.
3. Adicione a URL final ao `APP_ORIGINS` usado no deploy do Cloud Run, especialmente
   se o frontend vier a chamar a API fora do proxy de mesma origem.
4. No celular, use o botão **Instalar** no cabeçalho ou no banner mobile. Quando
   o navegador não oferece o prompt nativo, o app mostra as instruções para usar
   **Instalar app** ou **Adicionar à tela inicial** pelo menu do navegador.

---

## 📝 Licença

Projeto pessoal — uso livre.
