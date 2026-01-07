export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function nowMs(): number {
  return Date.now();
}

export function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function roundToTick(
  price: number,
  tick: number,
  direction: "down" | "up" | "nearest" = "nearest",
): number {
  if (tick <= 0) return price;
  const q = price / tick;
  if (direction === "down") return Math.floor(q) * tick;
  if (direction === "up") return Math.ceil(q) * tick;
  return Math.round(q) * tick;
}
