import type { Tx } from "./db";
import { prisma } from "./db";

export { DEFAULT_WEIGHTS, scoreWeights, type ScoreWeights } from "./score-weights";

/** The single settings row, created with defaults on first use. */
export async function getSettings(tx: Tx = prisma) {
  return tx.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
