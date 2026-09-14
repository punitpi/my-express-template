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
