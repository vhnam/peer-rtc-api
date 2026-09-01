# peer-rtc-api

NestJS API for Peer RTC. It serves Better Auth (email/password) over HTTPS in development, with origin-based roles for a **consumer** app and a **provider** app.

## Stack

- NestJS 12, ESM, TypeScript
- [Better Auth](https://www.better-auth.com/) via `@thallesp/nestjs-better-auth`
- Prisma Next (Postgres 15+) for users, sessions, and accounts
- Vitest, Biome (format), Oxlint

## Requirements

- Node.js (pnpm)
- PostgreSQL 15 or newer
- Optional: [mkcert](https://github.com/FiloSottile/mkcert) so browsers trust local HTTPS (`pnpm start:dev` falls back to a self-signed OpenSSL cert if mkcert is missing)

## Setup

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` and `BETTER_AUTH_SECRET` in `.env`. Then create tables:

```bash
pnpm db:init
```

Schema lives in [`src/prisma/contract.prisma`](src/prisma/contract.prisma). After contract changes:

```bash
pnpm contract:emit
```

## Run

```bash
pnpm start:dev    # HTTPS on PORT (default 8080); writes certs/dev-*.pem if needed
pnpm start        # no watch, no auto TLS
pnpm start:prod   # node dist/main (run pnpm build first)
```

`start:dev` / `start:debug` generate TLS certs and set `SSL_KEY_PATH` / `SSL_CERT_PATH`. Without those env vars the process listens on HTTP.

Trusted CORS origins default to `https://localhost:3000` and `https://localhost:4000` (`CORS_ORIGIN` in `.env`).

## Auth

Better Auth is mounted at `/api/auth/*`. Role is stored on the user (`consumer` | `provider`) and is **not** taken from signup payloads.

| Origin | Role | Register | Sign-in |
| --- | --- | --- | --- |
| `https://localhost:3000` | consumer | yes (role forced to `consumer`) | `{ email, password, role: "consumer" }` |
| `https://localhost:4000` | provider | no | `{ email, password, role: "provider" }` |

Sign-in must send `role` matching the Origin, and the account’s stored role. Crossing apps (consumer account on the provider origin, or the reverse) is rejected.

Seed a provider account (cannot self-register):

```bash
pnpm db:seed:provider
```

Override with `SEED_PROVIDER_EMAIL`, `SEED_PROVIDER_PASSWORD`, `SEED_PROVIDER_NAME`.

Example:

```bash
# consumer signup
curl -k https://localhost:8080/api/auth/sign-up/email \
  -H 'Origin: https://localhost:3000' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"Password123!"}'

# consumer sign-in
curl -k https://localhost:8080/api/auth/sign-in/email \
  -H 'Origin: https://localhost:3000' \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password123!","role":"consumer"}'
```

Password reset emails are logged to the server console in development (no mailer yet).

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm start:dev` | Watch mode + Prisma contract emit + local TLS |
| `pnpm test` / `pnpm test:watch` | Unit tests |
| `pnpm test:e2e` | Auth e2e (needs a running database) |
| `pnpm test:cov` | Coverage |
| `pnpm lint` | Oxlint |
| `pnpm format` | Biome format |
| `pnpm build` | Nest compile |
| `pnpm deploy` | Nest deploy |

Prisma Next notes: [`prisma-next.md`](prisma-next.md).
