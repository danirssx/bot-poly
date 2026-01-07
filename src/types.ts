export type Side = "BUY" | "SELL";

/*
- The object is the shape of one row returned by Polymarket data endpoint /activty
- It will track the activity event that comes from the "type == 'TRADE'"
*/
export interface ActivityItem {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: string; // TRADE, SPLIT, etc
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  asset?: string;
  side?: Side;
  outcomeIndex?: number;
  outcome?: string;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
}

/*
Market metadata we get from Polymarket's Gamma API
- We will use if for enrichment + filtering + token resolution
- It's a market registry record, like a row in a markets catalog
- Each market has multiples outcomes, and each outcomes has it's own CLOB tokenId 'clob_token_ids'
*/

export interface GammaMarket {
  id: string | number;
  question?: string;
  slug?: string;
  conditionId?: string;
  category?: string;
  clob_token_ids?: string[]; // user four outcomeIndex -> TokenId mapping
}

export interface MarketMeta {
  conditionId: string;
  marketId: string; // gamma Id
  question: string;
  slug?: string;
  category?: string;
  clobTokenIds?: string[];
  tags?: string[]; // optional
}

/*
Is our own small "summary" object that represents the top of the order book for one outcome token on Polymarket's CLOB.
- It's using the GET /book from the 'getOrderBook(tokenID)'
*/

export interface OrderBookTop {
  bestBid?: number;
  bestAsk?: number;
  tickSize: number;
  negRisk: boolean;
  minOrderSize: number;
}
