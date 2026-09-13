import { describe, it, expect, beforeAll } from 'vitest'
import jsonwebtoken from 'jsonwebtoken'

describe('jwt', () => {
  let signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db'
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'a'.repeat(32)
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'b'.repeat(32)
    const mod = await import('../src/lib/jwt.js')
    signAccessToken = mod.signAccessToken
    verifyAccessToken = mod.verifyAccessToken
    signRefreshToken = mod.signRefreshToken
    verifyRefreshToken = mod.verifyRefreshToken
  })

  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com' })
    const payload = verifyAccessToken(token)
    expect(payload.sub).toBe('user-1')
    expect(payload.email).toBe('a@b.com')
  })

  it('signs and verifies a refresh token round-trip', () => {
    const token = signRefreshToken({ sub: 'user-1' })
    const payload = verifyRefreshToken(token)
    expect(payload.sub).toBe('user-1')
  })

  it('rejects an access token verified as a refresh token (different secrets)', () => {
    const token = signAccessToken({ sub: 'user-1' })
    expect(() => verifyRefreshToken(token)).toThrow()
  })

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1' })
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })

  it('rejects a token signed with a different algorithm', () => {
    const token = jsonwebtoken.sign({ sub: 'user-1' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS384' })
    expect(() => verifyAccessToken(token)).toThrow(/invalid algorithm/)
  })
})
