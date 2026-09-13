import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

// Fresh test database with the demo seed (staff, tables, menu) before the run.
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) throw new Error("Set a separate TEST_DATABASE_URL in .env");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm exec prisma migrate deploy", { stdio: "ignore", env });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await client.end();
  execSync("pnpm exec tsx prisma/seed.ts", { stdio: "ignore", env });
  // The seed uses Istanbul's real hours (10:00–23:00); tests must pass at any time of day.
  const after = new pg.Client({ connectionString: url });
  await after.connect();
  await after.query(`UPDATE "Settings" SET "openingTime" = '00:00', "closingTime" = '00:00' WHERE id = 1`);
  await after.end();
}
