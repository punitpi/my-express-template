import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { buildApp } from './helpers.js'

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db'
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'a'.repeat(32)
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'b'.repeat(32)

let app

beforeAll(async () => {
  app = await buildApp()
})

describe('GET /docs', () => {
  it('serves the Swagger UI HTML', async () => {
    const res = await request(app).get('/docs/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('swagger-ui')
  })

  it('serves the raw OpenAPI JSON at /docs.json', async () => {
    const res = await request(app).get('/docs.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toMatch(/^3\./)
    expect(res.body.paths['/auth/register']).toBeDefined()
  })
})
