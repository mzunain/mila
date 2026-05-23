-- Bootstrap script run once when the Postgres volume is first created.
-- Schema (tables, indexes, FKs) is owned by Prisma — see
-- apps/api/prisma/schema.prisma and run `pnpm --filter @mila/api prisma:migrate:dev`
-- to apply migrations. Only enable extensions here.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
