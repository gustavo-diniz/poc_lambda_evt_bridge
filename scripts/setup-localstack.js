'use strict';

/**
 * Cria todos os recursos AWS no LocalStack (S3 + SQS + Lambda) para rodar o projeto localmente.
 *
 * Uso:
 *   node scripts/setup-localstack.js
 *
 * Requisitos:
 *   - LocalStack rodando em http://localhost:4566
 */

const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  PutBucketNotificationConfigurationCommand,
} = require('@aws-sdk/client-s3');
const {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} = require('@aws-sdk/client-sqs');
const {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const fs   = require('fs');
const path = require('path');

const ENDPOINT   = process.env.AWS_ENDPOINT_URL        || 'http://localhost:4566';
const REGION     = process.env.AWS_REGION              || 'sa-east-1';
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID       || 'test';
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY   || 'test';
const ACCOUNT_ID = '000000000000';

const clientCfg = {
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
};

const s3     = new S3Client({ ...clientCfg, forcePathStyle: true });
const sqs    = new SQSClient(clientCfg);
const lambda = new LambdaClient(clientCfg);

// ---------------------------------------------------------------------------
// Recursos a criar
// ---------------------------------------------------------------------------

const BUCKETS = [
  {
    nome: 'bucket-desenrola-digio',
    pastas: ['pendentes/', 'processados/', 'erros/'],
  },
  {
    nome: 'fgo-input-file',
    pastas: ['pendente/', 'processados/', 'erros/'],
  },
];

const FILAS = [
  { nome: 'sqs-solic-protocolo-saldo',    visibilityTimeout: '900' },
  { nome: 'sqs-res-saldo',                visibilityTimeout: '900' },
  { nome: 'sqs-solic-protocolo-reserva',  visibilityTimeout: '900' },
  { nome: 'sqs-res-reserva',              visibilityTimeout: '900' },
  { nome: 'fgo_input_file',               visibilityTimeout: '900' },
];

// Lambda que processa o CSV do FGO ao ser depositado no S3
const LAMBDA_FGO_CSV_READER = {
  nome:    'fgo-csv-reader',
  handler: 'src/index.handler',
  runtime: 'nodejs20.x',
  zipPath: path.join(__dirname, '..', 'lambda', '02_fgo_csv_reader', 'lambda.zip'),
  timeout: 60,
  env: {
    AWS_REGION:            REGION,
    AWS_ENDPOINT_URL:      ENDPOINT,
    S3_BUCKET:             'fgo-input-file',
    S3_PASTA_PENDENTES:    'pendente/',
    S3_PASTA_PROCESSADOS:  'processados/',
    S3_PASTA_ERROS:        'erros/',
    SQS_FGO_INPUT:         `${ENDPOINT}/${ACCOUNT_ID}/fgo_input_file`,
    CSV_SEPARADOR:         ';',
  },
  // Trigger: qualquer .csv depositado na pasta pendente/ do bucket fgo-input-file
  trigger: {
    bucket: 'fgo-input-file',
    prefix: 'pendente/',
    suffix: '.csv',
  },
};

// ---------------------------------------------------------------------------
// Helpers — S3
// ---------------------------------------------------------------------------

async function garantirBucket(nome, pastas) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: nome }));
    console.log(`  [S3] bucket já existe:  ${nome}`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: nome }));
    console.log(`  [S3] bucket criado:     ${nome}`);
  }

  for (const pasta of pastas) {
    await s3.send(new PutObjectCommand({ Bucket: nome, Key: pasta, Body: '' }));
    console.log(`       pasta criada:      ${nome}/${pasta}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers — SQS
// ---------------------------------------------------------------------------

async function garantirFila(nome, visibilityTimeout) {
  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: nome }));
    console.log(`  [SQS] fila já existe:   ${nome}`);
  } catch {
    await sqs.send(new CreateQueueCommand({
      QueueName: nome,
      Attributes: {
        VisibilityTimeout:      visibilityTimeout,
        MessageRetentionPeriod: '86400',
      },
    }));
    console.log(`  [SQS] fila criada:      ${nome}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers — Lambda
// ---------------------------------------------------------------------------

async function garantirLambda({ nome, handler, runtime, zipPath, timeout, env }) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Lambda zip não encontrado: ${zipPath}`);
  }

  const zipCode = fs.readFileSync(zipPath);
  const role    = `arn:aws:iam::${ACCOUNT_ID}:role/lambda-role`;

  let existe = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: nome }));
    existe = true;
  } catch { /* não existe */ }

  if (existe) {
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: nome,
      ZipFile:      zipCode,
    }));
    console.log(`  [Lambda] função atualizada: ${nome}`);
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName:  nome,
      Runtime:       runtime,
      Role:          role,
      Handler:       handler,
      Code:          { ZipFile: zipCode },
      Environment:   { Variables: env },
      Timeout:       timeout,
      MemorySize:    256,
    }));
    console.log(`  [Lambda] função criada:     ${nome}`);
  }

  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${nome}`;
}

async function configurarTriggerS3(lambdaArn, bucket, prefix, suffix) {
  // Permissão para o S3 invocar a Lambda
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: lambdaArn,
      StatementId:  `allow-s3-${bucket}`,
      Action:       'lambda:InvokeFunction',
      Principal:    's3.amazonaws.com',
      SourceArn:    `arn:aws:s3:::${bucket}`,
    }));
    console.log(`  [Lambda] permissão S3→Lambda adicionada`);
  } catch {
    console.log(`  [Lambda] permissão S3→Lambda já existe`);
  }

  // Notificação no bucket S3
  const filterRules = [{ Name: 'prefix', Value: prefix }];
  if (suffix) filterRules.push({ Name: 'suffix', Value: suffix });

  await s3.send(new PutBucketNotificationConfigurationCommand({
    Bucket: bucket,
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [{
        LambdaFunctionArn: lambdaArn,
        Events: ['s3:ObjectCreated:*'],
        Filter: { Key: { FilterRules: filterRules } },
      }],
    },
  }));

  console.log(`  [S3]    notificação configurada: s3://${bucket}/${prefix}*.csv → Lambda:${lambdaArn.split(':').pop()}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(55));
  console.log('  Setup LocalStack');
  console.log(`  Endpoint : ${ENDPOINT}`);
  console.log(`  Região   : ${REGION}`);
  console.log('='.repeat(55));

  console.log('\n--- S3 Buckets ---');
  for (const { nome, pastas } of BUCKETS) {
    await garantirBucket(nome, pastas);
  }

  console.log('\n--- SQS Filas ---');
  for (const { nome, visibilityTimeout } of FILAS) {
    await garantirFila(nome, visibilityTimeout);
  }

  console.log('\n--- Lambda ---');
  const lambdaArn = await garantirLambda(LAMBDA_FGO_CSV_READER);
  await configurarTriggerS3(
    lambdaArn,
    LAMBDA_FGO_CSV_READER.trigger.bucket,
    LAMBDA_FGO_CSV_READER.trigger.prefix,
    LAMBDA_FGO_CSV_READER.trigger.suffix,
  );

  console.log('\n' + '='.repeat(55));
  console.log('  Setup concluído!');
  console.log(`  Upload de CSV → s3://fgo-input-file/pendente/arquivo.csv`);
  console.log(`  Dispara automaticamente: Lambda fgo-csv-reader → SQS fgo_input_file`);
  console.log('='.repeat(55) + '\n');
}

main().catch((err) => {
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    console.error('\nLocalStack não está acessível em', ENDPOINT);
    console.error('Execute: docker compose up -d localstack');
  } else {
    console.error('\nErro no setup:', err.message);
  }
  process.exit(1);
});
