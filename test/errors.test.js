import { describe, it, expect, vi } from 'vitest'
import { AppError, NotFoundError, UnauthorizedError, ValidationError, ConflictError } from '../src/lib/errors.js'
import errorMiddleware from '../src/middlewares/error.middleware.js'

function mockRes () {
  return {
    statusCode: 200,
    status (code) { this.statusCode = code; return this },
    json (body) { this.body = body; return this }
  }
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
