import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Carrega variáveis de ambiente
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path, override=True)

from backend.routers import transactions, dashboard, history, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Rock Finance API iniciando...")
    yield
    print("👋 Rock Finance API encerrando...")


app = FastAPI(
    title="Rock Finance API",
    description="API para gerenciamento de finanças pessoais com IA",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, restringir ao domínio do Cloud Run
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(transactions.router)
app.include_router(dashboard.router)
app.include_router(history.router)
app.include_router(chat.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
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
        # Para qualquer rota não-API, serve o index.html (SPA routing)
        full_path = os.path.join(frontend_path, path)
        if os.path.isfile(full_path):
            return FileResponse(full_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))
