import type { ActivityItem } from "../types";

const BASE = "https://data-api.polymarket.com";

export async function fetchUserTradesActivity(params: {
  user: string;
  start?: number; // unix seconds?
  limit?: number;
}): Promise<ActivityItem[]> {
  const url = new URL(BASE + "/activity");
  url.searchParams.set("user", params.user);
  url.searchParams.set("type", "TRADE");
  url.searchParams.set("sortDirection", "DESC");
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", "0");

  if (params.start !== undefined)
    url.searchParams.set("start", String(params.start));

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`data API /activity error ${res.status}: ${t}`);
  }

  const data = (await res.json()) as ActivityItem[];
  return data;
}
