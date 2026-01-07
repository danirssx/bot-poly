# Polymarket Whale Alert Bot (Telegram + SQLite)

This bot watches **public on-chain activity** for a list of wallets and notifies you in Telegram when they trade.
You can then choose (via buttons) to:
- **Follow (Passive)**: place a limit order at the current best price on your side (enter on bid/ask).
- **Follow (Now, FOK)**: place a marketable limit order (Fill-or-Kill) to try to fill immediately.
- **Ignore**.

It also supports basic filtering by **category**, **keywords**, and **minimum trade size**.

## What APIs it uses

- Data API `/activity` to fetch wallet activity (trades) (no auth)
- Gamma API `/markets` to resolve `conditionId -> category/tags/tokenIds` (no auth)
- CLOB Client (`@polymarket/clob-client`) to get orderbooks (public) and to place orders (auth)

## Setup

### 1) Install
```bash
npm install
```

### 2) Create `.env`
Copy `.env.example` and fill values:
```bash
cp .env.example .env
```

### 3) Run
```bash
npm run start
```

Open Telegram and send `/start` to your bot. It will print your chat id; put it in `.env` as `TELEGRAM_CHAT_ID`
(or just keep using the printed one).

> ⚠️ If you enable trading, use a throwaway test wallet and small limits. Never commit private keys.

## Common commands (in Telegram)

- `/start` — authorize chat and see current config
- `/status` — show watchers + filters
- `/addwallet 0x...` — add a watched wallet
- `/rmwallet 0x...` — remove a watched wallet

## Notes

- If you don't set trading credentials, the bot works in **alert-only** mode.
- For SELL copying, you must already own the token you want to sell (allowance required).
