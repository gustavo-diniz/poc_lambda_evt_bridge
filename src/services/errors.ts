export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
