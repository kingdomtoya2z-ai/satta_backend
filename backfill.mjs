// One-time / scheduled backfill: scrape satta-king-fast.com and write games +
// results straight into the production MongoDB.
//
// Usage:
//   node backfill.mjs [MONGO_URI] [--quick]
//
// - MONGO_URI can also live in backend/.env (MONGO_URI=...) — recommended for
//   cron usage. The CLI argument takes precedence.
// - --quick refreshes only today's/yesterday's results + the previous month's
//   chart (2 requests). Without it, the full history is re-scraped (~11 reqs).
// - Set SCRAPE_VIA_JINA=1 to route fetches through r.jina.ai (needed when
//   running from datacenter IPs that Cloudflare blocks, e.g. Railway).
import "dotenv/config";
import mongoose from "mongoose";
import { scrapeAll } from "./scraper.js";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const uriArg = args.find((a) => !a.startsWith("--"));
const uri = uriArg || process.env.MONGO_URI;
if (!uri) {
  console.error("Usage: node backfill.mjs [MONGO_URI] [--quick]  (or set MONGO_URI in .env)");
  process.exit(1);
}

const ts = () => new Date().toISOString();
console.log(`[${ts()}] Connecting to MongoDB...`);
await mongoose.connect(uri);
console.log(`[${ts()}] Connected. Scraping satta-king-fast.com${quick ? " (quick mode)" : ""}...`);
const t0 = Date.now();
try {
  const result = await scrapeAll({ quick });
  console.log(`[${ts()}] Backfill done in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(result));
} catch (err) {
  console.error(`[${ts()}] Backfill failed:`, err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
