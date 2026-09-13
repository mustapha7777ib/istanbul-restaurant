// Safe to import from browser components (no database imports here).

export type ScoreWeights = {
  rating: number;
  speed: number;
  productivity: number;
  responsiveness: number;
  reliability: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  rating: 35,
  speed: 25,
  productivity: 20,
  responsiveness: 10,
  reliability: 10,
};

export function scoreWeights(raw: unknown): ScoreWeights {
  const w = { ...DEFAULT_WEIGHTS, ...(typeof raw === "object" && raw ? (raw as Partial<ScoreWeights>) : {}) };
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof ScoreWeights)[]) {
    w[k] = Number.isFinite(Number(w[k])) ? Math.max(0, Number(w[k])) : DEFAULT_WEIGHTS[k];
  }
  return w;
}
