import { describe, it, expect } from 'vitest'
import { hashToken, verifyTokenHash } from '../src/lib/crypto.js'

describe('crypto', () => {
  it('produces a deterministic hash for the same input', () => {
    const a = hashToken('some-refresh-token')
    const b = hashToken('some-refresh-token')
    expect(a).toBe(b)
  })

  it('produces different hashes for different input', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })

  it('verifyTokenHash returns true for a matching pair', () => {
    const hash = hashToken('my-token')
    expect(verifyTokenHash('my-token', hash)).toBe(true)
  })

  it('verifyTokenHash returns false for a non-matching pair', () => {
    const hash = hashToken('my-token')
    expect(verifyTokenHash('wrong-token', hash)).toBe(false)
  })
})
