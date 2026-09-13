import logger from '../lib/logger.js'
import env from '../lib/env.js'
import { AppError } from '../lib/errors.js'

export default function errorMiddleware (err, req, res, next) {
  const isAppError = err instanceof AppError
  const statusCode = isAppError ? err.statusCode : 500
  const isProduction = env.NODE_ENV === 'production'
  const showDebugInfo = statusCode < 500 || !isProduction

  if (statusCode >= 500) {
    logger.error({ err }, 'Unhandled error')
  }

  const message = statusCode >= 500 && isProduction && !isAppError
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error')

  res.status(statusCode).json({
    error: {
      message,
      ...(isAppError && err.details && showDebugInfo ? { details: err.details } : {}),
      ...(statusCode >= 500 && !isProduction ? { stack: err.stack } : {})
    }
  })
}
