import { Telegraf, Markup } from "telegraf";
import { Config } from "../config.js";
import type { ActivityItem, MarketMeta } from "../types.js";
import { renderTradeMessage } from "./render.js";
import { DB } from "../db.js";
import { ClobFacade } from "../polymarket/clob.js";
import { safeJsonParse } from "../utils.js";
import { fetchMarketMetaByConditionId } from "../polymarket/gammaApi.js";

type Callback =
  | { kind: "FOLLOW"; tx: string; mode: "PASSIVE" | "NOW" }
  | { kind: "IGNORE"; tx: string };

function encodeCb(cb: Callback): string {
  return Buffer.from(JSON.stringify(cb), "utf8").toString("base64url");
}
function decodeCb(s: string): Callback | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Callback;
  } catch {
    return null;
  }
}

export class TelegramBot {
  private bot: Telegraf;
  private chatId?: number;

  constructor(
    private db: DB,
    private clob: ClobFacade,
  ) {
    if (!Config.telegram.token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
    this.bot = new Telegraf(Config.telegram.token);
    this.chatId = Config.telegram.chatId;
    this.registerHandlers();
  }

  private isAuthorized(chatId: number): boolean {
    return this.chatId !== undefined && chatId === this.chatId;
  }

  private registerHandlers() {
    this.bot.start(async (ctx) => {
      const cid = ctx.chat.id;
      if (!this.chatId) {
        this.chatId = cid;
        console.log(
          `Set TELEGRAM_CHAT_ID=${cid} in .env to lock authorization.`,
        );
      }
      await ctx.reply(
        `✅ Bot online. Authorized chat: ${this.chatId}\n` +
          `Trading: ${Config.trading.enabled ? "ENABLED" : "DISABLED"}\n` +
          `Watched wallets: ${this.db.listWallets().length}`,
      );
    });

    this.bot.command("status", async (ctx) => {
      if (!this.isAuthorized(ctx.chat.id)) return ctx.reply("Not authorized.");
      const wallets = this.db.listWallets();
      const cats = Array.from(Config.filters.categories);
      const kws = Array.from(Config.filters.keywords);
      await ctx.reply(
        `📊 Status\n` +
          `Wallets: ${wallets.length}\n` +
          `Categories: ${cats.length ? cats.join(", ") : "(none)"}\n` +
          `Keywords: ${kws.length ? kws.join(", ") : "(none)"}\n` +
          `Min USDC size: ${Config.filters.minUsdcSize}\n` +
          `Copy sides: ${Array.from(Config.filters.copySides).join(", ")}\n` +
          `Trading: ${Config.trading.enabled ? "ENABLED" : "DISABLED"}`,
      );
    });

    this.bot.command("addwallet", async (ctx) => {
      if (!this.isAuthorized(ctx.chat.id)) return ctx.reply("Not authorized.");
      const parts = ctx.message.text.split(/\s+/).slice(1);
      if (!parts.length) return ctx.reply("Usage: /addwallet 0xabc...");
      const w = parts[0].toLowerCase();
      this.db.addWallet(w);
      await ctx.reply(`Added wallet: ${w}`);
    });

    this.bot.command("rmwallet", async (ctx) => {
      if (!this.isAuthorized(ctx.chat.id)) return ctx.reply("Not authorized.");
      const parts = ctx.message.text.split(/\s+/).slice(1);
      if (!parts.length) return ctx.reply("Usage: /rmwallet 0xabc...");
      const w = parts[0].toLowerCase();
      this.db.removeWallet(w);
      await ctx.reply(`Removed wallet: ${w}`);
    });

    this.bot.on("callback_query", async (ctx) => {
      const cid = ctx.chat?.id;
      if (cid === undefined || !this.isAuthorized(cid)) {
        await ctx.answerCbQuery("Not authorized.");
        return;
      }

      const data = (ctx.callbackQuery as any).data as string;
      const cb = decodeCb(data);
      if (!cb) {
        await ctx.answerCbQuery("Bad callback data.");
        return;
      }

      const tradeRow = this.db.getTrade(cb.tx);
      if (!tradeRow) {
        await ctx.answerCbQuery("Trade not found (maybe old).");
        return;
      }

      if (cb.kind === "IGNORE") {
        this.db.addAction(cryptoId(), cb.tx, "IGNORE", { ok: true });
        await ctx.answerCbQuery("Ignored.");
        return;
      }

      // FOLLOW
      const item = safeJsonParse<ActivityItem>(tradeRow.raw_json, null as any);
      if (!item) {
        await ctx.answerCbQuery("Bad stored trade payload.");
        return;
      }

      if (!Config.filters.copySides.has(item.side || "BUY")) {
        await ctx.answerCbQuery(`Copy side ${item.side} disabled.`);
        return;
      }

      // Resolve tokenID:
      const meta =
        this.db.getMarketMeta(item.conditionId) ??
        (await fetchMarketMetaByConditionId(item.conditionId));
      if (meta) this.db.upsertMarketMeta(item.conditionId, meta);

      const tokenIdFromGamma =
        meta?.clobTokenIds && typeof item.outcomeIndex === "number"
          ? meta.clobTokenIds[item.outcomeIndex]
          : undefined;

      const tokenID = tokenIdFromGamma || item.asset;
      if (!tokenID) {
        await ctx.answerCbQuery("Could not resolve tokenID for this trade.");
        return;
      }

      try {
        const result = await this.clob.placeFollowOrder({
          tokenID,
          side: item.side || "BUY",
          mode: cb.mode,
          usdcToSpend: Config.trading.copyUsdc,
        });
        this.db.addAction(cryptoId(), cb.tx, `FOLLOW_${cb.mode}`, result);
        await ctx.answerCbQuery(`Order sent (${cb.mode}).`);
        await ctx.reply(
          `✅ Followed (${cb.mode}).\nPrice: ${result.used.price}\nSize: ${result.used.size}\nOrderType: ${result.used.orderType}`,
        );
      } catch (e: any) {
        this.db.addAction(cryptoId(), cb.tx, `FOLLOW_${cb.mode}_ERROR`, {
          error: String(e?.message || e),
        });
        await ctx.answerCbQuery("Order failed.");
        await ctx.reply(`❌ Order failed: ${String(e?.message || e)}`);
      }
    });
  }

  async launch() {
    await this.bot.launch();
    console.log("Telegram bot launched");
  }

  async notifyTrade(item: ActivityItem, meta?: MarketMeta) {
    if (!this.chatId) {
      console.warn(
        "TELEGRAM_CHAT_ID not set yet. Send /start to the bot once.",
      );
      return;
    }

    const msg = renderTradeMessage(item, meta);

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "📥 Follow (Bid/Ask)",
          encodeCb({
            kind: "FOLLOW",
            tx: item.transactionHash!,
            mode: "PASSIVE",
          }),
        ),
        Markup.button.callback(
          "⚡ Follow (Now, FOK)",
          encodeCb({ kind: "FOLLOW", tx: item.transactionHash!, mode: "NOW" }),
        ),
      ],
      [
        Markup.button.callback(
          "🙈 Ignore",
          encodeCb({ kind: "IGNORE", tx: item.transactionHash! }),
        ),
      ],
    ]);

    await this.bot.telegram.sendMessage(this.chatId, msg, {
      parse_mode: "MarkdownV2",
      ...keyboard,
    });
  }
}

function cryptoId(): string {
  // cheap unique id without extra deps
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
