# Express Template Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize this Express starter template — convert to ESM, add SQLite+Prisma, JWT auth with DB-tracked refresh-token revocation, a `users` CRUD module, Swagger docs, structured logging, Zod validation, a Vitest+Supertest test suite, and clean up Docker/tooling — replacing dead/broken code along the way.

**Architecture:** Feature-based module structure (`src/modules/auth`, `src/modules/users`), each module owning its routes/controller/service/schema. Shared infrastructure (Prisma client, JWT helpers, logger, env validation, error types) lives in `src/lib`. One `server.js` entrypoint replaces `bin/www` + `app.local.js`.

**Tech Stack:** Express 5, Prisma 6 (SQLite), jsonwebtoken, argon2, Zod, pino/pino-http, swagger-jsdoc/swagger-ui-express, Vitest + Supertest, ESM (`"type": "module"`), standard (linting).

**Spec:** `docs/superpowers/specs/2026-09-12-template-revamp-design.md`

## Global Constraints

- All application code uses ES modules (`import`/`export`), not CommonJS. `package.json` gets `"type": "module"`.
- Prisma is pinned to `^6.19.3` (not the `8.0.0-rc` `latest` npm dist-tag) — Prisma 7 moves the connection URL out of `schema.prisma` into a separate `prisma.config.ts`, which would drag TypeScript tooling into an intentionally-plain-JS project. 6.x keeps `datasource db { url = env("DATABASE_URL") }` in the schema file, matching this plan's env-var design.
- `users` routes operate only on the authenticated `req.user` (`/users/me`), never on arbitrary `:id` params — no endpoint lets one user read/edit/delete another's record.
- Refresh tokens are never stored in plaintext — always hashed via `src/lib/crypto.js` before persisting to `RefreshToken.tokenHash`.
- `helmet()`'s default CSP sets `upgrade-insecure-requests`, which forces HTTPS redirects and breaks plain `http://localhost` requests in dev — must be disabled when `NODE_ENV !== 'production'`.
- Stack traces / raw error details appear in HTTP error responses only when `NODE_ENV !== 'production'`.
- No endpoint, migration, or test may read `.env` file contents directly in a way that prints secret values to logs.

---

## File Structure

```
prisma/
  schema.prisma
src/
  lib/
    env.js
    prisma.js
    logger.js
    crypto.js
    jwt.js
    errors.js
  middlewares/
    validate.middleware.js
    auth.middleware.js
    notFound.middleware.js
    error.middleware.js
  modules/
    auth/
      auth.schema.js
      auth.service.js
      auth.controller.js
      auth.routes.js
    users/
      users.schema.js
      users.service.js
      users.controller.js
      users.routes.js
  docs/
    swagger.js
  app.js
server.js
test/
  setup.js
  helpers.js
  auth.test.js
  users.test.js
.env.sample          (rewritten)
.nvmrc                (new)
package.json          (rewritten deps/scripts)
dockerfile             (rewritten)
README.md              (rewritten)
.gitignore / .dockerignore (updated)
```

Removed: `app.local.js`, `bin/www`, `routes/index.js`, `routes/users.js`, `stores/mainStore.js`, `utils/security.js`.

---

## Task 1: Project foundation — ESM switch, env validation, logger, Prisma client singleton

**Files:**
- Modify: `package.json` (add `"type": "module"`, `engines`, remove obsolete deps — dependency list finalized in Task 8)
- Create: `.nvmrc`
- Create: `src/lib/env.js`
- Create: `src/lib/logger.js`
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.js`
- Create: `.env.sample` (rewritten)
- Test: `test/env.test.js`

**Interfaces:**
- Produces: `env` (default export of `src/lib/env.js`) — validated object with `{ NODE_ENV, PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN }`.
- Produces: `logger` (default export of `src/lib/logger.js`) — a pino instance.
- Produces: `prisma` (default export of `src/lib/prisma.js`) — a `PrismaClient` singleton.

This is the first task, so no prior interfaces are consumed.

- [ ] **Step 1: Set Node version and package type**

Create `.nvmrc`:
```
22
```

Edit `package.json` — this task only touches the top-level shape; scripts and full dependency list are finalized in Task 8. For now add:
```json
{
  "type": "module",
  "engines": {
    "node": ">=22"
  }
}
```
(Insert `"type": "module"` after `"private": true,` and `"engines"` after `"author"`.)

- [ ] **Step 2: Install Vitest for the test suite (needed starting this task)**

Run: `npm install -D vitest@^5.0.0`

- [ ] **Step 3: Write the failing test for env validation**

Create `test/env.test.js`:
```js
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
})
```

Note: Step 8 below adds `globals: true` to the Vitest config so later tasks' tests don't need to import `describe`/`it`/`expect`/`vi` per file — this file imports them explicitly since the config doesn't exist yet at this step.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/env.test.js`
Expected: FAIL — `Cannot find module '../src/lib/env.js'`

- [ ] **Step 5: Implement env validation**

Create `src/lib/env.js`:
```js
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d')
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment configuration:\n${details}`)
}

export default parsed.data
```

Run: `npm install zod@^4.6.2`

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/env.test.js`
Expected: PASS (5 tests: 1 valid-parse + 4 missing-key cases)

- [ ] **Step 7: Create the logger**

Create `src/lib/logger.js`:
```js
import pino from 'pino'
import env from './env.js'

const transport = env.NODE_ENV === 'production'
  ? undefined
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
    }

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport
})

export default logger
```

Run: `npm install pino@^10.3.1 pino-http@^11.0.0 && npm install -D pino-pretty@^13.1.3`

- [ ] **Step 8: Add Vitest config**

Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false
  }
})
```

(`fileParallelism: false` was not in the original draft — added post-execution once Task 6 added a second integration test file. Every test file's `beforeEach` calls `resetDb()`, which deletes ALL rows globally with no per-file scoping; Vitest runs test files in parallel by default, so two files' workers can interleave their `resetDb()` calls against the single shared SQLite database, wiping data mid-test in a sibling file. Confirmed empirically: `npx vitest run --no-file-parallelism` (the CLI equivalent of this config flag) fixed a real, reproducible 4-test failure in `test/users.test.js` when run as part of the full suite. With files serialized, each file owns the database for the duration of its own run and `resetDb()`'s global-delete approach is safe. This setting must also be present in Task 8 Step 4's `vitest.config.js` rewrite — it is not optional infrastructure, it's what keeps the growing test suite correct as more files are added in Tasks 7-8.)

- [ ] **Step 9: Write the Prisma schema**

Run: `npm install @prisma/client@^6.19.3 && npm install -D prisma@^6.19.3`

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

- [ ] **Step 10: Rewrite `.env.sample` and create local `.env`**

Create `.env.sample`:
```
NODE_ENV=development
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-a-different-long-random-string
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

Create a local `.env` (git-ignored — do not commit) by copying `.env.sample` and generating real secrets:
```bash
cp .env.sample .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the generated value in for `JWT_ACCESS_SECRET`, run again for `JWT_REFRESH_SECRET`.

- [ ] **Step 11: Generate the Prisma client and run the first migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/migration.sql`, creates `prisma/dev.db`, generates the client into `node_modules/@prisma/client`.

- [ ] **Step 12: Create the Prisma client singleton**

Create `src/lib/prisma.js`:
```js
import { PrismaClient } from '@prisma/client'
import env from './env.js'

const globalForPrisma = globalThis

const prisma = globalForPrisma.__prisma__ ?? new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
})

if (env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma__ = prisma
}

export default prisma
```

(The `globalThis` cache avoids exhausting SQLite connections when nodemon/`--watch` reloads modules in dev.)

- [ ] **Step 13: Update `.gitignore` and `.dockerignore` for Prisma artifacts**

Edit `.gitignore` — add after the `.env*` block:
```
# Prisma
/prisma/dev.db
/prisma/dev.db-journal
/prisma/test.db
/prisma/test.db-journal
```

Edit `.dockerignore` — add:
```
prisma/dev.db
prisma/dev.db-journal
prisma/test.db
node_modules
```

**Amended after Task 8 review (2026-09-14):** the `.dockerignore` that actually
shipped through Task 7 diverged further and, critically, excluded
`package.json`, `package-lock.json`, and `dockerfile` themselves — breaking
every `COPY package.json package-lock.json ./` step in the Dockerfile below.
Task 8's implementer found this via static review (no Docker runtime was
available to catch it by an actual failed build) and fixed it. The final,
correct `.dockerignore` is:
```
node_modules
npm-debug.log
.vscode
.env
.env.test
.env.sample
prisma/dev.db
prisma/dev.db-journal
prisma/test.db
```
(`package.json`, `package-lock.json`, and `dockerfile` are never excluded.)

- [ ] **Step 14: Run full test suite and commit**

Run: `npx vitest run`
Expected: PASS

```bash
git add .nvmrc package.json package-lock.json src/lib/env.js src/lib/logger.js src/lib/prisma.js prisma/schema.prisma prisma/migrations .env.sample .gitignore .dockerignore vitest.config.js test/env.test.js
git commit -m "Add env validation, logger, and Prisma foundation"
```

---

## Task 2: Error handling library and middleware

**Files:**
- Create: `src/lib/errors.js`
- Create: `src/middlewares/error.middleware.js`
- Create: `src/middlewares/notFound.middleware.js`
- Test: `test/errors.test.js`

**Interfaces:**
- Consumes: `logger` from `src/lib/logger.js` (Task 1); `env` from `src/lib/env.js` (Task 1).
- Produces: `AppError`, `NotFoundError`, `UnauthorizedError`, `ValidationError`, `ConflictError` (named exports of `src/lib/errors.js`) — each with `.statusCode`, `.message`, optional `.details`.
- Produces: `errorMiddleware` (default export of `src/middlewares/error.middleware.js`) — Express 4-arg error handler.
- Produces: `notFoundMiddleware` (default export of `src/middlewares/notFound.middleware.js`) — Express request handler that calls `next(new NotFoundError(...))`.

- [ ] **Step 1: Write the failing test**

Create `test/errors.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/errors.test.js`
Expected: FAIL — cannot find `../src/lib/errors.js`

- [ ] **Step 3: Implement error classes**

Create `src/lib/errors.js`:
```js
export class AppError extends Error {
  constructor (message, statusCode = 500, details) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor (message = 'Not found', details) {
    super(message, 404, details)
  }
}

export class UnauthorizedError extends AppError {
  constructor (message = 'Unauthorized', details) {
    super(message, 401, details)
  }
}

export class ValidationError extends AppError {
  constructor (message = 'Invalid request', details) {
    super(message, 400, details)
  }
}

export class ConflictError extends AppError {
  constructor (message = 'Conflict', details) {
    super(message, 409, details)
  }
}
```

- [ ] **Step 4: Implement the error middleware**

Create `src/middlewares/error.middleware.js`:
```js
import logger from '../lib/logger.js'
import env from '../lib/env.js'
import { AppError } from '../lib/errors.js'

export default function errorMiddleware (err, req, res, next) {
  const isAppError = err instanceof AppError
  const statusCode = isAppError ? err.statusCode : 500
  const isProduction = env.NODE_ENV === 'production'
  const showDebugInfo = statusCode < 500 || !isProduction

  if (statusCode >= 500) {
    logger.error({ err }, 'Unhandled error')
  }

  const message = statusCode >= 500 && isProduction && !isAppError
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error')

  res.status(statusCode).json({
    error: {
      message,
      ...(isAppError && err.details && showDebugInfo ? { details: err.details } : {}),
      ...(statusCode >= 500 && !isProduction ? { stack: err.stack } : {})
    }
  })
}
```

(Amended post-execution: a task reviewer found that `err.message` leaked internal details from non-AppError exceptions unconditionally, and `.details` on a 5xx AppError wasn't gated by NODE_ENV the way `.stack` was. The code above reflects the fix actually applied and merged — see `src/middlewares/error.middleware.js` — not the plan's original draft.)

- [ ] **Step 5: Implement the 404 middleware**

Create `src/middlewares/notFound.middleware.js`:
```js
import { NotFoundError } from '../lib/errors.js'

export default function notFoundMiddleware (req, res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/errors.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/errors.js src/middlewares/error.middleware.js src/middlewares/notFound.middleware.js test/errors.test.js
git commit -m "Add AppError hierarchy and centralized error middleware"
```

---

## Task 3: Crypto utility (fixed-up `Encrypter`), JWT helpers

**Files:**
- Create: `src/lib/crypto.js` (replaces `utils/security.js`)
- Create: `src/lib/jwt.js`
- Delete: `utils/security.js`
- Delete: `stores/mainStore.js`
- Test: `test/crypto.test.js`
- Test: `test/jwt.test.js`

**Interfaces:**
- Consumes: `env` from `src/lib/env.js` (Task 1).
- Produces: `hashToken(value)` and `verifyTokenHash(value, hash)` (named exports of `src/lib/crypto.js`). `hashToken` is used by the auth service in Task 5 to hash refresh tokens before DB storage and as the lookup key on refresh; `verifyTokenHash` is a symmetric constant-time comparison helper, covered by this task's own tests, not consumed elsewhere in this plan.
- Produces: `signAccessToken(payload)`, `verifyAccessToken(token)`, `signRefreshToken(payload)`, `verifyRefreshToken(token)` (named exports of `src/lib/jwt.js`).

The original `utils/security.js` `Encrypter` class did reversible AES encryption. Refresh tokens need one-way, comparison-safe hashing instead (same principle as a password), so `src/lib/crypto.js` is redesigned around Node's built-in `crypto.timingSafeEqual` + SHA-256, not reused as reversible encryption — reversible encryption is the wrong primitive for "can we tell if this token matches what we stored," and keeping the old API shape here would be keeping the bug's shape, not fixing it.

- [ ] **Step 1: Write the failing test for crypto.js**

Create `test/crypto.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/crypto.test.js`
Expected: FAIL — cannot find `../src/lib/crypto.js`

- [ ] **Step 3: Implement crypto.js**

Create `src/lib/crypto.js`:
```js
import crypto from 'node:crypto'

export function hashToken (value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function verifyTokenHash (value, hash) {
  const candidate = Buffer.from(hashToken(value), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/crypto.test.js`
Expected: PASS

- [ ] **Step 5: Delete the old broken/dead-code files**

`stores/mainStore.js` (recursive `getData`/`setData` referencing an undefined `req.data`, never imported anywhere) is also removed here, alongside `utils/security.js` — both are the dead code identified in the spec's "Dead code disposition" section, and neither is used by any file created in this plan (the Prisma-backed services in Tasks 5-6 talk to `prisma` directly, superseding the "store" concept entirely).

```bash
git rm utils/security.js stores/mainStore.js
```
(Removes the `utils/` and `stores/` directories implicitly once their only files are gone — confirm with `ls utils stores` returning nothing/error for each; if either directory still exists and is otherwise empty, remove it: `rmdir utils stores`.)

- [ ] **Step 6: Write the failing test for jwt.js**

Create `test/jwt.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest'

describe('jwt', () => {
  let signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'a'.repeat(32)
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'b'.repeat(32)
    const mod = await import('../src/lib/jwt.js')
    signAccessToken = mod.signAccessToken
    verifyAccessToken = mod.verifyAccessToken
    signRefreshToken = mod.signRefreshToken
    verifyRefreshToken = mod.verifyRefreshToken
  })

  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com' })
    const payload = verifyAccessToken(token)
    expect(payload.sub).toBe('user-1')
    expect(payload.email).toBe('a@b.com')
  })

  it('signs and verifies a refresh token round-trip', () => {
    const token = signRefreshToken({ sub: 'user-1' })
    const payload = verifyRefreshToken(token)
    expect(payload.sub).toBe('user-1')
  })

  it('rejects an access token verified as a refresh token (different secrets)', () => {
    const token = signAccessToken({ sub: 'user-1' })
    expect(() => verifyRefreshToken(token)).toThrow()
  })

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1' })
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run test/jwt.test.js`
Expected: FAIL — cannot find `../src/lib/jwt.js`

- [ ] **Step 8: Implement jwt.js**

Run: `npm install jsonwebtoken@^9.0.3`

Create `src/lib/jwt.js`:
```js
import jwt from 'jsonwebtoken'
import env from './env.js'

export function signAccessToken (payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN })
}

export function verifyAccessToken (token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] })
}

export function signRefreshToken (payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN })
}

export function verifyRefreshToken (token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] })
}
```

(Amended post-execution: a task reviewer found `jwt.verify()` had no explicit algorithm allowlist — safe by default with a string secret, but a latent widening risk if the secret type ever changes. Both verify calls above reflect the fix actually applied and merged — see `src/lib/jwt.js`.)

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run test/jwt.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/crypto.js src/lib/jwt.js test/crypto.test.js test/jwt.test.js
git commit -m "Replace utils/security.js and delete dead stores/mainStore.js"
```
(`utils/security.js` and `stores/mainStore.js` were already staged for deletion in Step 5's `git rm` — `git add` above stages the new files, and the commit captures both the additions and the earlier deletions together.)

---

## Task 4: Validation middleware

**Files:**
- Create: `src/middlewares/validate.middleware.js`
- Test: `test/validate.middleware.test.js`

**Interfaces:**
- Consumes: `ValidationError` from `src/lib/errors.js` (Task 2).
- Produces: `validate({ body, params, query })` (default export, a function returning Express middleware) — used by every route in Tasks 5 and 6 to validate `req.body`/`req.params`/`req.query` against Zod schemas before the controller runs. On success, replaces `req.body` (etc.) with the parsed/coerced value; on failure, calls `next(new ValidationError(...))`.

- [ ] **Step 1: Write the failing test**

Create `test/validate.middleware.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/validate.middleware.test.js`
Expected: FAIL — cannot find `../src/middlewares/validate.middleware.js`

- [ ] **Step 3: Implement the middleware**

Create `src/middlewares/validate.middleware.js`:
```js
import { ValidationError } from '../lib/errors.js'

export default function validate (schemas) {
  return (req, res, next) => {
    for (const key of ['body', 'params', 'query']) {
      const schema = schemas[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])
      if (!result.success) {
        return next(new ValidationError('Invalid request', result.error.flatten()))
      }

      if (key === 'query') {
        // Express 5 defines req.query as a getter-only accessor on the
        // shared request prototype, so plain assignment throws in strict
        // mode (ESM). Shadow it with an own, writable property instead.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true
        })
      } else {
        req[key] = result.data
      }
    }
    next()
  }
}
```

(Amended post-execution: a task reviewer found that plain assignment to `req.query` throws under Express 5's getter-only accessor in this repo's strict-mode ESM — a Critical bug reproduced empirically. The code above reflects the fix actually applied and merged — see `src/middlewares/validate.middleware.js` — not the plan's original draft, which used plain `req[key] = result.data` for all three keys unconditionally.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/validate.middleware.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/validate.middleware.js test/validate.middleware.test.js
git commit -m "Add Zod-based request validation middleware"
```

---

## Task 5: Auth module — schemas, service, controller, routes, middleware

**Note on step order:** unlike Tasks 1-4, this task's steps write the schema/service/controller/routes/middleware first and the integration test last, deliberately. Auth is a multi-file, multi-layer flow (schema → service → controller → route → middleware, all cooperating) rather than one pure function — there is no single unit to red-green on partway through wiring five cooperating files together, and a partial auth stack has no meaningful "fails correctly" state to assert against. The integration test in Step 8 is still written and run before this task is considered done, and still must fail-then-pass exactly like every other test in this plan (Steps 8-10 below drive it red then green); only the ordering relative to the implementation files differs. Task 6 follows the same pattern for the same reason.

**Files:**
- Create: `src/modules/auth/auth.schema.js`
- Create: `src/modules/auth/auth.service.js`
- Create: `src/modules/auth/auth.controller.js`
- Create: `src/modules/auth/auth.routes.js`
- Create: `src/middlewares/auth.middleware.js`
- Test: `test/setup.js`
- Test: `test/helpers.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Consumes: `prisma` (Task 1), `env`/`logger` (Task 1), `AppError`/`ConflictError`/`UnauthorizedError`/`ValidationError` (Task 2), `hashToken` (Task 3), `signAccessToken`/`verifyAccessToken`/`signRefreshToken`/`verifyRefreshToken` (Task 3), `validate` middleware (Task 4).
- Produces: `authService.register({ email, password })`, `authService.login({ email, password })` → `{ accessToken, refreshToken, user }`, `authService.refresh(refreshToken)` → `{ accessToken, refreshToken, user }`, `authService.logout(refreshToken)` → `void` (named exports of `src/modules/auth/auth.service.js`, grouped as a default-exported object `authService`).
- Produces: `authRouter` (default export of `src/modules/auth/auth.routes.js`) — mounted at `/auth` in `app.js` (Task 7).
- Produces: `authMiddleware` (default export of `src/middlewares/auth.middleware.js`) — attaches `req.user = { id, email }` on a valid `Authorization: Bearer` header, else calls `next(new UnauthorizedError(...))`. Consumed by the users module (Task 6).
- Produces (test infra, reused by Task 6): `resetDb()` (named export of `test/setup.js`) — deletes all rows between tests; `buildApp()` (named export of `test/helpers.js`) — returns a fresh configured Express app instance for Supertest, importing `src/app.js`.

- [ ] **Step 1: Write the auth Zod schemas**

Create `src/modules/auth/auth.schema.js`:
```js
import { z } from 'zod'

export const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters')
  })
}

export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required')
  })
}
```

- [ ] **Step 2: Implement the auth service**

Run: `npm install argon2@^0.45.1`

Create `src/modules/auth/auth.service.js`:
```js
import crypto from 'node:crypto'
import argon2 from 'argon2'
import prisma from '../../lib/prisma.js'
import env from '../../lib/env.js'
import { hashToken } from '../../lib/crypto.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../lib/jwt.js'
import { ConflictError, UnauthorizedError } from '../../lib/errors.js'

function toPublicUser (user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

function refreshExpiryDate () {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_EXPIRES_IN)
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const [, amount, unit] = match
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]
  return new Date(Date.now() + Number(amount) * ms)
}

async function issueTokens (user) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email })
  // jti guarantees uniqueness even if two tokens are issued for the same
  // user within the same second — without it, signRefreshToken({ sub })
  // is deterministic (HS256, second-granularity iat), so two same-second
  // logins would produce byte-identical tokens and collide on the
  // tokenHash unique constraint below.
  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID() })

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate()
    }
  })

  return { accessToken, refreshToken, user: toPublicUser(user) }
}

async function register ({ email, password }) {
  const passwordHash = await argon2.hash(password)
  try {
    const user = await prisma.user.create({ data: { email, passwordHash } })
    return toPublicUser(user)
  } catch (err) {
    if (err.code === 'P2002') throw new ConflictError('Email already registered')
    throw err
  }
}

async function login ({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new UnauthorizedError('Invalid email or password')

  const valid = await argon2.verify(user.passwordHash, password)
  if (!valid) throw new UnauthorizedError('Invalid email or password')

  return issueTokens(user)
}

async function refresh (refreshToken) {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required')

  let payload
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  const tokenHash = hashToken(refreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored || stored.userId !== payload.sub || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw new UnauthorizedError('Invalid or expired refresh token')

  // deleteMany + count check (rather than delete-by-id) makes this
  // atomic against a concurrent refresh using the same token: if two
  // requests both pass the checks above and race to consume the same
  // row, only one delete can affect a row (id is unique), so the loser
  // sees count 0 and is correctly rejected instead of also succeeding.
  const { count } = await prisma.refreshToken.deleteMany({ where: { id: stored.id } })
  if (count === 0) throw new UnauthorizedError('Invalid or expired refresh token')

  return issueTokens(user)
}

async function logout (refreshToken) {
  if (!refreshToken) return
  const tokenHash = hashToken(refreshToken)
  await prisma.refreshToken.deleteMany({ where: { tokenHash } })
}

export default { register, login, refresh, logout }
```

(Amended post-execution — three related issues found by a task reviewer's security-focused pass:

1. The original draft's `signRefreshToken({ sub: user.id })` was deterministic under HS256 with second-granularity `iat`. This isn't only a concurrency edge case: a *single, non-concurrent* refresh call landing in the same wall-clock second as the token's issuance silently returned the identical token — a real break of the stated rotation guarantee ("old token invalidated on use"), reproducible deterministically (login, then immediately refresh, assert the returned token differs — no timing luck required). It also meant two same-second logins collided on `tokenHash`'s unique constraint (P2002 → unhandled 500). Fixed by adding a `jti` (JWT ID) claim via `crypto.randomUUID()` to `signRefreshToken`'s payload — verified nothing else in the codebase reads any refresh-token payload field besides `sub`, so this is a safe, non-breaking addition.

2. `refresh()`'s original `findUnique` → check → `delete-by-id` was non-transactional: two concurrent refresh requests using the same token could both pass validation before either deleted the row, and the loser would throw an unhandled Prisma P2025 (record not found) rather than a clean 401. Changed to `deleteMany` + count check, which is atomic — empirically verified via two genuinely concurrent `deleteMany` calls against the same row in a real test DB: exactly one returned `count: 1`, the other `count: 0`. The zero-count branch now throws a clean `UnauthorizedError`, eliminating the P2025 case entirely (not caught — made unreachable).

3. `register()`'s original `findUnique` → check → `create` was the same read-then-write race on `User.email`'s unique constraint: two concurrent registrations for the same email both pass the existence check, then the second `create()` throws P2002 → unhandled 500 instead of the intended 409. Fixed by dropping the pre-check and catching P2002 directly on `create()` instead — the unique constraint itself is the authoritative check, so a separate `findUnique` added no correctness, just a race window. (Note: `issueTokens`'s own `RefreshToken.tokenHash` unique constraint does not need equivalent P2002 handling — once `jti` is a random UUID, two refresh tokens for the same user can no longer collide, so that failure mode is now unreachable, not merely caught.)

All three fixes reflect what was actually applied and merged — see `src/modules/auth/auth.service.js`.)

Note: `verifyTokenHash` is not needed here — the refresh lookup uses `hashToken` directly as a unique-index lookup key (see `refresh()` below), which is equivalent to a compare-and-verify and avoids a full-table scan. `verifyTokenHash` remains exported from `src/lib/crypto.js` for symmetry with `hashToken` and is exercised directly by `test/crypto.test.js`, even though no other module calls it.

- [ ] **Step 3: Implement the auth controller**

Create `src/modules/auth/auth.controller.js`:
```js
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
```

- [ ] **Step 4: Implement the auth routes with Swagger annotations**

Create `src/modules/auth/auth.routes.js`:
```js
import { Router } from 'express'
import validate from '../../middlewares/validate.middleware.js'
import { registerSchema, loginSchema } from './auth.schema.js'
import { register, login, refresh, logout } from './auth.controller.js'

const router = Router()

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: User created }
 *       409: { description: Email already registered }
 */
router.post('/register', validate(registerSchema), register)

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive an access token (refresh token set as httpOnly cookie)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful }
 *       401: { description: Invalid credentials }
 */
router.post('/login', validate(loginSchema), login)

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Exchange a valid refresh token cookie for a new access token
 *     tags: [Auth]
 *     responses:
 *       200: { description: New access token issued }
 *       401: { description: Invalid or expired refresh token }
 */
router.post('/refresh', refresh)

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke the current refresh token
 *     tags: [Auth]
 *     responses:
 *       204: { description: Logged out }
 */
router.post('/logout', logout)

export default router
```

- [ ] **Step 5: Implement the auth middleware**

Create `src/middlewares/auth.middleware.js`:
```js
import { verifyAccessToken } from '../lib/jwt.js'
import { UnauthorizedError } from '../lib/errors.js'

export default function authMiddleware (req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'))
  }

  const token = header.slice('Bearer '.length)

  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'))
  }
}
```

- [ ] **Step 6: Create test DB setup helper**

Create `test/setup.js`:
```js
import prisma from '../src/lib/prisma.js'

export async function resetDb () {
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
}
```

- [ ] **Step 7: Create the test app helper**

`src/app.js` doesn't exist yet (it's built in Task 7). To keep this task's tests runnable now, create a minimal `src/app.js` here with just what auth needs; Task 7 will expand it with the `users` router, Swagger UI, and full middleware stack without changing this file's exported shape.

Create `src/app.js`:
```js
import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import pinoHttp from 'pino-http'
import helmet from 'helmet'
import cors from 'cors'
import logger from './lib/logger.js'
import env from './lib/env.js'
import authRouter from './modules/auth/auth.routes.js'
import notFoundMiddleware from './middlewares/notFound.middleware.js'
import errorMiddleware from './middlewares/error.middleware.js'

const app = express()

app.use(compression())
app.use(pinoHttp({ logger }))
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: env.NODE_ENV === 'production' ? {} : { upgradeInsecureRequests: null }
  }
}))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.use('/auth', authRouter)

app.use(notFoundMiddleware)
app.use(errorMiddleware)

export default app
```

Run: `npm install express@^5.2.1 compression@^1.8.2 cookie-parser@^1.4.7 helmet@^8.3.0 cors@^2.8.6 pino-http@^11.0.0`

Create `test/helpers.js`:
```js
export async function buildApp () {
  const { default: app } = await import('../src/app.js')
  return app
}
```

- [ ] **Step 8: Write the failing auth integration tests**

Create `test/auth.test.js`:
```js
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
```

Run: `npm install -D supertest@^7.2.2`

- [ ] **Step 9: Create `.env.test` and migrate the test database**

Create `.env.test` at the project root (git-ignored — it holds generated secrets, never commit it). Generate two distinct random secrets and write the file in one go:

```bash
ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
cat > .env.test << EOF
NODE_ENV=test
DATABASE_URL="file:./test.db"
JWT_ACCESS_SECRET=$ACCESS_SECRET
JWT_REFRESH_SECRET=$REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
EOF
```

(`file:./test.db` resolves relative to `prisma/schema.prisma`'s directory, landing at `prisma/test.db` — matching where `file:./dev.db` landed `prisma/dev.db` in Task 1. Never write `file:./prisma/test.db` — that resolves to the nonexistent `prisma/prisma/test.db`.)

Add `.env.test` to `.gitignore` if it isn't already covered — check first: `grep -n "env.test\|\.env\*" .gitignore`. The existing entries are `.env`, `.env.test`, `.env.production` (standard gitignore template) — `.env.test` is very likely already covered; only add a line if it isn't.

Apply the migration to the test database using this file's values:
```bash
set -a; source .env.test; set +a
npx prisma migrate deploy
```
Expected: applies the `init` migration, creating `prisma/test.db`.

From this point on, every `vitest` invocation in this plan loads `.env.test` the same way — via `set -a; source .env.test; set +a` prefixed to the command, until Task 8 Step 4 wires `vitest.config.js` to load it automatically (after which the `source` prefix is no longer necessary, though it remains harmless).

- [ ] **Step 10: Run the integration tests against the implementation from Steps 1-7**

```bash
set -a; source .env.test; set +a
npx vitest run test/auth.test.js
```
Expected: PASS (8 tests). If any fail, fix the corresponding service/controller/route file from Steps 1-7 — do not weaken the test assertions.

- [ ] **Step 11: Lint and fix**

Run: `npx standard src/ test/ --fix`
Fix any remaining issues it reports manually (standard won't auto-fix everything, e.g. unused imports or variables).

- [ ] **Step 12: Commit**

```bash
git add src/modules/auth src/middlewares/auth.middleware.js src/app.js test/setup.js test/helpers.js test/auth.test.js package.json package-lock.json
git commit -m "Add auth module: register, login, refresh, logout with DB-tracked revocation"
```

---

## Task 6: Users module (CRUD on `req.user`)

**Note on step order:** same rationale as Task 5 — schema/service/controller/routes are written first, the integration test last, since this is a small cooperating stack rather than one pure function to red-green incrementally. The test is still run and required to pass before this task is done (Step 7).

**Files:**
- Create: `src/modules/users/users.schema.js`
- Create: `src/modules/users/users.service.js`
- Create: `src/modules/users/users.controller.js`
- Create: `src/modules/users/users.routes.js`
- Modify: `src/app.js` (mount `/users`)
- Test: `test/users.test.js`

**Interfaces:**
- Consumes: `prisma` (Task 1), `ConflictError`/`NotFoundError` (Task 2), `validate` (Task 4), `authMiddleware` (Task 5), `resetDb`/`buildApp` (Task 5's test infra).
- Produces: `usersRouter` (default export of `src/modules/users/users.routes.js`) — mounted at `/users`.

- [ ] **Step 1: Write the users Zod schema**

Create `src/modules/users/users.schema.js`:
```js
import { z } from 'zod'

export const updateMeSchema = {
  body: z.object({
    email: z.string().email()
  })
}
```

- [ ] **Step 2: Implement the users service**

Create `src/modules/users/users.service.js`:
```js
import prisma from '../../lib/prisma.js'
import { ConflictError, NotFoundError } from '../../lib/errors.js'

function toPublicUser (user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }
}

async function getById (id) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new NotFoundError('User not found')
  return toPublicUser(user)
}

async function updateEmail (id, email) {
  try {
    const user = await prisma.user.update({ where: { id }, data: { email } })
    return toPublicUser(user)
  } catch (err) {
    if (err.code === 'P2002') throw new ConflictError('Email already in use')
    throw err
  }
}

async function remove (id) {
  await prisma.user.delete({ where: { id } })
}

export default { getById, updateEmail, remove }
```

(Amended post-execution: the original draft's `updateEmail` had the same findUnique-then-write race already fixed once in `register()` — two concurrent PATCH requests setting the same not-yet-taken email could both pass the pre-check before either commits, and the loser's uncaught P2002 from `update()` would propagate past `errorMiddleware`'s AppError-only status mapping as an unhandled 500 instead of the intended 409. Fixed the same way as `register()`: drop the pre-check, catch P2002 directly on the write. See `src/modules/users/users.service.js`.)

- [ ] **Step 3: Implement the users controller**

Create `src/modules/users/users.controller.js`:
```js
import usersService from './users.service.js'

export async function getMe (req, res, next) {
  try {
    const user = await usersService.getById(req.user.id)
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

export async function updateMe (req, res, next) {
  try {
    const user = await usersService.updateEmail(req.user.id, req.body.email)
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

export async function deleteMe (req, res, next) {
  try {
    await usersService.remove(req.user.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
```

- [ ] **Step 4: Implement the users routes with Swagger annotations**

Create `src/modules/users/users.routes.js`:
```js
import { Router } from 'express'
import authMiddleware from '../../middlewares/auth.middleware.js'
import validate from '../../middlewares/validate.middleware.js'
import { updateMeSchema } from './users.schema.js'
import { getMe, updateMe, deleteMe } from './users.controller.js'

const router = Router()

router.use(authMiddleware)

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Missing or invalid access token }
 */
router.get('/me', getMe)

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update the current authenticated user's email
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Updated user }
 *       409: { description: Email already in use }
 */
router.patch('/me', validate(updateMeSchema), updateMe)

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete the current authenticated user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: User deleted }
 */
router.delete('/me', deleteMe)

export default router
```

- [ ] **Step 5: Mount the users router in app.js**

Edit `src/app.js` — add the import and mount line:
```js
import usersRouter from './modules/users/users.routes.js'
```
(add near the `authRouter` import)
```js
app.use('/users', usersRouter)
```
(add directly after `app.use('/auth', authRouter)`)

- [ ] **Step 6: Write the failing users integration tests**

Create `test/users.test.js`:
```js
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

describe('DELETE /users/me', () => {
  it('deletes the current user, subsequent auth then fails', async () => {
    const token = await registerAndLogin()
    const delRes = await request(app).delete('/users/me').set('Authorization', `Bearer ${token}`)
    expect(delRes.status).toBe(204)

    const getRes = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`)
    expect(getRes.status).toBe(404)
  })
})
```

- [ ] **Step 7: Run tests**

Run:
```bash
set -a; source .env.test; set +a
npx vitest run test/users.test.js
```
Expected: PASS (5 tests). Fix implementation, not test assertions, if anything fails.

- [ ] **Step 8: Lint and fix**

Run: `npx standard src/ test/ --fix`

- [ ] **Step 9: Commit**

```bash
git add src/modules/users src/app.js test/users.test.js
git commit -m "Add users module: get/update/delete authenticated user's own profile"
```

---

## Task 7: Swagger docs, final app.js assembly, server.js entrypoint

**Files:**
- Create: `src/docs/swagger.js`
- Modify: `src/app.js` (mount `/docs`)
- Create: `server.js`
- Delete: `app.js` (root), `app.local.js`, `bin/www`, `routes/index.js`, `routes/users.js`
- Test: `test/docs.test.js`

**Interfaces:**
- Consumes: `env` (Task 1).
- Produces: `swaggerSpec` (default export of `src/docs/swagger.js`) — the generated OpenAPI document, mounted via `swagger-ui-express` at `GET /docs`.

- [ ] **Step 1: Write the failing test for the docs endpoint**

Create `test/docs.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { buildApp } from './helpers.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/docs.test.js`
Expected: FAIL — `/docs/` and `/docs.json` return 404

- [ ] **Step 3: Implement the Swagger config**

Run: `npm install swagger-jsdoc@^6.3.0 swagger-ui-express@^5.0.1`

Create `src/docs/swagger.js`:
```js
import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'my-express-template API',
      version: '1.0.0',
      description: 'Starter template API with JWT auth and a Users resource'
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  },
  apis: ['./src/modules/**/*.routes.js']
}

export default swaggerJsdoc(options)
```

- [ ] **Step 4: Mount Swagger UI in app.js**

Edit `src/app.js` — add imports:
```js
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './docs/swagger.js'
```
Add after the `app.use(cookieParser())` line and before the router mounts:
```js
app.get('/docs.json', (req, res) => res.json(swaggerSpec))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/docs.test.js`
Expected: PASS

- [ ] **Step 6: Create the single server entrypoint**

Create `server.js`:
```js
import app from './src/app.js'
import env from './src/lib/env.js'
import logger from './src/lib/logger.js'

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`)
})

function shutdown (signal) {
  logger.info(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

- [ ] **Step 7: Remove the old entrypoints and routes**

```bash
git rm app.js app.local.js bin/www routes/index.js routes/users.js
rmdir bin routes 2>/dev/null || true
```

- [ ] **Step 8: Manual smoke test**

Run: `NODE_ENV=development DATABASE_URL="file:./dev.db" JWT_ACCESS_SECRET=<from .env> JWT_REFRESH_SECRET=<from .env> node server.js`

(`file:./dev.db` resolves relative to `prisma/schema.prisma`'s directory, i.e. to `prisma/dev.db` — the same file Task 1 Step 11's `prisma migrate dev` created. Do not write `file:./prisma/dev.db` here; that would resolve to the nonexistent `prisma/prisma/dev.db`.)
(Or, once Task 8 wires up `dotenv`/scripts, simply `npm run dev`.)

In another terminal:
```bash
curl -s http://localhost:3000/docs.json | head -c 200
curl -s -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' -d '{"email":"smoke@test.com","password":"password123"}'
```
Expected: JSON responses, no 500s. Stop the server (Ctrl-C), confirm the shutdown log line prints.

- [ ] **Step 9: Lint and fix**

Run: `npx standard src/ test/ server.js --fix`

- [ ] **Step 10: Run full test suite**

Run: `npx vitest run`
Expected: all tests across Tasks 1-7 PASS.

- [ ] **Step 11: Commit**

```bash
git add src/docs/swagger.js src/app.js server.js test/docs.test.js
git commit -m "Add Swagger docs endpoint and single server.js entrypoint"
```

---

## Task 8: package.json finalization, Docker cleanup, README rewrite

**Files:**
- Modify: `package.json` (final scripts + full dependency list)
- Modify: `dockerfile`
- Modify: `README.md`
- Test: none (config/docs task — verified via manual Docker build + `npm run` scripts)

**Interfaces:** none produced/consumed — this task wires up scripts and docs around the modules already built in Tasks 1-7.

- [ ] **Step 1: Decide on nodemon vs `--watch`**

Run: `node --watch server.js &` then in another terminal `curl -s http://localhost:3000/docs.json | head -c 50`, then edit `src/lib/logger.js` trivially (add then remove a blank line) and confirm the process restarts (watch the terminal output for a restart log line or reduced latency indicating reload). Kill the background process: `kill %1`.

If `--watch` reloads correctly and picks up `.env` values via the existing `dotenv`/env-loading approach (see Step 3 below — Node 22's `--watch` does not need `nodemon` for file-change restarts), drop `nodemon` from dependencies. If anything is flaky (e.g., `.env` not reloading because Node caches env at process start — expected and fine, since env rarely changes during a dev session), keep `nodemon` as a fallback dev dependency. Record the decision made and proceed with whichever is used below (this plan assumes `--watch` succeeds, as documented in Step 3; if it does not, substitute `nodemon server.js` for `node --watch server.js` in the `dev` script and run `npm install -D nodemon@^3.1.14` instead of uninstalling it).

- [ ] **Step 2: Rewrite package.json**

Edit `package.json` to its final form:
```json
{
  "name": "my-express-template",
  "version": "0.0.0",
  "description": "An opinionated Express API starter with JWT auth, Prisma/SQLite, and Swagger docs",
  "private": true,
  "type": "module",
  "author": "Puneeth Prakash",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build-dev": "npm install",
    "build-prod": "npm ci --omit=dev",
    "dev": "node --watch server.js",
    "start": "node server.js",
    "lint": "standard src test server.js",
    "lint-fix": "standard src test server.js --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.19.3",
    "argon2": "^0.45.1",
    "compression": "^1.8.2",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "helmet": "^8.3.0",
    "jsonwebtoken": "^9.0.3",
    "pino": "^10.3.1",
    "pino-http": "^11.0.0",
    "swagger-jsdoc": "^6.3.0",
    "swagger-ui-express": "^5.0.1",
    "zod": "^4.6.2"
  },
  "devDependencies": {
    "pino-pretty": "^13.1.3",
    "prisma": "^6.19.3",
    "standard": "^17.1.2",
    "supertest": "^7.2.2",
    "vitest": "^5.0.0"
  }
}
```
(Bump `standard` too — check current version first: `npm view standard version`, use whatever that returns in place of `17.1.2` if different.)

If Step 1 determined `--watch` is unreliable, add `"nodemon": "^3.1.14"` to `devDependencies` and change the `dev` script to `"nodemon server.js"`.

`dotenv` is still needed even though `env.js` reads `process.env` directly — add `import 'dotenv/config'` as the very first line of `server.js` (Step 3) so `.env` is loaded before anything else runs.

Run: `npm install` after editing, to sync `package-lock.json` and remove now-unused packages (`morgan`, `http-errors`, `debug`, and `nodemon` if dropped) from `node_modules`.

- [ ] **Step 3: Wire up dotenv loading in server.js**

Edit `server.js` — add as the first line:
```js
import 'dotenv/config'
```
(Before the `import app from './src/app.js'` line — `env.js` reads `process.env` at import time, so `dotenv/config` must run first.)

- [ ] **Step 4: Wire `vitest.config.js` to auto-load `.env.test`**

`.env.test` was already created in Task 5 Step 9, so from here on `npm test` should read env vars from it automatically instead of requiring them to be exported inline on every test run. Update `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.test' })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false
  }
})
```

(`fileParallelism: false` must be preserved from Task 1 Step 8's config — see that step's note for why. This full rewrite replaces the whole file, so the flag has to be carried forward explicitly here or it silently disappears and the test suite becomes flaky again as of this task.)

Run: `npm test` (no inline env vars needed anymore)
Expected: all tests PASS.

- [ ] **Step 5: Rewrite the Dockerfile**

Edit `dockerfile`:
```dockerfile
FROM node:22-alpine AS base
RUN apk add --no-cache dumb-init
WORKDIR /application

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /application/node_modules ./node_modules
COPY --from=build /application/node_modules/.prisma ./node_modules/.prisma
COPY . .
RUN npx prisma generate
USER node
EXPOSE 3000
CMD ["dumb-init", "sh", "-c", "npx prisma migrate deploy && node server.js"]
```

**Amended after Task 8 review (2026-09-14):** the runtime stage above has two
bugs, both found via static review since no Docker runtime was available in
this environment to catch them by an actual failed build/run:

1. `RUN npx prisma generate` in the runtime stage re-invokes the Prisma CLI,
   but `prisma` is a devDependency and the runtime stage's `node_modules`
   comes from the `deps` stage, which was installed with `--omit=dev` — the
   CLI binary isn't there, so this line fails. Fix: don't regenerate in the
   runtime stage at all; copy the CLI package (already used and thus already
   present) from the `build` stage instead, alongside the already-copied
   generated `.prisma` client.
2. `COPY . .` runs before `USER node` with no ownership flag, so all files
   (including the SQLite database file created at runtime under
   `prisma/prod.db`) end up owned by root while the process runs as `node` —
   writes fail. Fix: `--chown=node:node` on that COPY.

The corrected runtime stage:
```dockerfile
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /application/node_modules ./node_modules
COPY --from=build /application/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /application/node_modules/prisma ./node_modules/prisma
COPY --from=build /application/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["dumb-init", "sh", "-c", "npx prisma migrate deploy && node server.js"]
```

- [ ] **Step 6: Manual Docker build verification**

Run:
```bash
docker build -t my-express-template:test .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="file:./prod.db" \
  -e JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  -e JWT_REFRESH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  my-express-template:test
```
(`file:./prod.db` resolves relative to `prisma/schema.prisma`'s directory inside the container — `WORKDIR /application`, schema at `/application/prisma/schema.prisma` — landing at `/application/prisma/prod.db`. Same rule as the dev/test cases above; do not add a `prisma/` prefix.)
In another terminal: `curl -s http://localhost:3000/docs.json | head -c 100`
Expected: valid JSON response. Stop the container with Ctrl-C.

If the build fails, debug and fix the `dockerfile` — do not skip this verification, since Docker builds are exactly the kind of thing that looks right on paper and breaks in practice (multi-stage COPY paths, Prisma engine binary mismatches between build and runtime stages).

- [ ] **Step 7: Rewrite README.md**

Replace `README.md` entirely:
```markdown
# Express API Starter Template

An opinionated Express 5 API starter: JWT auth with DB-tracked refresh-token
revocation, SQLite via Prisma, Zod request validation, structured logging,
and Swagger/OpenAPI docs.

## Stack

- **Express 5** — HTTP framework
- **Prisma + SQLite** — ORM and database (swap the `datasource` in
  `prisma/schema.prisma` to point at Postgres/MySQL later if needed)
- **JWT (jsonwebtoken)** — short-lived access tokens + long-lived refresh
  tokens (httpOnly cookie), refresh tokens are hashed and tracked in the DB
  so logout actually revokes them
- **argon2** — password hashing
- **Zod** — request body/params/query validation, and environment variable
  validation at boot
- **pino / pino-http** — structured JSON logging
- **swagger-jsdoc + swagger-ui-express** — API docs generated from JSDoc
  comments above each route, served at `/docs`
- **Vitest + Supertest** — integration test suite

## Getting started

```bash
npm install
cp .env.sample .env
```

Edit `.env` and set `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` to long
random strings (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

Run the first database migration:
```bash
npm run db:migrate
```

Start the dev server:
```bash
npm run dev
```

The API is now running at `http://localhost:3000`, with interactive docs
at `http://localhost:3000/docs`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the server with file-watch auto-restart |
| `npm start` | Run the server (production) |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` / `lint-fix` | Standard JS lint / autofix |
| `npm run db:migrate` | Create and apply a new Prisma migration (dev) |
| `npm run db:migrate:deploy` | Apply existing migrations (production) |
| `npm run db:studio` | Open Prisma Studio, a GUI for the database |

## Environment variables

See `.env.sample`. `src/lib/env.js` validates these at boot and the process
exits immediately with a clear error if anything required is missing.

## API overview

- `POST /auth/register` — create an account
- `POST /auth/login` — get an access token + refresh cookie
- `POST /auth/refresh` — exchange the refresh cookie for a new access token
- `POST /auth/logout` — revoke the current refresh token
- `GET /users/me`, `PATCH /users/me`, `DELETE /users/me` — manage the
  authenticated user's own profile (`Authorization: Bearer <accessToken>`)

Full request/response schemas: `/docs`.

## Testing

Tests run against a dedicated SQLite database (`.env.test`, gitignored,
already created during setup — see below), reset between test files via
`test/setup.js`.

```bash
npm test
```

## Docker

```bash
docker build -t my-express-template .
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./prod.db" \
  -e JWT_ACCESS_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  my-express-template
```
```

- [ ] **Step 8: Final full verification pass**

Run in order:
```bash
npm run lint
npm test
npm run dev &
sleep 2
curl -s http://localhost:3000/docs.json | head -c 100
kill %1
```
Expected: lint clean, all tests pass, server boots and serves `/docs.json`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json dockerfile README.md server.js vitest.config.js .env.sample .gitignore
git commit -m "Finalize scripts, Docker multi-stage build, and README for the revamped template"
```

---

## Final Self-Check (for the implementer, after Task 8)

- [ ] `npm run lint` passes with zero warnings
- [ ] `npm test` passes (all files from Tasks 1-7)
- [ ] `npm run dev` boots without errors and `/docs` renders Swagger UI in a browser
- [ ] `docker build` succeeds and the container serves requests
- [ ] No file still imports `morgan`, `http-errors`, or `debug`
- [ ] `utils/security.js`, `stores/mainStore.js`, `app.local.js`, `bin/www`, `routes/index.js`, `routes/users.js` no longer exist in the repo
- [ ] `.env` and `.env.test` are git-ignored and were never committed (`git log --all --full-history -- .env .env.test` returns nothing)
