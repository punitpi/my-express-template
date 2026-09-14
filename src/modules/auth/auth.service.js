import crypto from 'node:crypto'
import argon2 from 'argon2'
import prisma from '../../lib/prisma.js'
import env from '../../lib/env.js'
import { hashToken } from '../../lib/crypto.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../lib/jwt.js'
import { ConflictError, UnauthorizedError } from '../../lib/errors.js'
import { toPublicUser } from '../users/users.serializer.js'

function refreshExpiryDate () {
  // env.js validates JWT_REFRESH_EXPIRES_IN against this same regex at boot,
  // so a non-match here can't happen at runtime; kept as a defensive assert.
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_EXPIRES_IN)
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN: ${env.JWT_REFRESH_EXPIRES_IN}`)
  const [, amount, unit] = match
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]
  return new Date(Date.now() + Number(amount) * ms)
}

async function issueTokens (user) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email })
  // jti guarantees uniqueness even if two tokens are issued for the same
  // user within the same second — without it, signRefreshToken({ sub })
  // is deterministic (HS256, second-granularity iat), so two same-second
  // logins would produce byte-identical tokens and collide on the
  // tokenHash unique constraint below.
  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID() })

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate()
    }
  })

  return { accessToken, refreshToken, user: toPublicUser(user) }
}

async function register ({ email, password }) {
  const passwordHash = await argon2.hash(password)
  try {
    const user = await prisma.user.create({ data: { email, passwordHash } })
    return toPublicUser(user)
  } catch (err) {
    if (err.code === 'P2002') throw new ConflictError('Email already registered')
    throw err
  }
}

async function login ({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new UnauthorizedError('Invalid email or password')

  const valid = await argon2.verify(user.passwordHash, password)
  if (!valid) throw new UnauthorizedError('Invalid email or password')

  return issueTokens(user)
}

async function refresh (refreshToken) {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required')

  let payload
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  const tokenHash = hashToken(refreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored || stored.userId !== payload.sub || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw new UnauthorizedError('Invalid or expired refresh token')

  // deleteMany + count check (rather than delete-by-id) makes this
  // atomic against a concurrent refresh using the same token: if two
  // requests both pass the checks above and race to consume the same
  // row, only one delete can affect a row (id is unique), so the loser
  // sees count 0 and is correctly rejected instead of also succeeding.
  const { count } = await prisma.refreshToken.deleteMany({ where: { id: stored.id } })
  if (count === 0) throw new UnauthorizedError('Invalid or expired refresh token')

  return issueTokens(user)
}

async function logout (refreshToken) {
  if (!refreshToken) return
  const tokenHash = hashToken(refreshToken)
  await prisma.refreshToken.deleteMany({ where: { tokenHash } })
}

export default { register, login, refresh, logout }
