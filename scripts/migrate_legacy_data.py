#!/usr/bin/env python3
"""
Script de migração de dados legados do Rock Finance.

Copia transações da coleção legada no nível raiz (`transactions`) para a
estrutura de household configurada (`households/{HOUSEHOLD_ID}/transactions`).

Uso:
  # Modo simulação (Dry-Run por padrão):
  uv run python scripts/migrate_legacy_data.py

  # Execução real:
  uv run python scripts/migrate_legacy_data.py --confirm
"""

import os
import sys
import argparse
import logging
from typing import Dict, Any

# Adiciona o diretório raiz do projeto ao PATH do Python
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Carrega variáveis de ambiente se existir backend/.env
from dotenv import load_dotenv
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
if os.path.exists(env_path):
    load_dotenv(env_path)

from google.cloud import firestore

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("migrate_legacy")


def run_migration(confirm: bool = False) -> int:
    project_id = os.getenv("GCP_PROJECT_ID")
    database_id = os.getenv("FIRESTORE_DATABASE", "schemaless")
    household_id = os.getenv("HOUSEHOLD_ID", "rock-family")

    logger.info(f"--- Iniciando migração de dados legados ---")
    logger.info(f"Projeto GCP: {project_id or 'padrão (ADC)'}")
    logger.info(f"Database ID: {database_id}")
    logger.info(f"Household Alvo: {household_id}")
    logger.info(f"Modo: {'CONFIRMADO (Gravação Real)' if confirm else 'DRY-RUN (Simulação)'}")
    logger.info("-------------------------------------------")

    if not confirm:
        logger.warning("ATENÇÃO: Nenhum dado será alterado porque a flag --confirm não foi informada.")
        logger.warning("Para executar a migração real, rode: uv run python scripts/migrate_legacy_data.py --confirm\n")

    try:
        db = firestore.Client(project=project_id, database=database_id)
        legacy_ref = db.collection("transactions")
        target_ref = db.collection("households").document(household_id).collection("transactions")

        legacy_docs = list(legacy_ref.stream())
        total_found = len(legacy_docs)
        copied_count = 0
        skipped_count = 0
        error_count = 0

        logger.info(f"Documentos encontrados na coleção legada 'transactions': {total_found}")

        for doc in legacy_docs:
            doc_id = doc.id
            data = doc.to_dict()

            target_doc = target_ref.document(doc_id).get()
            if target_doc.exists:
                skipped_count += 1
                logger.info(f"[IGNORADO] Documento '{doc_id}' já existe no household '{household_id}'.")
                continue

            if confirm:
                try:
                    target_ref.document(doc_id).set(data)
                    copied_count += 1
                    logger.info(f"[COPIADO] Documento '{doc_id}' migrado com sucesso.")
                except Exception as e:
                    error_count += 1
                    logger.error(f"[ERRO] Falha ao copiar documento '{doc_id}': {e}")
            else:
                copied_count += 1
                logger.info(f"[SIMULAÇÃO] Documento '{doc_id}' seria copiado.")

        logger.info("\n=== Resumo da Migração ===")
        logger.info(f"Total encontrados: {total_found}")
        logger.info(f"Total {'copiados' if confirm else 'a copiar'}: {copied_count}")
        logger.info(f"Total ignorados (já existiam): {skipped_count}")
        logger.info(f"Total de erros: {error_count}")

        if error_count > 0:
            logger.error("A migração encerrou com erros.")
            return 1

        logger.info("Migração concluída com sucesso!")
        return 0

    except Exception as e:
        logger.error(f"Erro fatal durante a migração: {e}")
        return 1


def main():
    parser = argparse.ArgumentParser(description="Migração de transações legadas para a estrutura de household.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirma a gravação real dos dados no Firestore. Se omitido, executa apenas a simulação (dry-run).",
    )
    args = parser.parse_args()
    sys.exit(run_migration(confirm=args.confirm))


if __name__ == "__main__":
    main()
