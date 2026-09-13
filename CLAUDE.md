@AGENTS.md

# Project notes

- Run: `pnpm dev` (custom `server.ts` = Next.js + Socket.io + 15s escalation ticker). Tests: `pnpm test` (Vitest, uses `TEST_DATABASE_URL`), `pnpm e2e` (Playwright, port 3100, test DB).
- Local Postgres here is Homebrew 17 on **port 5433** (5432 is a separate password-protected PG15).
- Every state change goes through `src/services/*`: permission/state checks → write + `logEvent()` in the same `prisma.$transaction` → `Outbox.flush()` after commit. Don't write to the DB from routes/pages directly.
- Money is integer kobo; percentages are basis points; report periods use `src/lib/time.ts` (Africa/Lagos).
- Prisma 7: client is generated to `src/generated/prisma` (import from `@/generated/prisma/client`), driver adapter `@prisma/adapter-pg`, config in `prisma.config.ts`.
