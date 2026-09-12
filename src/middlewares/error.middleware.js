import logger from '../lib/logger.js'
import env from '../lib/env.js'
import { AppError } from '../lib/errors.js'

export default function errorMiddleware (err, req, res, next) {
  const isAppError = err instanceof AppError
  const statusCode = isAppError ? err.statusCode : 500

  if (statusCode >= 500) {
    logger.error({ err }, 'Unhandled error')
  }

  res.status(statusCode).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(isAppError && err.details ? { details: err.details } : {}),
      ...(statusCode >= 500 && env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
    }
  })
}
