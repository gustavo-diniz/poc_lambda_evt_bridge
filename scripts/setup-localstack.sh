#!/usr/bin/env bash
# =============================================================
# setup-localstack.sh
# Cria S3, SQS e deploya as Lambdas no LocalStack para testes locais.
# Pré-requisito: docker compose up -d (LocalStack rodando)
# Uso: bash scripts/setup-localstack.sh
# =============================================================

set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-sa-east-1}"
ACCOUNT_ID="000000000000"

AWS="aws --endpoint-url=$ENDPOINT --region $REGION"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Recursos
# ---------------------------------------------------------------------------

BUCKETS=(
  "bucket-desenrola-digio:pendentes/:processados/:erros/"
  "fgo-input-file:pendente/:processados/:erros/"
)

FILAS=(
  "sqs-solic-protocolo-saldo"
  "sqs-res-saldo"
  "sqs-solic-protocolo-reserva"
  "sqs-res-reserva"
  "fgo_input_file"
)

LAMBDA_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/lambda-role"

# Lambda 01 — Desenrola CSV reader
L1_NOME="desenrola-csv-reader"
L1_ZIP="$ROOT_DIR/lambda/01_check_csv_documents_desenrola/lambda.zip"
L1_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${L1_NOME}"
L1_BUCKET="bucket-desenrola-digio"
L1_PREFIX="pendentes/"

# Lambda 02 — FGO CSV reader
L2_NOME="fgo-csv-reader"
L2_ZIP="$ROOT_DIR/lambda/02_fgo_csv_reader/lambda.zip"
L2_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${L2_NOME}"
L2_BUCKET="fgo-input-file"
L2_PREFIX="pendente/"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_ok()    { printf "  \033[32m[OK]\033[0m   %s\n" "$1"; }
log_skip()  { printf "  \033[33m[SKIP]\033[0m %s\n" "$1"; }
log_err()   { printf "  \033[31m[ERRO]\033[0m %s\n" "$1" >&2; }
log_title() { printf "\n\033[1m>>> %s\033[0m\n" "$1"; }

bucket_existe() {
  $AWS s3api head-bucket --bucket "$1" > /dev/null 2>&1
}

fila_existe() {
  $AWS sqs get-queue-url --queue-name "$1" > /dev/null 2>&1
}

lambda_existe() {
  $AWS lambda get-function --function-name "$1" > /dev/null 2>&1
}

# ---------------------------------------------------------------------------
# 0. Caminhos + LocalStack
# ---------------------------------------------------------------------------

log_title "Caminhos resolvidos"
printf "  ROOT_DIR : %s\n" "$ROOT_DIR"
printf "  L1_ZIP   : %s  %s\n" "$L1_ZIP" "$([ -f "$L1_ZIP" ] && echo '[OK]' || echo '[ausente - sera gerado]')"
printf "  L2_ZIP   : %s  %s\n" "$L2_ZIP" "$([ -f "$L2_ZIP" ] && echo '[OK]' || echo '[ausente - sera gerado]')"

log_title "Verificando LocalStack..."

if ! curl -sf "$ENDPOINT/_localstack/health" > /dev/null 2>&1; then
  log_err "LocalStack não responde em $ENDPOINT"
  log_err "Execute 'docker compose up -d' antes deste script."
  exit 1
fi

log_ok "LocalStack está rodando em $ENDPOINT"

# ---------------------------------------------------------------------------
# 1. S3 Buckets
# ---------------------------------------------------------------------------

log_title "S3 — Buckets"

for entry in "${BUCKETS[@]}"; do
  IFS=':' read -ra partes <<< "$entry"
  bucket="${partes[0]}"
  pastas=("${partes[@]:1}")

  if bucket_existe "$bucket"; then
    log_skip "Bucket '$bucket' já existe."
  else
    $AWS s3 mb "s3://$bucket" > /dev/null
    log_ok "Bucket '$bucket' criado."
  fi

  for pasta in "${pastas[@]}"; do
    $AWS s3api put-object --bucket "$bucket" --key "$pasta" > /dev/null 2>&1 || true
    log_ok "  pasta: $bucket/$pasta"
  done
done

# ---------------------------------------------------------------------------
# 2. SQS Filas
# ---------------------------------------------------------------------------

log_title "SQS — Filas"

for fila in "${FILAS[@]}"; do
  if fila_existe "$fila"; then
    log_skip "Fila '$fila' já existe."
  else
    $AWS sqs create-queue \
      --queue-name "$fila" \
      --attributes VisibilityTimeout=900,MessageRetentionPeriod=86400 \
      > /dev/null
    log_ok "Fila '$fila' criada."
  fi
done

# ---------------------------------------------------------------------------
# 3. Lambdas
# ---------------------------------------------------------------------------

build_zip_se_ausente() {
  local zip="$1"
  local dir
  dir="$(dirname "$zip")"

  [ -f "$zip" ] && return 0

  log_ok "  Gerando lambda.zip em: $dir"

  if ! command -v zip > /dev/null 2>&1; then
    log_err "Comando 'zip' não encontrado. Instale zip ou crie o lambda.zip manualmente em: $dir"
    exit 1
  fi

  (cd "$dir" && zip -r lambda.zip src/ package.json package-lock.json node_modules/ > /dev/null)
  log_ok "  lambda.zip gerado."
}

deploy_lambda() {
  local nome="$1"
  local zip="$2"
  local handler="$3"
  local env_json="$4"

  log_title "Lambda — $nome"

  build_zip_se_ausente "$zip"

  if [ ! -f "$zip" ]; then
    log_err "lambda.zip não encontrado após tentativa de geração: $zip"
    exit 1
  fi

  if lambda_existe "$nome"; then
    $AWS lambda update-function-code \
      --function-name "$nome" \
      --zip-file "fileb://$zip" \
      > /dev/null
    log_ok "Lambda '$nome' atualizada."
  else
    $AWS lambda create-function \
      --function-name "$nome" \
      --runtime       "nodejs20.x" \
      --role          "$LAMBDA_ROLE" \
      --handler       "$handler" \
      --zip-file      "fileb://$zip" \
      --environment   "$env_json" \
      --timeout       60 \
      --memory-size   256 \
      > /dev/null
    log_ok "Lambda '$nome' criada."
  fi
}

configurar_trigger() {
  local nome="$1"
  local arn="$2"
  local bucket="$3"
  local prefix="$4"
  local suffix="${5:-.csv}"
  local stmt_id="allow-s3-${bucket}"

  if $AWS lambda get-policy --function-name "$nome" 2>/dev/null | grep -q "$stmt_id"; then
    log_skip "Permissão '$stmt_id' já existe."
  else
    $AWS lambda add-permission \
      --function-name "$nome" \
      --statement-id  "$stmt_id" \
      --action        "lambda:InvokeFunction" \
      --principal     "s3.amazonaws.com" \
      --source-arn    "arn:aws:s3:::${bucket}" \
      > /dev/null
    log_ok "Permissão adicionada: S3($bucket) → Lambda($nome)"
  fi

  local notif
  notif='{"LambdaFunctionConfigurations":[{"LambdaFunctionArn":"'"$arn"'","Events":["s3:ObjectCreated:*"],"Filter":{"Key":{"FilterRules":[{"Name":"prefix","Value":"'"$prefix"'"},{"Name":"suffix","Value":"'"$suffix"'"}]}}}]}'

  $AWS s3api put-bucket-notification-configuration \
    --bucket "$bucket" \
    --notification-configuration "$notif"

  log_ok "Trigger: s3://$bucket/${prefix}*${suffix} → Lambda:$nome"
}

# --- Lambda 01: Desenrola ---

L1_ENV='{"Variables":{"AWS_REGION":"'"$REGION"'","AWS_ENDPOINT_URL":"'"$ENDPOINT"'","S3_BUCKET":"bucket-desenrola-digio","S3_PASTA_PENDENTES":"pendentes/","S3_PASTA_PROCESSADOS":"processados/","S3_PASTA_ERROS":"erros/","SQS_PROTOCOLO_SALDO":"'"$ENDPOINT/$ACCOUNT_ID/sqs-solic-protocolo-saldo"'","CSV_SEPARADOR":";"}}'

deploy_lambda     "$L1_NOME" "$L1_ZIP" "src/index.handler" "$L1_ENV"
configurar_trigger "$L1_NOME" "$L1_ARN" "$L1_BUCKET" "$L1_PREFIX"

# --- Lambda 02: FGO ---

L2_ENV='{"Variables":{"AWS_REGION":"'"$REGION"'","AWS_ENDPOINT_URL":"'"$ENDPOINT"'","S3_BUCKET":"fgo-input-file","S3_PASTA_PENDENTES":"pendente/","S3_PASTA_PROCESSADOS":"processados/","S3_PASTA_ERROS":"erros/","SQS_FGO_INPUT":"'"$ENDPOINT/$ACCOUNT_ID/fgo_input_file"'","CSV_SEPARADOR":";"}}'

deploy_lambda     "$L2_NOME" "$L2_ZIP" "src/index.handler" "$L2_ENV"
configurar_trigger "$L2_NOME" "$L2_ARN" "$L2_BUCKET" "$L2_PREFIX"

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------

printf "\n%s\n" "======================================================="
printf "  Setup concluído!\n"
printf "%s\n\n" "======================================================="
printf "Buckets S3:\n"
for entry in "${BUCKETS[@]}"; do
  bucket="${entry%%:*}"
  printf "  s3://%s\n" "$bucket"
done
printf "\nFilas SQS:\n"
for fila in "${FILAS[@]}"; do
  printf "  %s/000000000000/%s\n" "$ENDPOINT" "$fila"
done
printf "\nFluxo Desenrola:\n"
printf "  Upload CSV -> s3://%s/pendentes/*.csv\n" "$L1_BUCKET"
printf "            ->  Lambda %s\n" "$L1_NOME"
printf "            ->  SQS sqs-solic-protocolo-saldo\n"
printf "\nFluxo FGO:\n"
printf "  Upload CSV -> s3://%s/pendente/*.csv\n" "$L2_BUCKET"
printf "            ->  Lambda %s\n" "$L2_NOME"
printf "            ->  SQS fgo_input_file\n\n"
