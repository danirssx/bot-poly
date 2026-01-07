import { Config } from "../config";
import { DB } from "../db";
import { fetchUserTradesActivity } from "../polymarket/dataApi";
import { fetchMarketMetaByConditionId } from "../polymarket/gammaApi";
import type { ActivityItem } from "../types";
import { sleep } from "../utils";
import { TelegramBot } from "../telegram/bot";

function matchesFiters(t: ActivityItem, metaCategory?: string): boolean {
  if ((t.usdcSize ?? 0) < Config.filters.minUsdcSize) return false;

  // category filter (Gamma's `category` field)
  if (Config.filters.categories.size) {
    const c = (metaCategory || "").toLowerCase();
    if (!c || !Config.filters.categories.has(c)) return false;
  }

  // keywords filter (match title/slug/outcome/eventSlug)
  if (Config.filters.keywords.size) {
    const hay = [
      t.title ?? "",
      t.slug ?? "",
      t.eventSlug ?? "",
      t.outcome ?? "",
    ]
      .join("")
      .toLowerCase();
    let ok = false;
    for (const kw of Config.filters.keywords) {
      if (kw && hay.includes(kw)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }

  return true;
}

export class WalletWatcher {
  private running = false;

  constructor(
    private db: DB,
    private telegram: TelegramBot,
  ) {}

  async start() {
    this.running = true;
    console.log("WalletWatcher comenzo");
    while (this.running) {
      const wallets = this.db.listWallets();
      for (const w of wallets) {
        try {
          await this.pollWallet(w);
        } catch (e: any) {
          console.warn(`pollWallet(${w}) failed:`, e?.message || e);
        }
      }
      await sleep(Config.polling.intervalMs);
    }
  }

  stop() {
    this.running = false;
  }

  private cursorKey(wallet: string) {
    return `cursor:${wallet.toLowerCase()}`;
  }

  private async pollWallet(wallet: string) {
    const cursor = this.db.getState<{ lastTs: number }>(
      this.cursorKey(wallet),
      { lastTs: 0 },
    );

    // DATA-API start/end are integers
    const items = await fetchUserTradesActivity({
      user: wallet,
      start: cursor.lastTs ? cursor.lastTs + 1 : undefined,
      limit: 100,
    });

    if (!items.length) return;

    // DATA returns DESC, process oldest -> newest notifications, notifications feel ordered
    const ordered = items.slice().sort((a, b) => a.timestamp - b.timestamp);

    let maxTs = cursor.lastTs;

    for (const t of ordered) {
      if (t.type !== "TRADE") continue;
      if (!t.transactionHash) continue;
      if (!t.side || !t.price || !t.size || t.usdcSize) continue;

      maxTs = Math.max(maxTs, t.timestamp);

      if (this.db.hasTrade(t.transactionHash)) continue;

      // enrich with market category (Gamma) for filtering + message
      let meta = this.db.getMarketMeta(t.conditionId);
      if (!meta) {
        meta = await fetchMarketMetaByConditionId(t.conditionId);
        if (meta) this.db.upsertMarketMeta(t.conditionId, meta);
      }

      const category = meta?.category;
      if (!matchesFiters(t, category)) continue;

      this.db.insertTrade(t, category);

      await this.telegram.notifyTrade(t, meta);
      this.db.markNotified(t.transactionHash);
    }

    if (maxTs > cursor.lastTs) {
      this.db.setState(this.cursorKey(wallet), { lastTs: maxTs });
    }
  }
}
