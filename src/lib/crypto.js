import crypto from 'node:crypto'

export function hashToken (value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function verifyTokenHash (value, hash) {
  const candidate = Buffer.from(hashToken(value), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}
