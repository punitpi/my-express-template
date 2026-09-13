import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import express from 'express'
import validate from '../src/middlewares/validate.middleware.js'

describe('validate middleware', () => {
  it('parses and replaces req.body on success, calls next with no args', () => {
    const schema = { body: z.object({ email: z.string().email(), age: z.coerce.number().optional() }) }
    const req = { body: { email: 'a@b.com', age: '5' }, params: {}, query: {} }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(next).toHaveBeenCalledWith()
    // age is coerced from the string '5' to the number 5, proving req.body
    // was actually replaced with the parsed result, not left untouched.
    expect(req.body).toEqual({ email: 'a@b.com', age: 5 })
  })

  it('calls next with a ValidationError on invalid body', () => {
    const schema = { body: z.object({ email: z.string().email() }) }
    const req = { body: { email: 'not-an-email' }, params: {}, query: {} }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(next).toHaveBeenCalledTimes(1)
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(400)
    expect(err.details).toBeDefined()
  })

  it('validates params independently of body', () => {
    const schema = { params: z.object({ id: z.string().min(1) }) }
    const req = { body: {}, params: { id: 'abc' }, query: {} }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.params).toEqual({ id: 'abc' })
  })

  it('parses and replaces req.query on success, even when req.query is a getter-only accessor (as in Express 5)', () => {
    const schema = { query: z.object({ page: z.coerce.number() }) }

    // Express 5 defines req.query as a getter-only accessor on the shared
    // request prototype (see express/lib/request.js, defineGetter(req,
    // 'query', ...) which calls Object.defineProperty with only a `get`,
    // no `set`). A plain object literal for req does not reproduce this,
    // so build a real Express request object here: Object.create(app.request)
    // inherits the actual getter-only query accessor from the real
    // prototype. Against the old plain-assignment code this test fails
    // with "Cannot set property query of #<IncomingMessage> which has
    // only a getter" (verified manually before this fix was finalized).
    const app = express()
    const req = Object.create(app.request)
    req.app = app
    req.url = '/?page=1'
    req.body = {}
    req.params = {}

    const next = vi.fn()
    expect(() => validate(schema)(req, {}, next)).not.toThrow()
    expect(next).toHaveBeenCalledWith()
    expect(req.query).toEqual({ page: 1 })
  })
})
