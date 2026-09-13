import { verifyAccessToken } from '../lib/jwt.js'
import { UnauthorizedError } from '../lib/errors.js'

export default function authMiddleware (req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'))
  }

  const token = header.slice('Bearer '.length)

  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'))
  }
}
