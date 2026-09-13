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

function toPublicUser (user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

function refreshExpiryDate () {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_EXPIRES_IN)
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const [, amount, unit] = match
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]
  return new Date(Date.now() + Number(amount) * ms)
}

async function issueTokens (user) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email })
  const refreshToken = signRefreshToken({ sub: user.id })

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
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ConflictError('Email already registered')

  const passwordHash = await argon2.hash(password)
  const user = await prisma.user.create({ data: { email, passwordHash } })
  return toPublicUser(user)
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

  await prisma.refreshToken.delete({ where: { id: stored.id } })

  return issueTokens(user)
}

async function logout (refreshToken) {
  if (!refreshToken) return
  const tokenHash = hashToken(refreshToken)
  await prisma.refreshToken.deleteMany({ where: { tokenHash } })
}

export default { register, login, refresh, logout }
