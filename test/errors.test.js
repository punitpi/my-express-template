import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AppError, NotFoundError, UnauthorizedError, ValidationError, ConflictError } from '../src/lib/errors.js'
import errorMiddleware from '../src/middlewares/error.middleware.js'

function mockRes () {
  return {
    statusCode: 200,
    status (code) { this.statusCode = code; return this },
    json (body) { this.body = body; return this }
  }
}

function setValidEnv () {
  process.env.NODE_ENV = 'test'
  process.env.PORT = '3000'
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(32)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(32)
  process.env.JWT_ACCESS_EXPIRES_IN = '15m'
  process.env.JWT_REFRESH_EXPIRES_IN = '30d'
}

describe('error classes', () => {
  it('AppError carries statusCode, message, details', () => {
    const err = new AppError('broke', 418, { reason: 'teapot' })
    expect(err.statusCode).toBe(418)
    expect(err.message).toBe('broke')
    expect(err.details).toEqual({ reason: 'teapot' })
  })

  it.each([
    [NotFoundError, 404],
    [UnauthorizedError, 401],
    [ValidationError, 400],
    [ConflictError, 409]
  ])('%s defaults to status %i', (ErrorClass, status) => {
    const err = new ErrorClass('msg')
    expect(err.statusCode).toBe(status)
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('errorMiddleware', () => {
  it('serializes AppError with its own statusCode and details', () => {
    const err = new ValidationError('bad input', { field: 'email' })
    const res = mockRes()
    errorMiddleware(err, {}, res, () => {})
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: { message: 'bad input', details: { field: 'email' } } })
  })

  it('defaults unknown errors to 500 and hides details', () => {
    const err = new Error('unexpected')
    const res = mockRes()
    errorMiddleware(err, {}, res, () => {})
    expect(res.statusCode).toBe(500)
    expect(res.body.error.message).toBe('unexpected')
  })
})

describe('errorMiddleware env-dependent behavior', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    setValidEnv()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('gives a non-AppError exception a generic message in production', async () => {
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    const { default: prodErrorMiddleware } = await import('../src/middlewares/error.middleware.js')

    const err = new Error('raw internal detail: file /src/db.js line 42')
    const res = mockRes()
    prodErrorMiddleware(err, {}, res, () => {})

    expect(res.statusCode).toBe(500)
    expect(res.body.error.message).toBe('Internal Server Error')
  })

  it('keeps the raw message for a non-AppError exception outside production', async () => {
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    const { default: devErrorMiddleware } = await import('../src/middlewares/error.middleware.js')

    const err = new Error('unexpected')
    const res = mockRes()
    devErrorMiddleware(err, {}, res, () => {})

    expect(res.statusCode).toBe(500)
    expect(res.body.error.message).toBe('unexpected')
  })

  it('omits details for a 5xx AppError in production', async () => {
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    const { default: prodErrorMiddleware } = await import('../src/middlewares/error.middleware.js')
    const { AppError: ProdAppError } = await import('../src/lib/errors.js')

    const err = new ProdAppError('server broke', 500, { secret: 'internal-info' })
    const res = mockRes()
    prodErrorMiddleware(err, {}, res, () => {})

    expect(res.statusCode).toBe(500)
    expect(res.body.error.message).toBe('server broke')
    expect(res.body.error.details).toBeUndefined()
  })

  it('includes details for a 5xx AppError outside production', async () => {
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    const { default: devErrorMiddleware } = await import('../src/middlewares/error.middleware.js')
    const { AppError: DevAppError } = await import('../src/lib/errors.js')

    const err = new DevAppError('server broke', 500, { secret: 'internal-info' })
    const res = mockRes()
    devErrorMiddleware(err, {}, res, () => {})

    expect(res.statusCode).toBe(500)
    expect(res.body.error.details).toEqual({ secret: 'internal-info' })
  })

  it('still includes details for a sub-500 AppError in production', async () => {
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    const { default: prodErrorMiddleware } = await import('../src/middlewares/error.middleware.js')
    const { ValidationError: ProdValidationError } = await import('../src/lib/errors.js')

    const err = new ProdValidationError('bad input', { field: 'email' })
    const res = mockRes()
    prodErrorMiddleware(err, {}, res, () => {})

    expect(res.statusCode).toBe(400)
    expect(res.body.error.details).toEqual({ field: 'email' })
  })
})
