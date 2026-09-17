import authService from './auth.service.js'
import env from '../../lib/env.js'

const REFRESH_COOKIE = 'refreshToken'

function cookieOptions () {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth'
  }
}

export async function register (req, res, next) {
  try {
    const user = await authService.register(req.body)
    res.status(201).json({ user })
  } catch (err) {
    next(err)
  }
}

export async function login (req, res, next) {
  try {
    const { accessToken, refreshToken, user } = await authService.login(req.body)
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
    res.json({ accessToken, user })
  } catch (err) {
    next(err)
  }
}

export async function refresh (req, res, next) {
  try {
    const { accessToken, refreshToken, user } = await authService.refresh(req.cookies[REFRESH_COOKIE])
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
    res.json({ accessToken, user })
  } catch (err) {
    next(err)
  }
}

export async function logout (req, res, next) {
  try {
    await authService.logout(req.cookies[REFRESH_COOKIE])
    res.clearCookie(REFRESH_COOKIE, cookieOptions())
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
