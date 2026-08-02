/**
 * Parses the `15m` / `7d` style TTL strings used for JWTs into milliseconds,
 * so the refresh-token row's expiresAt always matches the signed token.
 */
const PATTERN = /^(\d+)\s*(ms|s|m|h|d)$/i;

const MULTIPLIER: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(value: string): number {
  const match = PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}". Use forms like 900s, 15m, 12h, 7d.`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'ms').toLowerCase();
  const multiplier = MULTIPLIER[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid duration unit "${unit}".`);
  }
  return amount * multiplier;
}
