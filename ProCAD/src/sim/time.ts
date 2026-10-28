/**
 * Simulation time is an integer number of picoseconds stored in a double.
 * Doubles hold integers exactly up to 2^53 ps, which is about 2.5 hours of
 * simulated time.
 */
export const PS_PER_SECOND = 1e12;

const UNIT_PS: Record<string, number> = {
  s: 1e12,
  ms: 1e9,
  us: 1e6,
  'µs': 1e6,
  ns: 1e3,
  ps: 1,
};

/** Parses "1.5s", "200ms", "10us", "750ns" or a bare number of seconds into picoseconds. */
export function parseDuration(text: string): number {
  const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(s|ms|us|µs|ns|ps)?\s*$/.exec(text);
  if (!match) {
    throw new Error(`invalid duration "${text}" (expected e.g. 1.5s, 200ms, 10us)`);
  }
  const unit = UNIT_PS[match[2] ?? 's'] ?? 1e12;
  return Math.round(Number(match[1]) * unit);
}

/** Formats picoseconds as seconds with microsecond resolution, e.g. "1.000062". */
export function formatSeconds(ps: number): string {
  return (ps / PS_PER_SECOND).toFixed(6);
}

/** Parses a clock frequency such as "16MHz", "8M", "16000000" into hertz. */
export function parseFrequency(text: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([kKmMgG]?)(?:hz|Hz|HZ)?\s*$/.exec(text);
  if (!match) {
    throw new Error(`invalid frequency "${text}" (expected e.g. 16MHz)`);
  }
  const scale: Record<string, number> = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 };
  return Number(match[1]) * (scale[match[2] ?? ''] ?? 1);
}
