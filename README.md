# 💰 Agent Finance

> App full-stack de finanças pessoais com assistente de IA integrado. Rastreie gastos, visualize tendências e converse com sua IA sobre seu dinheiro.

---

## ✨ Funcionalidades

- **Dashboard** — Cards de saldo, receitas e despesas com gráficos de categorias e evolução mensal
- **Transações** — Adicione, edite e exclua receitas e despesas com categorias e ícones
- **Histórico** — Navegue mês a mês, compare períodos, exporte CSV
- **Chat com IA** — Converse com o Gemini sobre seus dados (histórico otimizado p/ 5 mensagens)
- **Design premium** — Dark mode, glassmorphism, animações suaves, responsivo

---

## 🏗️ Arquitetura

```
agent-finance/
├── backend/                    ← Python + FastAPI
│   ├── main.py                 ← Entrypoint da API
│   ├── requirements.txt        ← Dependências de produção
│   ├── requirements-dev.txt    ← Dependências de teste
│   ├── .env.example            ← Template de variáveis de ambiente
│   ├── models/
│   │   └── schemas.py          ← Pydantic models (validação)
│   ├── routers/
│   │   ├── transactions.py     ← CRUD de transações
│   │   ├── dashboard.py        ← Resumo e gráficos
│   │   ├── history.py          ← Histórico mensal + CSV
│   │   └── chat.py             ← Chat com Gemini AI
│   ├── services/
│   │   ├── firestore_service.py ← Abstração do Firestore
│   │   └── gemini_service.py    ← Integração Gemini API
│   └── tests/
│       ├── conftest.py          ← Fixtures e mocks (sem credenciais reais)
│       ├── test_transactions.py ← 18 testes
│       ├── test_dashboard.py    ← 15 testes
│       ├── test_history.py      ← 14 testes
│       └── test_chat.py         ← 16 testes
├── frontend/                   ← SPA (HTML + CSS + JS)
│   ├── index.html
│   ├── index.css               ← Design system dark mode
│   ├── app.js                  ← Router + API client
│   └── modules/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── history.js
│       └── chat.js
├── Dockerfile
├── .dockerignore
├── deploy.sh                   ← Deploy automatizado no Cloud Run
├── setup.ps1                   ← Setup Windows (PowerShell)
├── setup.sh                    ← Setup Linux/Mac (Bash)
└── pytest.ini
```

---

## 🛠️ Stack Técnica

| Componente     | Tecnologia                   |
|----------------|------------------------------|
| Backend        | Python 3.10+ & FastAPI       |
| Banco de dados | Google Cloud Firestore       |
| IA / Chat      | Gemini 2.5 Flash             |
| Frontend       | HTML + CSS + JS (SPA)        |
| Gráficos       | Chart.js                     |
| Ícones         | Lucide Icons                 |
| Markdown       | Marked.js                    |
| Hosting        | Google Cloud Run             |
| Container      | Docker                       |

---

## 🚀 Setup Local

### Pré-requisitos

- Python 3.12+
- Conta no [Google Cloud](https://console.cloud.google.com/) com um projeto criado
- Firestore ativado no projeto ([guia](https://firebase.google.com/docs/firestore/quickstart))
- Gemini API Key — obtenha gratuitamente em [aistudio.google.com](https://aistudio.google.com/app/apikey)
- `gcloud` CLI autenticado (`gcloud auth application-default login`)

### 1. Clonar e fazer setup

**Windows (PowerShell):**
```powershell
git clone <url-do-repositório>
cd agent-finance
.\setup.ps1
```

**Linux / Mac:**
```bash
git clone <url-do-repositório>
cd agent-finance
bash setup.sh
```

O script automaticamente:
- Cria o ambiente virtual `venv/`
- Instala todas as dependências (produção + testes)
- Cria o arquivo `backend/.env` a partir do template

### 2. Configurar credenciais

Edite o arquivo `backend/.env`:

```env
GEMINI_API_KEY=sua_gemini_api_key_aqui
GCP_PROJECT_ID=seu_projeto_gcp_aqui
ENVIRONMENT=development
```

> **Como obter a Gemini API Key:**
> Acesse [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey), crie uma key e cole acima.

### 3. Ativar o venv e iniciar o servidor

**Windows:**
```powershell
.\venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --port 8080
```

**Linux / Mac:**
```bash
source venv/bin/activate
uvicorn backend.main:app --reload --port 8080
```

### 4. Acessar

Abra [http://localhost:8080](http://localhost:8080) no navegador. 🎉

---

## 🧪 Testes

Os testes usam mocks completos de Firestore e Gemini — **não precisam de credenciais GCP** e rodam offline.

```bash
# Ativar venv (se ainda não ativado)
source venv/bin/activate          # Linux/Mac
.\venv\Scripts\Activate.ps1       # Windows

# Rodar todos os testes
pytest

# Com output detalhado
pytest -v

# Um módulo específico
pytest backend/tests/test_transactions.py -v
pytest backend/tests/test_chat.py -v

# Por nome de teste
pytest -k "test_create_expense"
```

### Cobertura dos testes

| Arquivo                 | Testes | O que cobre                                          |
|-------------------------|--------|------------------------------------------------------|
| `test_transactions.py`  | 18     | Create, List (filtros), Update, Delete, Categories   |
| `test_dashboard.py`     | 15     | Summary, By-category, Monthly evolution              |
| `test_history.py`       | 14     | Meses disponíveis, Detalhes, Comparação, Export CSV  |
| `test_chat.py`          | 16     | Chat, Histórico, Sugestões, Health check, Erros      |
| **Total**               | **63** |                                                      |

---

## 🌐 API Endpoints

### Health
| Método | Rota         | Descrição       |
|--------|--------------|-----------------|
| GET    | `/api/health` | Health check   |

### Transações
| Método | Rota                        | Descrição                        |
|--------|-----------------------------|----------------------------------|
| POST   | `/api/transactions`         | Criar transação                  |
| GET    | `/api/transactions`         | Listar (filtros: month, category, type) |
| PUT    | `/api/transactions/{id}`    | Atualizar                        |
| DELETE | `/api/transactions/{id}`    | Deletar                          |
| GET    | `/api/transactions/categories` | Categorias disponíveis        |

### Dashboard
| Método | Rota                              | Descrição                     |
|--------|-----------------------------------|-------------------------------|
| GET    | `/api/dashboard/summary`          | Saldo, receitas, despesas     |
| GET    | `/api/dashboard/by-category`      | Gastos agrupados por categoria|
| GET    | `/api/dashboard/monthly-evolution`| Evolução dos últimos N meses  |

### Histórico
| Método | Rota                       | Descrição                          |
|--------|----------------------------|------------------------------------|
| GET    | `/api/history/months`      | Meses com dados disponíveis        |
| GET    | `/api/history/{year}/{month}` | Detalhes de um mês              |
| GET    | `/api/history/compare`     | Comparação entre dois meses        |
| GET    | `/api/history/export`      | Exportar CSV                       |

### Chat IA
| Método | Rota                  | Descrição                      |
|--------|-----------------------|--------------------------------|
| POST   | `/api/chat`           | Enviar mensagem ao Gemini      |
| GET    | `/api/chat/suggestions` | Sugestões de perguntas       |

A documentação interativa completa da API está disponível em [http://localhost:8080/docs](http://localhost:8080/docs) (Swagger UI).

---

## 🐳 Deploy no Cloud Run

### Pré-requisitos de deploy
- Docker instalado
- `gcloud` CLI autenticado com permissões de Cloud Run, Firestore e Artifact Registry

### Executar o deploy

```bash
export GCP_PROJECT_ID=seu-projeto-gcp
export GEMINI_API_KEY=sua_gemini_api_key
bash deploy.sh
```

O script automaticamente:
1. Habilita as APIs GCP necessárias
2. Cria repositório no Artifact Registry
3. Inicializa o Firestore (se necessário)
4. Faz build e push da imagem Docker
5. Faz deploy no Cloud Run com `--min-instances=0` (escala para zero = custo zero quando inativo)

Ao final, o script exibe a URL pública do serviço.

---

## 📊 Estrutura do Firestore

```
(database)
├── transactions/           ← Coleção principal
│   └── {auto-id}/
│       ├── type            "expense" | "income"
│       ├── amount          150.00
│       ├── category        "alimentacao"
│       ├── description     "Supermercado"
│       ├── date            "2026-07-18"
│       ├── month_key       "2026-07"   ← índice para queries por mês
│       └── created_at      timestamp
└── chat_history/           ← Histórico do chat com IA
    └── {auto-id}/
        ├── role            "user" | "assistant"
        ├── content         "..."
        └── created_at      timestamp
```

---

## 🗂️ Categorias

| Tipo    | Categorias disponíveis                                              |
|---------|---------------------------------------------------------------------|
| Despesa | Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros   |
| Receita | Salário, Freelance, Outros                                          |

---

## 🔧 Desenvolvimento

### Adicionar uma nova categoria

1. Em `backend/routers/transactions.py`, adicione a categoria na lista do endpoint `GET /api/transactions/categories`
2. Em `frontend/app.js`, adicione o emoji correspondente no `iconMap`
3. Em `frontend/modules/dashboard.js` e `history.js`, adicione o emoji no `catEmoji`

### Variáveis de ambiente

| Variável          | Obrigatório | Descrição                              |
|-------------------|-------------|----------------------------------------|
| `GEMINI_API_KEY`  | Sim         | Key da API do Google Gemini            |
| `GCP_PROJECT_ID`  | Sim         | ID do projeto GCP (usado pelo Firestore) |
| `ENVIRONMENT`     | Não         | `development` ou `production`          |

---

## 📝 Licença

Projeto pessoal — uso livre.
