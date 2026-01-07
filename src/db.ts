import Database from "better-sqlite3";
import { Config } from "./config.js";
import { safeJsonParse } from "./utils.js";
import type { ActivityItem, MarketMeta } from "./types.js";

export class DB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(Config.storage.sqlitePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS watched_wallets (
        wallet TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS observed_trades (
        tx_hash TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        ts INTEGER NOT NULL,
        condition_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        usdc_size REAL NOT NULL,
        outcome TEXT,
        outcome_index INTEGER,
        asset TEXT,
        slug TEXT,
        title TEXT,
        raw_json TEXT NOT NULL,
        category TEXT,
        notified INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS market_meta (
        condition_id TEXT PRIMARY KEY,
        meta_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        result_json TEXT
      );
    `);
  }

  getState<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM app_state WHERE key=?")
      .get(key) as any;
    if (!row?.value) return fallback;
    return safeJsonParse<T>(row.value, fallback);
  }

  setState(key: string, value: unknown) {
    const v = JSON.stringify(value);
    this.db
      .prepare(
        "INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, v);
  }

  addWallet(wallet: string) {
    this.db
      .prepare("INSERT OR IGNORE INTO watched_wallets(wallet) VALUES(?)")
      .run(wallet.toLowerCase());
  }

  removeWallet(wallet: string) {
    this.db
      .prepare("DELETE FROM watched_wallets WHERE wallet=?")
      .run(wallet.toLowerCase());
  }

  listWallets(): string[] {
    const rows = this.db
      .prepare("SELECT wallet FROM watched_wallets")
      .all() as any[];
    return rows.map((r) => r.wallet);
  }

  upsertMarketMeta(conditionId: string, meta: MarketMeta) {
    this.db
      .prepare(
        `
      INSERT INTO market_meta(condition_id, meta_json, updated_at)
      VALUES(?,?,?)
      ON CONFLICT(condition_id) DO UPDATE SET meta_json=excluded.meta_json, updated_at=excluded.updated_at
    `,
      )
      .run(conditionId, JSON.stringify(meta), Date.now());
  }

  getMarketMeta(conditionId: string): MarketMeta | undefined {
    const row = this.db
      .prepare("SELECT meta_json FROM market_meta WHERE condition_id=?")
      .get(conditionId) as any;
    if (!row?.meta_json) return undefined;
    return safeJsonParse<MarketMeta>(row.meta_json, undefined as any);
  }

  hasTrade(txHash: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM observed_trades WHERE tx_hash=?")
      .get(txHash) as any;
    return !!row;
  }

  insertTrade(item: ActivityItem, category?: string) {
    const tx = item.transactionHash || "";
    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO observed_trades(
        tx_hash, wallet, ts, condition_id, side, price, size, usdc_size,
        outcome, outcome_index, asset, slug, title, raw_json, category, notified
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `,
      )
      .run(
        tx,
        (item.proxyWallet || "").toLowerCase(),
        item.timestamp,
        item.conditionId,
        item.side || "",
        item.price ?? 0,
        item.size ?? 0,
        item.usdcSize ?? 0,
        item.outcome || null,
        item.outcomeIndex ?? null,
        item.asset || null,
        item.slug || null,
        item.title || null,
        JSON.stringify(item),
        category || null,
      );
  }

  markNotified(txHash: string) {
    this.db
      .prepare("UPDATE observed_trades SET notified=1 WHERE tx_hash=?")
      .run(txHash);
  }

  getTrade(txHash: string): any | undefined {
    return this.db
      .prepare("SELECT * FROM observed_trades WHERE tx_hash=?")
      .get(txHash);
  }

  addAction(actionId: string, txHash: string, action: string, result: unknown) {
    this.db
      .prepare(
        `
      INSERT INTO actions(id, tx_hash, action, created_at, result_json)
      VALUES(?,?,?,?,?)
    `,
      )
      .run(
        actionId,
        txHash,
        action,
        Date.now(),
        JSON.stringify(result ?? null),
      );
  }
}
