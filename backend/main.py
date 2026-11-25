import sys
import os
from contextlib import asynccontextmanager

# Adiciona a raiz do projeto ao sys.path para garantir que 'backend' seja resolvível
# independentemente do diretório onde o uvicorn foi executado
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from backend.services.http_security import RequestSafetyMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Carrega variáveis de ambiente
env_path = os.path.join(os.path.dirname(__file__), ".env")
if not os.getenv("K_SERVICE") and os.getenv("ENVIRONMENT", "development") != "production":
    load_dotenv(env_path, override=False)

from backend.services.auth_service import validate_auth_startup
from backend.routers import transactions, dashboard, history, chat, config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validação rigorosa no startup (dev bypass guard, allowlist, configs do Firebase)
    validate_auth_startup()
    print("Rock Finance API iniciando...")
    yield
    print("Rock Finance API encerrando...")


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
app.add_middleware(RequestSafetyMiddleware)

@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
    ]})

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
    # CSP sem 'unsafe-inline' em script-src
    csp_policy = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://www.gstatic.com https://apis.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://*.firebaseio.com https://*.firebaseapp.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;"
    )
    response.headers["Content-Security-Policy"] = csp_policy
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "private, no-store"
    response.headers["Content-Security-Policy"] += " frame-ancestors 'none'; base-uri 'self'; object-src 'none';"
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
frontend_path = os.path.join(PROJECT_ROOT, "frontend")
if not is_prod and not os.getenv("K_SERVICE") and os.path.isdir(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
