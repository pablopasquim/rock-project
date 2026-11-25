# Robustez, segurança e custo — plano de implementação

**Objetivo:** corrigir os problemas confirmados da revisão mantendo Firebase Auth, Firestore e um único FastAPI, sem migrar dados nem publicar.

**Arquitetura aprovada na conversa:** rotas HTTP → serviço financeiro com regras puras → persistência Firestore. IA opcional recebe agregados calculados; Hosting serve frontend em produção. Domínio continua sendo uma casa financeira com até dois UIDs autorizados.

**Restrições:** nenhum commit/deploy ou alteração de dados reais; preservar exclusão preexistente do script legado. Valores antigos `amount` continuam legíveis; novos registros usam `amount_cents` como fonte de verdade, mantendo `amount` na API. IA desabilitada por padrão. Não adicionar infraestrutura paga, frameworks de agentes, novas funcionalidades de orçamento/metas ou migração de banco.

## Pacotes e critérios de aceitação

- [ ] Segurança HTTP e identidade (`backend/main.py`, `auth_service.py`, `config.py`, testes): traversal e APIs inexistentes retornam 404; JSON sensível não fica em cache; UID não autorizado retorna 403; cloud rejeita bypass; configuração não recarrega `.env` por requisição. Limitar corpo de requisições e sanitizar erros/logs.
- [ ] Regras financeiras (`backend/services/finance_service.py`, schemas, rotas): centavos inteiros e parcelas positivas cuja soma é exata; entrada rejeita infinito/subcentavo/categoria inválida; validação comum de mês; testes puros e HTTP.
- [ ] Persistência e leitura (`firestore_service.py`, dashboard/history/transactions): reutilizar consulta mensal em endpoint overview; remover varreduras inúteis; limites explícitos/paginação; cálculos completos; idempotência e exclusão recuperável com autoria. Validar funções reais com adaptador em memória e documentar gate Firestore/emulador.
- [ ] IA (`chat.py`, `gemini_service.py`, schemas): flag desabilitada por padrão, quota diária persistente por casa com atualização atômica, histórico limitado, respostas longas válidas, timeout/retries limitados, logs sem conteúdo e tokens de uso. Testar falhas/limites e consumo.
- [ ] Frontend (`app.js`, `auth.js`, módulos): dashboard consolidado; idempotência na criação; limpar sessão; foco contido no modal; nome correto do resultado mensal; IA desativada explicada; escape de dados de edição e CSV. Validar navegador mobile/desktop.
- [ ] Operação: exclusões do upload, identidade dedicada e segredo restrito no deploy, dependências corrigidas e fixadas, container não-root, regras Firestore fechadas para clientes, índices versionados, backup/restauração com dry-run, README operacional.
- [ ] Gate final: suíte completa, auditoria de dependências, verificações de sintaxe, inspeção de diff e navegador. Documentar limitações reais sem alegar validação de produção.

## Estratégia de execução

Execução sequencial nesta tarefa, com testes de regressão falhando antes de corrigir os comportamentos. O plano registra o desenho já aprovado pelo usuário; não exige nova aprovação para alterações locais. Publicação permanece condicionada a “pode publicar”.

### Casos de regressão obrigatórios

```python
# HTTP sem token: nenhum arquivo externo à raiz pública pode ser lido.
assert client.get('/%2e%2e/backend/requirements.txt').status_code == 404
# Entrada monetária inválida não chega à persistência.
assert client.post('/api/transactions', json={**payload, 'amount': 'Infinity'}).status_code == 422
# Distribuição em centavos: 100 / 3 -> 34, 33, 33.
assert [row['amount_cents'] for row in build_transactions(payload, user)] == [34, 33, 33]
```

Os testes concretos ficarão em `backend/tests/test_hardening.py`, `test_finance.py` e `test_persistence.py`, além dos testes existentes adaptados somente quando o contrato intencionalmente mudar.
