import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

// One client per process. server.ts (tsx) and the Next.js bundle load this
// module separately, so the instance lives on globalThis to be shared.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.__prisma ?? createClient();
globalForPrisma.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
