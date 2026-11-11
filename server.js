import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cron from "node-cron";
import adminRoutes from "./routes/admin.js";
import resultRoutes from "./routes/results.js";
import contactRoutes from "./routes/contact.js";
import sitemapRoutes from "./routes/sitemap.js";
import { scrapeAll } from "./scraper.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/satta-king";
const SCRAPE_INTERVAL = process.env.SCRAPE_INTERVAL || 5;

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => { console.error("MongoDB error:", err); process.exit(1); });

app.use("/api/admin", adminRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api", sitemapRoutes);

let scraping = false;
async function doScrape(opts = {}) {
  if (scraping) {
    console.log(`[Scraper] Skipping run: previous scrape still in progress`);
    return;
  }
  scraping = true;
  try {
    console.log(`[Scraper] Fetching data from satta-king-fast.com${opts.quick ? " (quick refresh)" : ""}...`);
    const result = await scrapeAll(opts);
    console.log(`[Scraper] Done: ${result.gamesScraped} games, ${result.chartDays} chart days`);
  } catch (err) {
    console.error(`[Scraper] Error:`, err.message);
  } finally {
    scraping = false;
  }
}

// Initial scrape on startup (full: rebuilds all chart history)
setTimeout(async () => {
  await doScrape();
}, 2000);

// Quick refresh every SCRAPE_INTERVAL minutes: today's/yesterday's results
// plus the previous month's chart — 2 requests, keeps runs short so runs
// never pile up. Full history is rebuilt daily below.
cron.schedule(`*/${SCRAPE_INTERVAL} * * * *`, () => doScrape({ quick: true }));

// Full history rebuild once a day
cron.schedule("5 4 * * *", () => doScrape());

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
