# Guia de Desenvolvimento Local

## Pré-requisitos

- Node.js >= 22
- Docker Desktop (opcional, para rodar via container)
- MySQL acessível (padrão: `192.168.3.251:3306`)
- AWS configurada (para SQS/S3 em ambiente real) **ou** LocalStack para rodar 100% local

---

## Arquitetura local

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   API principal         │        │   Mock Caixa + RHSSO     │
│   npm run dev           │ ──────▶│   node mock-server/      │
│   localhost:3000        │        │   localhost:9001         │
└─────────────────────────┘        └──────────────────────────┘
          │
          ▼
   MySQL 192.168.3.251:3306
   AWS SQS / S3 (sa-east-1)
```

---

## Passo 1 — Instalar dependências

```bash
npm install
```

---

## Passo 2 — Subir o Mock da Caixa (porta 9001)

Em um terminal dedicado:

```bash
cd mock-server
node server.js
```

O mock simula a API da Caixa Econômica Federal e o servidor RHSSO (OAuth2). Para ver todos os cenários e CPFs de teste disponíveis:

```bash
curl http://localhost:9001/cenarios
```

---

## Passo 3 — Subir a API principal (porta 3000)

Em outro terminal:

```bash
npm run dev
```

Usa `tsx watch` com hot-reload. O `.env` já aponta `HOST_API_CAIXA` e `RHSSO_HOST` para `localhost:9001`, então os dois serviços se comunicam automaticamente.

---

## Passo 4 — Testar endpoint por endpoint

### Health Check

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{ "status": "ok", "timestamp": "2026-05-26T10:00:00.000Z" }
```

---

### Endpoint 1 — Gerar Protocolo de Saldo

```bash
curl -X POST http://localhost:3000/saldo/gerar-protocolo \
  -H "Content-Type: application/json" \
  -d '{
    "cpf": "12345678901",
    "valorDivida": 5000,
    "valorAcordo": 3500,
    "arquivoOrigem": "lote_teste.csv"
  }'
```

Resposta esperada:
```json
{
  "message": "Protocolo de saldo gerado",
  "cpf": "12345678901",
  "valorDivida": 5000,
  "valorAcordo": 3500,
  "arquivoOrigem": "lote_teste.csv",
  "protocolo": 1001
}
```

---

### Endpoint 2 — Executar Saldo (consulta + gera reserva)

Use o `protocolo` retornado pelo endpoint anterior.

```bash
curl -X POST http://localhost:3000/saldo/executar \
  -H "Content-Type: application/json" \
  -d '{
    "cpf": "12345678901",
    "protocolo": "1001",
    "vlrDividaAtualizada": 5000,
    "vlrAcordoDigio": 3500,
    "arquivo_origem": "lote_teste.csv"
  }'
```

Resposta esperada:
```json
{
  "message": "Reserva executada com sucesso",
  "cpf": "12345678901",
  "protocolo": "1001",
  "protocoloReserva": 1002,
  "valorReserva": 2150.75
}
```

> `valorReserva` = `min(vlrAcordoDigio, saldoFGTS, 15000)`. O mock retorna `vrMaximoDebito: 2150.75`.

---

### Endpoint 3 — Executar Reserva (confirma status)

Use o `protocoloReserva` retornado pelo endpoint anterior.

```bash
curl -X POST http://localhost:3000/reserva/executar \
  -H "Content-Type: application/json" \
  -d '{
    "cpf": "12345678901",
    "protocolo": "1002",
    "arquivo_origem": "lote_teste.csv"
  }'
```

Resposta esperada (aprovado):
```json
{
  "message": "Protocolo de reserva executado",
  "protocolo": "1002",
  "resultado": null
}
```

---

### Endpoint 4 — Exportar CSV para S3

```bash
curl http://localhost:3000/reserva/exportacao/csv
```

Resposta esperada:
```json
{
  "message": "Exportação concluída com sucesso",
  "exportados": 1,
  "arquivos": ["lote_teste_output.csv"],
  "bucket": "desenrola-output"
}
```

---

## CPFs de teste disponíveis no mock

| CPF | Comportamento |
|-----|---------------|
| `12345678901` | Fluxo feliz — retorna `statusProtocolo: 3` imediatamente |
| `98765432100` | Fluxo feliz |
| `11122233344` | Fluxo feliz |
| `00000000401` | Erro 401 na Caixa (POST saldo) |
| `00000000403` | Erro 403 na Caixa (POST saldo) |
| `00000000404` | Erro 404 na Caixa — trabalhador não localizado |
| `00000000409` | Erro 409 — operação em andamento |
| `00000000500` | Erro 500 na Caixa (POST saldo) |
| `00000001404` | Erro 404 no GET de consulta de saldo |
| `00000001500` | Erro 500 no GET de consulta de saldo |
| `00000002000` | Reserva rejeitada pela Caixa (`statusProtocolo: 4`) |
| `00000003000` | `statusProtocolo: 3` imediato no GET de saldo |
| `00000020400` | Erro 400 na inclusão de dívida |
| `00000020403` | Erro 403 na inclusão de dívida |
| `00000020500` | Erro 500 na inclusão de dívida |
| `00000042000` | Inclusão de dívida rejeitada (`statusProtocolo: 4`) |
| `qualquer outro` | Fluxo feliz padrão |

---

## Build e Docker

### Build TypeScript

```bash
npm run build        # compila para ./dist
npm start            # build + node dist/index.js
```

### Docker

```bash
# Build da imagem
docker build -t desenrola .

# Rodar o container
docker run -p 3000:3000 --env-file .env desenrola
```

Para usar o health check como `HEALTHCHECK` no Dockerfile:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
```

---

## Testes

```bash
npm test             # executa uma vez
npm run test:watch   # modo watch
```

---

## Empacotar Lambdas para AWS

Cada Lambda é JavaScript puro e precisa ser zipada individualmente para deploy:

```bash
cd lambda/2-saldo-gerar-protocolo && npm run package
cd lambda/3-saldo-executar        && npm run package
cd lambda/4-reserva-executar      && npm run package
cd lambda/5-exportar-csv          && npm run package
```

> No Windows use Git Bash ou WSL para rodar o script de `zip`.

---

## Variáveis de ambiente (.env)

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta da API (padrão: 3000) |
| `RHSSO_HOST` | URL do servidor Keycloak/RHSSO |
| `RHSSO_CLIENT_ID` | Client ID OAuth2 |
| `RHSSO_CLIENT_SECRET` | Client Secret OAuth2 |
| `HOST_API_CAIXA` | URL base da API da Caixa |
| `API_CAIXA_SOLICITAR_PROTOCOLO_SALDO` | Path do endpoint de saldo |
| `API_CAIXA_CONSULTAR_PROTOCOLO` | Path do endpoint de consulta |
| `API_CAIXA_SOLICITAR_PROTOCOLO_DIVIDA` | Path do endpoint de inclusão de dívida |
| `SQS_SALDO_URL` | URL da fila SQS de saldo |
| `SQS_RESERVA_URL` | URL da fila SQS de reserva |
| `SQS_CONSULTAR_PROTOCOLO_SALDO` | URL da fila SQS de consulta de protocolo |
| `AWS_REGION` | Região AWS (padrão: sa-east-1) |
| `S3_OUTPUT_BUCKET` | Bucket S3 para exportação de CSV |
| `DB_HOST` | Host do MySQL |
| `DB_PORT` | Porta do MySQL (padrão: 3306) |
| `DB_USER` | Usuário do MySQL |
| `DB_PASSWORD` | Senha do MySQL |
| `DB_NAME` | Nome do banco de dados |
