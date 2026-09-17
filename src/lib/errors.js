export class AppError extends Error {
  constructor (message, statusCode = 500, details) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor (message = 'Not found', details) {
    super(message, 404, details)
  }
}

export class UnauthorizedError extends AppError {
  constructor (message = 'Unauthorized', details) {
    super(message, 401, details)
  }
}

export class ValidationError extends AppError {
  constructor (message = 'Invalid request', details) {
    super(message, 400, details)
  }
}

export class ConflictError extends AppError {
  constructor (message = 'Conflict', details) {
    super(message, 409, details)
  }
}
