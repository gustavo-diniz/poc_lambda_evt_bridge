'use strict';

/**
 * Simula a execução do Lambda 01 localmente contra o LocalStack.
 *
 * Uso:
 *   node invoke-local.js [caminho-do-csv]
 *
 * Exemplo:
 *   node invoke-local.js ../../../lote_teste_simples.csv
 *
 * Requisitos:
 *   - LocalStack rodando em localhost:4566
 *   - Bucket e fila SQS criados (rode setup-localstack.js uma vez antes)
 */

require('dotenv').config({ path: '.env.localstack' });

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { SQSClient, CreateQueueCommand, GetQueueUrlCommand } = require('@aws-sdk/client-sqs');
const { handler } = require('./src/index');

const CSV_PATH = process.argv[2] || path.join(__dirname, 'lote_teste_local.csv');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET;
const PASTA_PENDENTES = process.env.S3_PASTA_PENDENTES || 'pendentes/';
const QUEUE_NAME = 'sqs-solic-protocolo-saldo';

async function garantirBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket já existe: ${BUCKET}`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket criado: ${BUCKET}`);
  }
}

async function garantirFila() {
  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
    console.log(`Fila já existe: ${QUEUE_NAME}`);
  } catch {
    await sqs.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }));
    console.log(`Fila criada: ${QUEUE_NAME}`);
  }
}

async function uploadCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Arquivo CSV não encontrado: ${csvPath}`);
  }

  const conteudo = fs.readFileSync(csvPath);
  const nomeArquivo = path.basename(csvPath);
  const key = `${PASTA_PENDENTES}${nomeArquivo}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: conteudo,
    ContentType: 'text/csv',
  }));

  console.log(`CSV enviado para S3: s3://${BUCKET}/${key}`);
  return { key, nomeArquivo };
}

function montarEventoS3(key, nomeArquivo) {
  return {
    Records: [
      {
        eventSource: 'aws:s3',
        eventName: 'ObjectCreated:Put',
        s3: {
          bucket: { name: BUCKET },
          object: {
            key: encodeURIComponent(key),
            size: 1,
          },
        },
      },
    ],
  };
}

async function main() {
  console.log('=== Invoke Local — Lambda 01 (csv-reader) ===\n');
  console.log(`LocalStack: ${process.env.AWS_ENDPOINT_URL}`);
  console.log(`Bucket:     ${BUCKET}`);
  console.log(`Fila SQS:   ${process.env.SQS_PROTOCOLO_SALDO}`);
  console.log(`CSV:        ${CSV_PATH}\n`);

  await garantirBucket();
  await garantirFila();

  const { key, nomeArquivo } = await uploadCsv(CSV_PATH);
  const evento = montarEventoS3(key, nomeArquivo);

  console.log('\n--- Iniciando handler ---\n');
  await handler(evento);
  console.log('\n=== Concluído ===');
}

main().catch((err) => {
  console.error('\nErro fatal:', err.message);
  process.exit(1);
});
