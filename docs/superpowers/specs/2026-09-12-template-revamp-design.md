# Express template revamp

## Context

This repo is a personal Express starter template created some time ago. Its
middleware stack, dependency versions, and code patterns predate current
Express 5 / Node practice, and it has accumulated dead code from unfinished
ideas:

- `routes/index.js` calls `res.render('index', ...)` with no view engine or
  `views/` directory configured — every request to `GET /` throws a 500.
- `stores/mainStore.js` is broken placeholder code: `getData`/`setData` each
  recursively call themselves, reference an undefined `req.data`, and are
  never imported anywhere.
- `utils/security.js` defines an `Encrypter` class but never actually exports
  it (`module.exports.Encrypter` is missing `= Encrypter`), and it's unused.
- `dockerfile` pins `node:lts-alpine3.15` (Node 16-era), sets
  `ENV NODE_ENV production` while the app actually reads a nonstandard
  `process.env.ENVIRONMENT` var — the two never agree, so the "show stack
  trace in dev" branch is dead in every environment as configured.
- No database, no auth, no API documentation, no tests, no CI beyond the
  Dependabot config added in a prior pass.

Goal: turn this into a more opinionated, genuinely useful starter — add a
database (via an ORM), JWT-based auth, Swagger/OpenAPI docs, and a test
suite — while removing dead code, fixing real bugs, and bringing every
dependency and pattern in line with current practice. This is a from-scratch
restructuring of how the project is organized, not a patch to the existing
flow, so it's treated as an architectural change with its own design and
plan.

## Decisions locked in with the user

- **Scope**: slightly opinionated template — DB + ORM, auth, Swagger docs.
  No view engine (explicitly declined after initial consideration).
- **Database/ORM**: SQLite + Prisma. File-based DB, zero external services
  to stand up, but swappable to Postgres later by changing the Prisma
  datasource.
- **Auth**: JWT access + refresh tokens. Refresh tokens are DB-tracked
  (hashed, in a `RefreshToken` table) so logout is a real server-side
  revocation, not just a client-side cookie clear.
- **Password hashing**: argon2.
- **Validation**: Zod, used for both request body validation and
  environment variable validation.
- **API docs**: swagger-jsdoc + swagger-ui-express, generated from JSDoc
  `@swagger` comments above route handlers, served at `/docs`.
- **Module system**: convert the whole codebase to ES modules
  (`import`/`export`).
- **Project structure**: feature-based modules (`src/modules/auth`,
  `src/modules/users`), not layered-by-role.
- **Example CRUD resource**: `users` — reuses the same `User` model auth
  needs, rather than inventing an unrelated second resource.
- **Testing**: Vitest + Supertest, covering the auth flow and the users
  CRUD endpoints as integration tests against the real Express app.
- **Dead code** (`stores/mainStore.js`, `utils/security.js`): fixed up and
  made genuinely useful rather than deleted — see "Dead code disposition"
  below for what each becomes.

## Target project structure

```
src/
  modules/
    auth/
      auth.routes.js        POST /register, /login, /refresh, /logout
      auth.controller.js
      auth.service.js       hashing, token issuing/verifying, revocation
      auth.schema.js         Zod schemas for register/login bodies
    users/
      users.routes.js       GET /users/me, PATCH /users/me, DELETE /users/me
      users.controller.js
      users.service.js
      users.schema.js
  middlewares/
    auth.middleware.js       verifies access JWT, attaches req.user
    validate.middleware.js   generic Zod-schema-validating middleware
    error.middleware.js      centralized error handler
    notFound.middleware.js   404 handler
  lib/
    prisma.js                singleton PrismaClient
    jwt.js                   sign/verify access + refresh tokens
    logger.js                pino instance
    env.js                   Zod-validated process.env, fails fast on boot
    crypto.js                fixed-up Encrypter utility (see below)
    errors.js                AppError base class + subclasses
  docs/
    swagger.js                swagger-jsdoc config, mounted at /docs
  app.js                      Express app assembly (middleware + routers)
server.js                     single entrypoint, replaces bin/www + app.local.js
prisma/
  schema.prisma
  migrations/
test/
  auth.test.js
  users.test.js
  setup.js                    test DB reset/seed helper
```

`bin/www` and `app.local.js` are removed in favor of one `server.js` that
reads `PORT` from the validated env and starts the HTTP server. There is no
behavioral reason in a template this size to keep a separate "local dev
entrypoint" from the production one — `npm run dev` will run `server.js`
under nodemon/`--watch` instead of a separate file.

## Dead code disposition

- **`stores/mainStore.js`** — deleted as a file, but its intent (a
  generic data-access helper) is superseded by `src/modules/*/\*.service.js`
  files talking to Prisma directly. Keeping a vestigial "store" layer on top
  of an ORM client would be redundant, not "fixed up."
- **`utils/security.js`** — becomes `src/lib/crypto.js`. Fixes the export
  bug, fixes the `dencrypt` → `decrypt` method name typo, and is actually
  used: the refresh-token value stored in the `RefreshToken` table is
  hashed with this utility before persisting (see Auth design), so it's no
  longer a copy-pasted-but-unused example — it does real work in the auth
  flow.

## Prisma schema

```prisma
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

Refresh tokens are hashed before storage (never stored plaintext), same
principle as password hashing.

## Auth flow

- `POST /auth/register` — Zod-validates `{ email, password }`, argon2-hashes
  the password, creates the `User` row, returns the created user (without
  `passwordHash`).
- `POST /auth/login` — verifies credentials, issues a short-lived JWT access
  token (returned in the JSON response body) and a long-lived refresh token
  (set as an httpOnly, secure-in-production cookie); the refresh token's
  hash + expiry are persisted to `RefreshToken`.
- `POST /auth/refresh` — reads the refresh cookie, looks up its hash in
  `RefreshToken`, verifies it's not expired/revoked, issues a new access
  token. Rotates the refresh token (deletes old row, inserts new) to limit
  replay window.
- `POST /auth/logout` — deletes the matching `RefreshToken` row and clears
  the cookie. This is real revocation, not just a client-side clear.
- `auth.middleware.js` — reads `Authorization: Bearer <token>`, verifies the
  access JWT, attaches `req.user` (`{ id, email }`), 401s on missing/invalid
  token.

## Users module (example CRUD, doubles as auth demo)

All routes require `auth.middleware.js` and operate on the authenticated
`req.user`, not arbitrary `:id` params — a template that lets any
authenticated user fetch/edit/delete *other* users' records by ID is a
foot-gun waiting to be copy-pasted into a real project.

- `GET /users/me` — return the current user's profile.
- `PATCH /users/me` — update email (Zod-validated), re-checks uniqueness.
- `DELETE /users/me` — deletes the user (cascades to their refresh tokens).

## Middleware stack (`src/app.js`)

Order: `compression()` → `pino-http` logger → `helmet()` → `cors()` →
`express.json()` / `express.urlencoded()` → `cookie-parser()` →
`/docs` (swagger-ui-express) → feature routers (`/auth`, `/users`) →
`notFound.middleware.js` → `error.middleware.js`.

`morgan` and `debug` are dropped in favor of `pino` + `pino-http` (structured
JSON logs, `pino-pretty` for readable dev output, meaningfully better once
there's real request context like `req.user.id` to log). `http-errors` is
dropped in favor of a small `AppError` class in `src/lib/errors.js` used by
`error.middleware.js` — with a real centralized handler in place, the extra
dependency for constructing status-coded errors adds little.

`compression`, `cors`, `helmet`, `cookie-parser`, `dotenv`, `express` are
kept, version-bumped to current majors (helmet 4→8 has breaking config-shape
changes between majors that implementation will need to account for).

## Environment variables

`src/lib/env.js` defines a Zod schema and validates `process.env` at boot,
throwing immediately with a clear message if anything required is missing —
replacing the current silent-`undefined` behavior around `ENVIRONMENT`.

```
NODE_ENV=development
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

`ENVIRONMENT` is retired in favor of the Node-standard `NODE_ENV`.
`.env.sample` is rewritten to match.

## Dependency changes

**Removed**: `morgan`, `debug`, `http-errors`.

**Added (runtime)**: `@prisma/client`, `jsonwebtoken`, `argon2`, `zod`,
`pino`, `pino-http`, `swagger-jsdoc`, `swagger-ui-express`.

**Added (dev)**: `prisma`, `pino-pretty`, `vitest`, `supertest`.

**Kept, version-bumped to current major**: `express`, `compression`,
`cors`, `cookie-parser`, `helmet`, `dotenv`.

`nodemon` may be replaceable by Node's built-in `--watch` flag now that the
project targets a current Node LTS — implementation should check whether
dropping `nodemon` entirely is viable, and only keep it if `--watch` proves
insufficient (e.g. for `.env` reload behavior).

`standard` is kept for linting; ESM works fine under `standard`.

## Docker / tooling cleanup

- `dockerfile`: bump base image to current Node LTS Alpine, fix
  `ENV NODE_ENV production` to actually match what the app reads, use
  `npm ci --omit=dev` (the `--only=production` flag is deprecated),
  multi-stage build so Prisma's generated engine binaries and dev
  dependencies don't bloat the final image, run `prisma generate` and
  `prisma migrate deploy` as part of the build/start sequence.
- Add `.nvmrc` pinning the Node version, add an `engines` field to
  `package.json` matching it.
- `package.json` scripts updated: `dev` runs `server.js` under
  `--watch`/nodemon, `start` runs `server.js` directly, add `test`
  (vitest run), `test:watch`, `db:migrate` / `db:generate` / `db:studio`
  (Prisma CLI wrappers).
- `README.md` rewritten to describe the new setup: env vars, running
  Prisma migrations, running tests, where `/docs` is served, auth flow
  summary.
- `.gitignore`/`.dockerignore` updated to exclude `prisma/dev.db`,
  `prisma/migrations` is *not* ignored (migrations are committed).

## Testing

Vitest + Supertest, run against the real Express app with a dedicated test
SQLite database (separate `DATABASE_URL`, reset between test files via
`test/setup.js`). Coverage:

- `test/auth.test.js` — register (success + duplicate email), login
  (success + wrong password), refresh (success + expired/revoked token
  rejected), logout (subsequent refresh with the same token fails).
- `test/users.test.js` — `GET/PATCH/DELETE /users/me` require auth (401
  without token), and behave correctly with a valid token.

## Error handling

`src/lib/errors.js` defines `AppError` (statusCode, message, optional
details) and common subclasses (`NotFoundError`, `UnauthorizedError`,
`ValidationError`). `error.middleware.js` catches thrown/`next()`-ed errors,
logs 5xx via pino, and returns a consistent JSON error shape:
`{ error: { message, details? } }`. Stack traces are included only when
`NODE_ENV !== 'production'`.

## Out of scope

- No view engine / server-rendered pages (explicitly declined).
- No CI workflow beyond the existing Dependabot config — adding GitHub
  Actions for running tests/lint on PRs is a reasonable follow-up but
  wasn't requested and is left for a separate pass.
- No rate limiting, no email verification, no password reset flow — auth
  scope is deliberately a minimal-but-correct demonstration, not a full
  user-management system.
- No Postgres/docker-compose — SQLite needs no separate service; swapping
  to Postgres later is a datasource-string change, not part of this pass.
