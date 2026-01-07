import { Config } from "./config";
import { DB } from "./db";
import { WalletWatcher } from "./watcher/walletWatcher";
import { TelegramBot } from "./telegram/bot";
import { ClobFacade } from "./polymarket/clob.js";

async function main() {
  const db = new DB();

  // seed wallets from env
  for (const w of Config.watchWallets) db.addWallet(w);

  const clob = new ClobFacade();
  const telegram = new TelegramBot(db, clob);
  await telegram.launch();

  const watcher = new WalletWatcher(db, telegram);
  await watcher.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
