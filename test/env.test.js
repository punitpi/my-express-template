import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
]

function setValidEnv () {
  process.env.NODE_ENV = 'test'
  process.env.PORT = '3000'
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(32)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(32)
  process.env.JWT_ACCESS_EXPIRES_IN = '15m'
  process.env.JWT_REFRESH_EXPIRES_IN = '30d'
}

describe('env', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    setValidEnv()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('parses a valid environment', async () => {
    vi.resetModules()
    const { default: env } = await import('../src/lib/env.js')
    expect(env.PORT).toBe(3000)
    expect(env.DATABASE_URL).toBe('file:./test.db')
  })

  it.each(REQUIRED_KEYS)('throws when %s is missing', async (key) => {
    vi.resetModules()
    delete process.env[key]
    await expect(import('../src/lib/env.js')).rejects.toThrow()
  })

  it.each(['2w', '1y', '7 days', '604800', 'abc'])(
    'throws when JWT_REFRESH_EXPIRES_IN is %s (outside the \\d+[smhd] grammar)',
    async (value) => {
      vi.resetModules()
      process.env.JWT_REFRESH_EXPIRES_IN = value
      await expect(import('../src/lib/env.js')).rejects.toThrow()
    }
  )

  it('accepts a valid JWT_REFRESH_EXPIRES_IN like 2d', async () => {
    vi.resetModules()
    process.env.JWT_REFRESH_EXPIRES_IN = '2d'
    const { default: env } = await import('../src/lib/env.js')
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('2d')
  })
})
