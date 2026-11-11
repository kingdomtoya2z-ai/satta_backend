import { Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import Game from "../models/Game.js";
import Result from "../models/Result.js";
import Ad from "../models/Ad.js";
import { scrapeAll, scrapeState } from "../scraper.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || "default-secret";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    jwt.verify(header.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token });
});

function timeToOrder(timeStr) {
  const [time, period] = timeStr.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

router.post("/games", authMiddleware, async (req, res) => {
  try {
    const { name, shortName, time, showInChart } = req.body;
    if (!name || !time) {
      return res.status(400).json({ error: "Name and time are required" });
    }
    const timeOrder = timeToOrder(time);
    const nameExists = await Game.findOne({ name });
    if (nameExists) {
      return res.status(409).json({ error: "Game already exists" });
    }
    const timeExists = await Game.findOne({ timeOrder });
    if (timeExists) {
      return res.status(409).json({ error: "Another game already has this time" });
    }
    if (showInChart) {
      const chartCount = await Game.countDocuments({ showInChart: true });
      if (chartCount >= 5) {
        return res.status(400).json({ error: "Maximum 5 games can be shown in monthly chart" });
      }
    }
    const game = await Game.create({
      name: name.toUpperCase(),
      shortName: shortName ? shortName.toUpperCase() : undefined,
      time,
      timeOrder,
      showInChart: !!showInChart,
    });
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/games", async (req, res) => {
  try {
    const games = await Game.find().sort({ timeOrder: 1 });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/games/:id", authMiddleware, async (req, res) => {
  try {
    const { name, shortName, time, showInChart } = req.body;
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (name) game.name = name.toUpperCase();
    if (shortName !== undefined) game.shortName = shortName ? shortName.toUpperCase() : undefined;
    if (time) {
      game.time = time;
      game.timeOrder = timeToOrder(time);
    }
    if (showInChart !== undefined) {
      if (showInChart) {
        const chartCount = await Game.countDocuments({ showInChart: true, _id: { $ne: game._id } });
        if (chartCount >= 5) return res.status(400).json({ error: "Maximum 5 games can be shown in monthly chart" });
      }
      game.showInChart = !!showInChart;
    }
    await game.save();
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/games/:id/chart", authMiddleware, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found" });
    const { showInChart } = req.body;
    if (showInChart) {
      const chartCount = await Game.countDocuments({ showInChart: true, _id: { $ne: game._id } });
      if (chartCount >= 5) {
        return res.status(400).json({ error: "Maximum 5 games can be shown in monthly chart" });
      }
    }
    game.showInChart = !!showInChart;
    await game.save();
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/games/:id", authMiddleware, async (req, res) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found" });
    await Result.deleteMany({ gameId: game._id });
    res.json({ message: "Game deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual result trigger disabled - results come only from scraping

// --- Ads CRUD ---

router.get("/ads", async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ads", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    let { title, type, url, active } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: isVideo ? "video" : "image", folder: "satta-ads" },
          (err, result) => { if (err) reject(err); else resolve(result); }
        );
        stream.end(req.file.buffer);
      });
      url = result.secure_url;
      type = type || (isVideo ? "video" : "image");
    } else {
      if (!url) return res.status(400).json({ error: "URL or file is required" });
      if (!type || !["image", "video"].includes(type)) {
        return res.status(400).json({ error: "Type must be 'image' or 'video'" });
      }
    }

    const ad = await Ad.create({ title, type, url, active: active !== false });
    res.status(201).json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/ads/:id", authMiddleware, async (req, res) => {
  try {
    const { title, active } = req.body;
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: "Ad not found" });
    if (title !== undefined) ad.title = title;
    if (active !== undefined) ad.active = !!active;
    await ad.save();
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/ads/:id", authMiddleware, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndDelete(req.params.id);
    if (!ad) return res.status(404).json({ error: "Ad not found" });
    res.json({ message: "Ad deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/scrape", authMiddleware, async (req, res) => {
  try {
    const result = await scrapeAll();
    res.json({ message: "Scrape completed", ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/scrape/status", (req, res) => {
  res.json({
    lastScrapeTime: scrapeState.lastRunAt,
    scrapeInProgress: scrapeState.inProgress,
    lastScrapeResult: scrapeState.lastResult,
  });
});

export default router;
