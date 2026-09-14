import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../src/lib/prisma.js'
import { resetDb } from './setup.js'
import { buildApp } from './helpers.js'

let app

beforeAll(async () => {
  app = await buildApp()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function registerAndLogin (email = 'user@example.com', password = 'password123') {
  await request(app).post('/auth/register').send({ email, password })
  const res = await request(app).post('/auth/login').send({ email, password })
  return res.body.accessToken
}

describe('GET /users/me', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/users/me')
    expect(res.status).toBe(401)
  })

  it('returns the current user profile when authenticated', async () => {
    const token = await registerAndLogin()
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('user@example.com')
  })
})

describe('PATCH /users/me', () => {
  it('updates the email', async () => {
    const token = await registerAndLogin()
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'changed@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('changed@example.com')
  })

  it('rejects an email already used by another user with 409', async () => {
    await registerAndLogin('taken@example.com')
    const token = await registerAndLogin('me@example.com')
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@example.com' })
    expect(res.status).toBe(409)
  })
})

describe('PATCH /users/me concurrency', () => {
  it('allows exactly one of two concurrent updates to the same not-yet-taken email to succeed', async () => {
    const tokenA = await registerAndLogin('userA@example.com')
    const tokenB = await registerAndLogin('userB@example.com')
    const email = 'concurrent-target@example.com'

    const [resA, resB] = await Promise.all([
      request(app).patch('/users/me').set('Authorization', `Bearer ${tokenA}`).send({ email }),
      request(app).patch('/users/me').set('Authorization', `Bearer ${tokenB}`).send({ email })
    ])

    expect(resA.status).not.toBe(500)
    expect(resB.status).not.toBe(500)
    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])

    const holders = await prisma.user.findMany({ where: { email } })
    expect(holders).toHaveLength(1)
  })

  it('allows setting your own email to its current value (no-op)', async () => {
    const token = await registerAndLogin('noop@example.com')
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'noop@example.com' })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /users/me', () => {
  it('deletes the current user, subsequent auth then fails', async () => {
    const token = await registerAndLogin()
    const delRes = await request(app).delete('/users/me').set('Authorization', `Bearer ${token}`)
    expect(delRes.status).toBe(204)

    const getRes = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`)
    expect(getRes.status).toBe(404)
  })
})
