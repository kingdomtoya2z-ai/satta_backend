import { Router } from "express";
import Game from "../models/Game.js";

const router = Router();

const BASE_URL = "https://satta-samrat.com";

router.get("/sitemap.xml", async (req, res) => {
  try {
    const games = await Game.find().sort({ name: 1 });
    const today = new Date().toISOString().split("T")[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;

    for (const game of games) {
      const gameName = encodeURIComponent(game.name);
      xml += `
  <url>
    <loc>${BASE_URL}/?record=${gameName}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Error:", err);
    res.status(500).json({ error: "Failed to generate sitemap" });
  }
});

export default router;
