'use strict';

const {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true,
  }),
});

const BUCKET            = process.env.S3_BUCKET;
const PASTA_PENDENTES   = process.env.S3_PASTA_PENDENTES   || 'pendente/';
const PASTA_PROCESSADOS = process.env.S3_PASTA_PROCESSADOS || 'processados/';
const PASTA_ERROS       = process.env.S3_PASTA_ERROS       || 'erros/';

async function lerArquivo(key) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
  return streamParaString(response.Body);
}

async function marcarComoProcessado(key) {
  const nomeArquivo = key.replace(PASTA_PENDENTES, '');
  const destino = `${PASTA_PROCESSADOS}${nomeArquivo}`;

  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${key}`,
    Key: destino,
  }));

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

  console.log(`[fgo-csv-reader] Arquivo movido: ${key} → ${destino}`);
}

async function moverParaErros(key) {
  const nomeArquivo = key.replace(PASTA_PENDENTES, '');
  const destino = `${PASTA_ERROS}${nomeArquivo}`;

  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${key}`,
    Key: destino,
  }));

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

  console.log(`[fgo-csv-reader] Arquivo movido para erros: ${key} → ${destino}`);
}

function streamParaString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

module.exports = { lerArquivo, marcarComoProcessado, moverParaErros };
