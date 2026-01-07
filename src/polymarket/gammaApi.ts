import type { GammaMarket, MarketMeta } from "../types";

const BASE = "https://gamma-api.polymarket.com";

// Here we get basically like the metadata of the whole Market

export async function fetchMarketMetaByConditionId(
  conditionId: string,
): Promise<MarketMeta | undefined> {
  const url = new URL(BASE + "/markets");
  url.searchParams.set("condition_ids", conditionId);
  url.searchParams.set("limit", "1");
  url.searchParams.set("offset", "0");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gamma /markets error ${res.status}: ${t}`);
  }

  const markets = (await res.json()) as GammaMarket[];
  if (!markets.length) return undefined;

  const m = markets[0];
  return {
    conditionId,
    marketId: String(m.id),
    question: m.question || m.slug || conditionId,
    slug: m.slug,
    category: m.category,
    clobTokenIds: m.clob_token_ids ?? undefined,
  };
}
