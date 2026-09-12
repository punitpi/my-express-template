import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import validate from '../src/middlewares/validate.middleware.js'

describe('validate middleware', () => {
  it('parses and replaces req.body on success, calls next with no args', () => {
    const schema = { body: z.object({ email: z.string().email() }) }
    const req = { body: { email: 'a@b.com' }, params: {}, query: {} }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.body).toEqual({ email: 'a@b.com' })
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
  })
})
