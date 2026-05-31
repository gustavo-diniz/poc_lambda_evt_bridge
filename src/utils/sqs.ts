import { SQSClient } from '@aws-sdk/client-sqs'

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'sa-east-1',
  ...(process.env.SQS_ENDPOINT ? { endpoint: process.env.SQS_ENDPOINT } : {}),
})
