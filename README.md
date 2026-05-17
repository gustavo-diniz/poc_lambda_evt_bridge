# Projeto Desenrola 2.0 — Digio

Pipeline serverless para processamento em lote de protocolos FGTS do Programa Desenrola, usando AWS Lambda, SQS e S3 com emulação local via LocalStack.

---

## Visão geral

O sistema lê um CSV de CPFs, solicita o saldo FGTS de cada trabalhador na API da Caixa Econômica Federal, aguarda o processamento assíncrono via polling e gera um CSV de saída com os resultados.

```
EventBridge (10min)
      │
      ▼
  Lambda 1 ──── lê CSV_A do S3 ──── publica CPFs ──── SQS_1
                                                          │
                                                          ▼
                                                      Lambda 2 ──── API Caixa (solicita protocolo)
                                                          │
                                                          ▼
                                                        SQS_2
                                                          │
                                                          ▼
                                                      Lambda 3 ──── API Caixa (polling resultado)
                                                          │
                                                          ▼
                                                       MySQL

EventBridge (30min)
      │
      ▼
  Lambda 4 ──── consulta MySQL ──── gera CSV_B ──── S3 (saida/)
```

---

## Pré-requisitos

Antes de começar, instale e configure:

| Ferramenta | Versão mínima | Como verificar |
|---|---|---|
| [Node.js](https://nodejs.org) | 18.x | `node --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | qualquer recente | `docker --version` |
| [AWS CLI](https://aws.amazon.com/cli/) | 2.x | `aws --version` |
| MySQL Server | 8.0 | `mysql --version` |

> **Windows:** todos os comandos abaixo podem ser executados no PowerShell ou no terminal integrado do VS Code.

---

## Estrutura do projeto

```
projeto_desenrola/
├── database/                        # Scripts SQL de banco de dados
│   ├── 01_criar_banco_e_usuario.sql
│   ├── 02_criar_tabela.sql
│   └── 03_queries_monitoramento.sql
├── infra/                           # Scripts de infraestrutura AWS (produção)
│   ├── 01_criar_sqs.sh
│   ├── 02_criar_eventbridge.sh
│   └── 03_criar_iam.sh
├── lambda1-csv-reader/              # Lê CSV do S3 e publica no SQS_1
├── lambda2-solicitar-protocolo/     # Solicita protocolo FGTS na API Caixa
├── lambda3-polling/                 # Faz polling do resultado na API Caixa
├── lambda4-gerar-csv/               # Gera CSV_B com os resultados
├── mock-caixa-server/               # Servidor Express que simula a API Caixa
├── tests/                           # Testes Jest (Lambdas 2 e 3)
├── scripts/
│   └── setup-localstack.ps1         # Cria buckets e filas no LocalStack
└── docker-compose.yml               # LocalStack (S3 + SQS emulados)
```

---

## Passo 1 — Configurar o banco de dados MySQL

Execute os scripts SQL na ordem indicada. Substitua `sua_senha_aqui` por uma senha segura.

**1.1 Criar o banco e o usuário da aplicação:**

```sql
-- Execute conectado como root
source database/01_criar_banco_e_usuario.sql;
```

**1.2 Criar a tabela principal:**

```sql
source database/02_criar_tabela.sql;
```

Ou execute direto pelo terminal:

```bash
mysql -u root -p < database/01_criar_banco_e_usuario.sql
mysql -u root -p < database/02_criar_tabela.sql
```

Após a execução, o banco `desenrola` existirá com o usuário `desenrola_user` e a tabela `protocolos_desenrola`.

---

## Passo 2 — Iniciar o LocalStack (S3 + SQS locais)

O LocalStack emula os serviços AWS localmente na porta `4566`.

**2.1 Subir o container:**

```bash
docker compose up -d
```

**2.2 Verificar se está saudável:**

```bash
docker compose ps
# Deve mostrar: localstack   Up
```

Ou acesse: `http://localhost:4566/_localstack/health`

**2.3 Criar o bucket S3 e as filas SQS:**

```powershell
.\scripts\setup-localstack.ps1
```

> O script cria automaticamente: bucket `bucket-desenrola`, pastas `pendentes/`, `processados/`, `saida/`, e as filas `sqs1`, `sqs2`, `dlq`.

Para confirmar que as filas foram criadas:

```bash
aws --endpoint-url=http://localhost:4566 --region us-east-1 sqs list-queues
```

---

## Passo 3 — Configurar variáveis de ambiente

Cada Lambda tem seu próprio `.env`. Copie os exemplos e ajuste conforme abaixo.

### Lambda 1 — CSV Reader

```bash
cp lambda1-csv-reader/.env.example lambda1-csv-reader/.env
```

Edite `lambda1-csv-reader/.env`:

```env
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566

S3_BUCKET=bucket-desenrola
S3_PASTA_PENDENTES=pendentes/
S3_PASTA_PROCESSADOS=processados/

SQS_URL_1=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/sqs1

CSV_SEPARADOR=|
```

### Lambda 2 — Solicitar Protocolo

```bash
cp lambda2-solicitar-protocolo/.env.example lambda2-solicitar-protocolo/.env
```

Edite `lambda2-solicitar-protocolo/.env`:

```env
# API Caixa (use localhost:9000 para o mock local)
CAIXA_API_URL=http://localhost:9000
CAIXA_API_KEY=fake-key
CAIXA_OAUTH_TOKEN=fake-token

# SQS
AWS_REGION=us-east-1
SQS_URL_1=http://localhost:4566/000000000000/sqs1
SQS_URL_2=http://localhost:4566/000000000000/sqs2
RETRY_VISIBILITY_SECONDS=30
MAX_TENTATIVAS=12

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=desenrola_user
DB_PASSWORD=sua_senha_aqui
DB_NAME=desenrola
```

### Lambda 3 — Polling

```bash
cp lambda3-polling/.env.example lambda3-polling/.env
```

Edite `lambda3-polling/.env`:

```env
# API Caixa (use localhost:9000 para o mock local)
CAIXA_API_URL=http://localhost:9000
CAIXA_API_KEY=fake-key
CAIXA_OAUTH_TOKEN=fake-token

# SQS
AWS_REGION=us-east-1
SQS_URL_2=http://localhost:4566/000000000000/sqs2
DLQ_URL=http://localhost:4566/000000000000/dlq
RETRY_VISIBILITY_SECONDS=30
MAX_TENTATIVAS=12
TEMPO_LIMITE_POLLING_MS=3600000

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=desenrola_user
DB_PASSWORD=sua_senha_aqui
DB_NAME=desenrola
```

### Lambda 4 — Gerar CSV

```bash
cp lambda4-gerar-csv/.env.example lambda4-gerar-csv/.env
```

Edite `lambda4-gerar-csv/.env`:

```env
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566

S3_BUCKET=bucket-desenrola
S3_PASTA_SAIDA=saida/

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=desenrola_user
DB_PASSWORD=sua_senha_aqui
DB_NAME=desenrola
```

---

## Passo 4 — Instalar dependências

Execute em cada diretório:

```bash
cd lambda1-csv-reader       && npm install && cd ..
cd lambda2-solicitar-protocolo && npm install && cd ..
cd lambda3-polling          && npm install && cd ..
cd lambda4-gerar-csv        && npm install && cd ..
cd mock-caixa-server        && npm install && cd ..
cd tests                    && npm install && cd ..
```

---

## Passo 5 — Iniciar o Mock da API Caixa

O mock server simula todos os endpoints da API Caixa localmente na porta `9000`.

```bash
cd mock-caixa-server
npm start
```

Saída esperada:

```
Mock Caixa API rodando em http://localhost:9000
```

O mock fica ativo em `http://localhost:9000`. Os `.env` dos Lambdas 2 e 3 já estão configurados para apontar para ele.

### CPFs especiais para testes

| CPF | Comportamento simulado |
|---|---|
| `00000000401` | Retorna erro 401 (não autenticado) |
| `00000000403` | Retorna erro 403 (sem autorização) |
| `00000000404` | Retorna erro 404 (trabalhador não localizado) |
| `00000000409` | Retorna erro 409 (operação em andamento) |
| `00000000500` | Retorna erro 500 (erro inesperado) |
| `00000002000` | Polling retorna rejeição (statusProtocolo 4) |
| `00000003000` | Polling retorna sucesso imediato (statusProtocolo 3) |
| qualquer outro | Fluxo normal (sucesso) |

---

## Passo 6 — Executar os testes

Os testes usam Jest com mocks automáticos — não é necessário ter o mock server ou o LocalStack rodando para os testes unitários.

```bash
cd tests
npm test
```

Para executar em modo watch (re-executa ao salvar arquivos):

```bash
npm run test:watch
```

Para gerar relatório de cobertura:

```bash
npm run test:coverage
```

### O que é testado

| Arquivo de teste | Lambda testada | Cenários |
|---|---|---|
| `lambda2-solicitar-protocolo.test.js` | Lambda 2 | Sucesso, timeout, erros 401/403/404/500, retry |
| `lambda3-polling.test.js` | Lambda 3 | Processada (status 3), em processamento (status 2), expirada, rejeição |

---

## Executando os Lambdas manualmente (desenvolvimento)

Para testar o fluxo ponta a ponta localmente, os Lambdas podem ser invocados diretamente pelo Node.js como se fossem funções Lambda.

### Lambda 1 — Ler CSV e publicar no SQS

Coloque um arquivo CSV em `s3://bucket-desenrola/pendentes/` (via LocalStack) e invoque:

```bash
cd lambda1-csv-reader
node -e "require('./src/index').handler({}).then(console.log).catch(console.error)"
```

Formato do CSV de entrada (`CSV_SEPARADOR=|`):

```
CPF|VLR_ACORDO_DIGIO|VLR_DIVIDA_ATUALIZADA
12345678901|1500.00|3200.00
98765432100|800.00|1200.00
```

### Lambda 2 — Solicitar protocolo

```bash
cd lambda2-solicitar-protocolo
node -e "require('./src/index').handler({}).then(console.log).catch(console.error)"
```

### Lambda 3 — Polling

```bash
cd lambda3-polling
node -e "require('./src/index').handler({}).then(console.log).catch(console.error)"
```

### Lambda 4 — Gerar CSV_B

```bash
cd lambda4-gerar-csv
node -e "require('./src/index').handler({}).then(console.log).catch(console.error)"
```

---

## Formato dos CSVs

### CSV_A (entrada) — pasta `pendentes/` no S3

```
CPF|VLR_ACORDO_DIGIO|VLR_DIVIDA_ATUALIZADA
12345678901|1500.00|3200.00
```

### CSV_B (saída) — pasta `saida/` no S3

```
CPF|VLR_ACORDO_DIGIO|VLR_DIVIDA_ATUALIZADA|protocolo_saldo|vrMaximoDebito|arquivo_origem|arquivo_destino
12345678901|1500.00|3200.00|987654321|2800.00|pendentes/arquivo.csv|saida/acordos_20240101_120000_concluidos.csv
```

---

## Banco de dados — tabela principal

```sql
-- protocolos_desenrola
id                    -- PK auto_increment
cpf                   -- CHAR(11), unique
vlr_acordo_digio      -- DECIMAL(15,2)
vlr_divida_atualizada -- DECIMAL(15,2)
arquivo_origem        -- VARCHAR(500)
protocolo             -- BIGINT (retornado pela API Caixa)
timestamp_criacao     -- DATETIME DEFAULT NOW()
tentativas            -- INT DEFAULT 0
status                -- ENUM: PENDENTE | OK | EXPIRADO | ERRO_PROTOCOLO
vr_maximo_debito      -- DECIMAL(15,2) (preenchido no polling)
data_hora_consulta    -- VARCHAR(30)
motivo_expiracao      -- TEXT
csv_gerado            -- BOOLEAN DEFAULT FALSE
arquivo_destino       -- VARCHAR(200)
updated_at            -- DATETIME
```

Queries de monitoramento estão em [database/03_queries_monitoramento.sql](database/03_queries_monitoramento.sql).

---

## Variáveis de ambiente — resumo completo

| Variável | Lambdas | Descrição |
|---|---|---|
| `AWS_REGION` | 1, 2, 3, 4 | Região AWS (`us-east-1`) |
| `AWS_ENDPOINT_URL` | 1, 4 | URL do LocalStack (`http://localhost:4566`) |
| `S3_BUCKET` | 1, 4 | Nome do bucket S3 |
| `S3_PASTA_PENDENTES` | 1 | Pasta de CSVs a processar |
| `S3_PASTA_PROCESSADOS` | 1 | Pasta após leitura |
| `S3_PASTA_SAIDA` | 4 | Pasta de CSVs gerados |
| `SQS_URL_1` | 1, 2 | URL da fila de entrada |
| `SQS_URL_2` | 2, 3 | URL da fila de protocolos |
| `DLQ_URL` | 3 | URL da Dead Letter Queue |
| `RETRY_VISIBILITY_SECONDS` | 2, 3 | Segundos para retentar (padrão: 300) |
| `MAX_TENTATIVAS` | 2, 3 | Máximo de tentativas antes de falhar (padrão: 12) |
| `TEMPO_LIMITE_POLLING_MS` | 3 | Tempo máximo de polling em ms (padrão: 3600000) |
| `CAIXA_API_URL` | 2, 3 | URL base da API Caixa |
| `CAIXA_API_KEY` | 2, 3 | API Key da Caixa |
| `CAIXA_OAUTH_TOKEN` | 2, 3 | Token OAuth da Caixa |
| `DB_HOST` | 2, 3, 4 | Host do MySQL |
| `DB_PORT` | 2, 3, 4 | Porta do MySQL (padrão: 3306) |
| `DB_USER` | 2, 3, 4 | Usuário do banco |
| `DB_PASSWORD` | 2, 3, 4 | Senha do banco |
| `DB_NAME` | 2, 3, 4 | Nome do banco (`desenrola`) |
| `CSV_SEPARADOR` | 1 | Separador do CSV (padrão: `\|`) |

---

## Checklist de setup local

- [ ] MySQL rodando e acessível
- [ ] Scripts SQL executados (`01` e `02`)
- [ ] `docker compose up -d` — LocalStack no ar
- [ ] `.\scripts\setup-localstack.ps1` — bucket e filas criados
- [ ] `.env` configurado em cada Lambda
- [ ] `npm install` em cada Lambda + mock-server + tests
- [ ] `cd mock-caixa-server && npm start` — mock no ar na porta 9000
- [ ] `cd tests && npm test` — todos os testes passando

---

## Documentação adicional

| Arquivo | Conteúdo |
|---|---|
| [DOC_API_FGTS_DESENROLA.md](DOC_API_FGTS_DESENROLA.md) | Especificação OpenAPI 3.0.1 completa da API Caixa |
| [INFRA_AWS.md](INFRA_AWS.md) | Configuração de infraestrutura AWS para produção |
| [json_fgts.json](json_fgts.json) | Especificação OpenAPI em formato JSON |
| [database/03_queries_monitoramento.sql](database/03_queries_monitoramento.sql) | Queries para monitorar o status de processamento |
