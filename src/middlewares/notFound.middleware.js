import { NotFoundError } from '../lib/errors.js'

export default function notFoundMiddleware (req, res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`))
}
