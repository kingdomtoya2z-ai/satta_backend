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
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  next();
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/satta-king";
const SCRAPE_INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS || "60000", 10);

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
    if (err.status !== 409) console.error(`[Scraper] Error:`, err.message);
  } finally {
    scraping = false;
  }
}

// Initial scrape on startup (full: rebuilds all chart history)
setTimeout(async () => {
  await doScrape();
}, 2000);

// Quick refresh every 30s: today's/yesterday's results plus the previous
// month's chart — keeps the site in sync with satta-king-fast.com. Runs are
// short (2 requests) and guarded against overlap by doScrape().
setInterval(() => doScrape({ quick: true }), SCRAPE_INTERVAL_MS);

// Full history rebuild once a day
cron.schedule("5 4 * * *", () => doScrape());

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
