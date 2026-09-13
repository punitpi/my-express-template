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

describe('POST /auth/register', () => {
  it('creates a user and does not return the password hash', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('new@example.com')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/auth/register').send({ email: 'dup@example.com', password: 'password123' })
    const res = await request(app).post('/auth/register').send({ email: 'dup@example.com', password: 'password123' })
    expect(res.status).toBe(409)
  })

  it('rejects a short password with 400', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'short@example.com', password: '123' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send({ email: 'login@example.com', password: 'password123' })
  })

  it('returns an access token and sets a refresh cookie on success', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'login@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=/)
  })

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'login@example.com', password: 'wrong-password' })
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/refresh and /auth/logout', () => {
  it('issues a new access token given a valid refresh cookie, and logout revokes it', async () => {
    await request(app).post('/auth/register').send({ email: 'refresh@example.com', password: 'password123' })
    const loginRes = await request(app).post('/auth/login').send({ email: 'refresh@example.com', password: 'password123' })
    const cookie = loginRes.headers['set-cookie']

    const refreshRes = await request(app).post('/auth/refresh').set('Cookie', cookie)
    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.accessToken).toBeTruthy()

    const newCookie = refreshRes.headers['set-cookie']
    const logoutRes = await request(app).post('/auth/logout').set('Cookie', newCookie)
    expect(logoutRes.status).toBe(204)

    const reuseRes = await request(app).post('/auth/refresh').set('Cookie', newCookie)
    expect(reuseRes.status).toBe(401)
  })

  it('rejects a refresh request with no cookie', async () => {
    const res = await request(app).post('/auth/refresh')
    expect(res.status).toBe(401)
  })
})
