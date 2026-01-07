import "dotenv/config";

function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return ["1", "true", "yes", "y", "on"].includes(v.toLowerCase());
}

function envNum(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const Config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID
      ? Number(process.env.TELEGRAM_CHAT_ID)
      : undefined,
  },
  watchWallets: parseList(process.env.WATCH_WALLETS).map((s) =>
    s.toLowerCase(),
  ),
  filters: {
    categories: new Set(
      parseList(process.env.FILTER_CATEGORIES).map((s) => s.toLowerCase()),
    ),
    keywords: new Set(
      parseList(process.env.FILTER_KEYWORDS).map((s) => s.toLowerCase()),
    ),
    minUsdcSize: envNum("MIN_USDC_SIZE", 0),
    copySides: new Set(
      parseList(process.env.COPY_SIDES || "BUY").map((s) => s.toUpperCase()),
    ),
  },
  polling: {
    intervalMs: envNum("POLL_INTERVAL_MS", 15000),
  },
  storage: {
    sqlitePath: process.env.SQLITE_PATH || "./bot.sqlite",
  },
  trading: {
    enabled: envBool("TRADING_ENABLED", false),
    privateKey: process.env.PRIVATE_KEY || "",
    apiKey: process.env.API_KEY || "",
    secret: process.env.SECRET || "",
    passphrase: process.env.PASSPHRASE || "",
    clobHost: process.env.CLOB_HOST || "https://clob.polymarket.com",
    chainId: envNum("CHAIN_ID", 137),
    signatureType: envNum("SIGNATURE_TYPE", 0),
    funderAddress:
      (process.env.FUNDER_ADDRESS || "").toLowerCase() || undefined,
    maxUsdcPerTrade: envNum("MAX_USDC_PER_TRADE", 5),
    copyUsdc: envNum("COPY_USDC", 5),
    slippageTicks: envNum("COPY_SLIPPAGE_TICKS", 2),
  },
} as const;
