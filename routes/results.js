import { Router } from "express";
import Game from "../models/Game.js";
import Result from "../models/Result.js";

const router = Router();

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

router.get("/today", async (req, res) => {
  try {
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    const allGames = await Game.find().sort({ timeOrder: 1 });

    const [todaysResults, yesterdaysResults] = await Promise.all([
      Result.find({ date: today }),
      Result.find({ date: yesterday }),
    ]);

    const todayMap = {};
    for (const r of todaysResults) todayMap[r.gameId.toString()] = r;
    const yesterdayMap = {};
    for (const r of yesterdaysResults) yesterdayMap[r.gameId.toString()] = r;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const live = [];
    const next = [];
    const rest = [];

    for (const game of allGames) {
      const todayRes = todayMap[game._id.toString()];
      const yesterdayRes = yesterdayMap[game._id.toString()];
      const hasTodayResult = todayRes && todayRes.result !== "XX" && todayRes.generatedAt;
      const yesterdayResult = yesterdayRes && yesterdayRes.result !== "XX" ? yesterdayRes.result : "--";

      const gameMinutes = parseTimeToMinutes(game.time);
      const timeHasPassed = gameMinutes !== null && currentMinutes >= gameMinutes;

      const entry = {
        gameId: game._id,
        name: game.name,
        shortName: game.shortName || game.name,
        time: game.time,
        timeOrder: game.timeOrder,
        yesterdayResult,
        todayResult: hasTodayResult ? todayRes.result : (timeHasPassed ? "--" : "XX"),
        generatedAt: hasTodayResult ? todayRes.generatedAt : null,
        highlight: false,
        section: game.section || "REST",
      };

      const section = (game.section || "REST").toUpperCase();
      if (section === "LIVE") live.push(entry);
      else if (section === "NEXT") next.push(entry);
      else rest.push(entry);
    }

    // Match source ordering: LIVE descending by time, NEXT/REST ascending.
    live.sort((a, b) => b.timeOrder - a.timeOrder);
    next.sort((a, b) => a.timeOrder - b.timeOrder);
    rest.sort((a, b) => a.timeOrder - b.timeOrder);

    res.json({ live, next, rest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/monthly", async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const prefix = `${year}-${String(month).padStart(2, "0")}`;

    let chartGames = await Game.find({ showInChart: true }).sort({ timeOrder: 1 }).limit(5);

    const includeGame = req.query.include;
    if (includeGame) {
      const extra = await Game.findOne({ name: includeGame });
      if (extra && !chartGames.find(g => g._id.equals(extra._id))) {
        chartGames = [...chartGames, extra].sort((a, b) => a.timeOrder - b.timeOrder);
      }
    }

    const chartGameIds = chartGames.map(g => g._id);

    const results = await Result.find({
      date: { $regex: `^${prefix}` },
      gameId: { $in: chartGameIds },
    }).sort({ date: 1 });

    const resultByDate = {};
    for (const r of results) {
      const day = parseInt(r.date.split("-")[2]);
      if (!resultByDate[day]) resultByDate[day] = {};
      resultByDate[day][r.gameId.toString()] = r.result;
    }

    const todayStr = new Date().toLocaleDateString("en-CA");
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${prefix}-${String(d).padStart(2, "0")}`;
      const dt = new Date(dateStr);
      const isPast = dateStr < todayStr;
      const row = {
        date: String(d).padStart(2, "0"),
        sunday: dt.getDay() === 0,
      };
      for (const game of chartGames) {
        const key = game.shortName || game.name;
        row[key] = resultByDate[d]?.[game._id.toString()] || (isPast ? "--" : "XX");
      }
      rows.push(row);
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/years", async (req, res) => {
  try {
    const years = await Result.distinct("date", {});
    const resultYears = [...new Set(years.map(d => d.split("-")[0]))].sort();
    res.json(resultYears);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/game/:name/chart", async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const prefix = `${year}-${String(month).padStart(2, "0")}`;

    const game = await Game.findOne({ name: req.params.name });
    if (!game) return res.status(404).json({ error: "Game not found" });

    const results = await Result.find({
      date: { $regex: `^${prefix}` },
      gameId: game._id,
    }).sort({ date: 1 });

    const resultByDay = {};
    for (const r of results) {
      const day = parseInt(r.date.split("-")[2]);
      resultByDay[day] = r.result;
    }

    const todayStr = new Date().toLocaleDateString("en-CA");
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${prefix}-${String(d).padStart(2, "0")}`;
      const dt = new Date(dateStr);
      const isPast = dateStr < todayStr;
      rows.push({
        date: String(d).padStart(2, "0"),
        sunday: dt.getDay() === 0,
        result: resultByDay[d] || (isPast ? "--" : "XX"),
      });
    }

    res.json({ gameName: game.name, shortName: game.shortName || game.name, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
