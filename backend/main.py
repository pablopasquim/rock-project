import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Carrega variáveis de ambiente
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path, override=True)

from backend.services.auth_service import validate_dev_bypass_startup
from backend.routers import transactions, dashboard, history, chat, config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validação de segurança no startup
    validate_dev_bypass_startup()
    print("🚀 Rock Finance API iniciando...")
    yield
    print("👋 Rock Finance API encerrando...")


# Oculta Swagger/Docs em produção
is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"

app = FastAPI(
    title="Rock Finance API",
    description="API para gerenciamento de finanças pessoais com IA",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)

# ─── CORS Dinâmico ────────────────────────────────────────────────────────────
raw_origins = os.getenv("APP_ORIGINS", "http://localhost:8080")
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Content Security Policy Middleware ───────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    # CSP compatível com Firebase, Google Fonts, Chart.js, Lucide e Marked
    csp_policy = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://www.gstatic.com https://apis.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://*.firebase Financial https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(config.router)        # Público
app.include_router(transactions.router)  # Protegido
app.include_router(dashboard.router)     # Protegido
app.include_router(history.router)       # Protegido
app.include_router(chat.router)          # Protegido


# ─── Health Check Público (Sanitizado) ───────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
    }


# ─── Serve Frontend (produção) ────────────────────────────────────────────────
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/")
    def serve_spa():
        return FileResponse(os.path.join(frontend_path, "index.html"))

    @app.get("/{path:path}")
    def serve_spa_routes(path: str):
        full_path = os.path.join(frontend_path, path)
        if os.path.isfile(full_path):
            return FileResponse(full_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))
