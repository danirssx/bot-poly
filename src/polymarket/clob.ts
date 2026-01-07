import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { Config } from "../config.js";
import type { OrderBookTop } from "../types.js";
import { clamp, roundToTick } from "../utils.js";

export class ClobFacade {
  private publicClient: ClobClient;
  private authedClient?: ClobClient;

  constructor() {
    this.publicClient = new ClobClient(
      Config.trading.clobHost,
      Config.trading.chainId,
    );
  }

  async getTop(tokenID: string): Promise<OrderBookTop> {
    const book = await this.publicClient.getOrderBook(tokenID);
    const bestBid = book.bids?.[0]?.price
      ? Number(book.bids[0].price)
      : undefined;
    const bestAsk = book.asks?.[0]?.price
      ? Number(book.asks[0].price)
      : undefined;
    const tickSize = Number(book.tick_size);
    const minOrderSize = Number(book.min_order_size);
    return {
      bestBid,
      bestAsk,
      tickSize: Number.isFinite(tickSize) ? tickSize : 0.01,
      negRisk: !!book.neg_risk,
      minOrderSize: Number.isFinite(minOrderSize) ? minOrderSize : 0,
    };
  }

  private async ensureAuthed(): Promise<ClobClient> {
    if (this.authedClient) return this.authedClient;

    if (!Config.trading.privateKey) {
      throw new Error("TRADING_ENABLED is true but PRIVATE_KEY is missing");
    }

    const signer = new Wallet(Config.trading.privateKey);
    let apiCreds = {
      key: Config.trading.apiKey,
      secret: Config.trading.secret,
      passphrase: Config.trading.passphrase,
    };

    if (!apiCreds.key || !apiCreds.secret || !apiCreds.passphrase) {
      // derive (does not necessarily invalidate like createApiKey; uses createOrDerive)
      const temp = new ClobClient(
        Config.trading.clobHost,
        Config.trading.chainId,
        signer,
      );
      const derived = await temp.createOrDeriveApiKey();
      apiCreds = {
        key: derived.key,
        secret: derived.secret,
        passphrase: derived.passphrase,
      };

      console.log(
        "Derived API creds. Put these in your .env for faster startup:",
      );
      console.log(`API_KEY=${derived.key}`);
      console.log(`SECRET=${apiCreds.secret}`);
      console.log(`PASSPHRASE=${apiCreds.passphrase}`);
    }

    const funder = (
      Config.trading.funderAddress || signer.address
    ).toLowerCase();
    this.authedClient = new ClobClient(
      Config.trading.clobHost,
      Config.trading.chainId,
      signer,
      apiCreds,
      Config.trading.signatureType,
      funder,
    );

    return this.authedClient;
  }

  /**
   * Places a limit order. For "Follow Now", we recommend OrderType.FOK so you don't get stuck.
   */
  async placeFollowOrder(args: {
    tokenID: string;
    side: "BUY" | "SELL";
    // if you want to enter passively on bid/ask:
    mode: "PASSIVE" | "NOW";
    // if you want to size by USDC:
    usdcToSpend: number;
  }): Promise<any> {
    if (!Config.trading.enabled)
      throw new Error("Trading is disabled (TRADING_ENABLED=false)");

    const client = await this.ensureAuthed();
    const top = await this.getTop(args.tokenID);

    const tick = top.tickSize;
    const slip = Config.trading.slippageTicks;

    // Determine target price
    let price: number;
    let orderType: OrderType;

    if (args.mode === "PASSIVE") {
      orderType = OrderType.GTC;
      if (args.side === "BUY") {
        if (top.bestBid === undefined) throw new Error("No best bid available");
        price = top.bestBid;
      } else {
        if (top.bestAsk === undefined) throw new Error("No best ask available");
        price = top.bestAsk;
      }
    } else {
      orderType = OrderType.FOK;
      if (args.side === "BUY") {
        if (top.bestAsk === undefined) throw new Error("No best ask available");
        price = top.bestAsk + tick * slip;
        price = clamp(roundToTick(price, tick, "up"), 0.001, 0.999);
      } else {
        if (top.bestBid === undefined) throw new Error("No best bid available");
        price = top.bestBid - tick * slip;
        price = clamp(roundToTick(price, tick, "down"), 0.001, 0.999);
      }
    }

    // Convert USDC to shares at chosen limit price
    const usdc = clamp(args.usdcToSpend, 0, Config.trading.maxUsdcPerTrade);
    const rawSize = usdc / price;
    const size = Math.max(rawSize, top.minOrderSize || 0);

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Invalid size computed: ${size}`);
    }

    const resp = await client.createAndPostOrder(
      {
        tokenID: args.tokenID,
        price,
        size,
        side: args.side === "BUY" ? Side.BUY : Side.SELL,
      },
      { tickSize: tick.toString() as any, negRisk: top.negRisk },
      orderType as any,
    );

    return {
      resp,
      used: { price, size, tick, negRisk: top.negRisk, orderType },
    };
  }
}
