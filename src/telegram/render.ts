import type { ActivityItem, MarketMeta } from "../types.js";

export function renderTradeMessage(t: ActivityItem, meta?: MarketMeta): string {
  const wallet = (t.proxyWallet || "").toLowerCase();
  const when = new Date((t.timestamp ?? 0) * 1000).toISOString();
  const side = t.side || "BUY";
  const price = (t.price ?? 0).toFixed(4);
  const shares = (t.size ?? 0).toFixed(2);
  const usdc = (t.usdcSize ?? 0).toFixed(2);

  const title = t.title || meta?.question || "(unknown market)";
  const category = (meta?.category || "").trim();
  const slug = t.slug || meta?.slug || "";
  const outcome = t.outcome || "";

  const lines = [
    `🧾 *Whale trade detected*`,
    ``,
    `*Wallet:* \`${wallet}\``,
    `*Market:* ${escapeMd(title)}`,
    category ? `*Category:* ${escapeMd(category)}` : "",
    outcome ? `*Outcome:* ${escapeMd(outcome)}` : "",
    slug ? `*Slug:* \`${slug}\`` : "",
    `*Side:* *${side}*`,
    `*Price:* \`${price}\``,
    `*Shares:* \`${shares}\``,
    `*USDC:* \`${usdc}\``,
    `*Time:* \`${when}\``,
    t.transactionHash ? `*Tx:* \`${t.transactionHash}\`` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

// minimal MarkdownV2 escaping
export function escapeMd(s: string): string {
  return s.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, "\\$1");
}
