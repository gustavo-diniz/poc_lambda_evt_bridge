import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'sa-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
})

export async function uploadCsvToInputBucket(fileName: string, csvContent: string): Promise<void> {
  const bucket = process.env.S3_INPUT_BUCKET
  if (!bucket) throw new Error('S3_INPUT_BUCKET não definido')

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `pendentes/${fileName}`,
      Body: csvContent,
      ContentType: 'text/csv',
    })
  )
}

export async function uploadCsvToFgoInputBucket(fileName: string, csvContent: string): Promise<void> {
  const bucket = process.env.S3_FGO_BUCKET
  if (!bucket) throw new Error('S3_FGO_BUCKET não definido')

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `pendente/${fileName}`,
      Body: csvContent,
      ContentType: 'text/csv',
    })
  )
}

export async function uploadCsvToOutputBucket(fileName: string, csvContent: string): Promise<string> {
  const bucket = process.env.S3_OUTPUT_BUCKET ?? 'desenrola-output'

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8',
    })
  )

  return bucket
}
