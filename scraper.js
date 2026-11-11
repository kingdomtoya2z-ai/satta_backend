import * as cheerio from "cheerio";
import Game from "./models/Game.js";
import Result from "./models/Result.js";

const TARGET_URL = "https://satta-king-fast.com/";

function timeToOrder(timeStr) {
  const [time, period] = timeStr.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function parseTime(raw) {
  const match = raw.match(/at\s+(\d{1,2}:\d{2}\s+(?:AM|PM))/i);
  return match ? match[1] : null;
}

const CHART_COLUMN_MAP = {
  DSWR: "DS",
  FRBD: "FB",
  GZBD: "GB",
  GALI: "GL",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CHART_URL = "https://satta-king-fast.com/chart.php";

async function scrapeAndStoreMonthChart(month, year, gameIdMap, existingGames) {
  const url = `${CHART_URL}?month=${String(month).padStart(2, "0")}&year=${year}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    return { chartDays: 0, chartGames: new Set() };
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const $chartTable = $("table.chart-table");
  const $headerRow = $chartTable.find("tr.date-name");

  const chartCols = [];
  const chartGames = new Set();
  const colToShortName = {};

  if ($headerRow.length > 0) {
    $headerRow.find("th.name").each((i, th) => {
      const colName = $(th).text().trim().toUpperCase();
      chartCols.push(colName);
      const mapped = CHART_COLUMN_MAP[colName];
      if (mapped) {
        colToShortName[colName] = mapped;
        chartGames.add(mapped);
      } else {
        const matched = existingGames.find(g => g.id.toUpperCase() === colName);
        if (matched) {
          colToShortName[colName] = matched.id;
          chartGames.add(matched.id);
        }
      }
    });
  }

  if (chartCols.length === 0) return { chartDays: 0, chartGames };

  const chartData = [];
  $chartTable.find("tr.day-number").each((i, row) => {
    const $row = $(row);
    const day = $row.find("td.day").text().trim();
    if (!day) return;
    const rowData = { date: day };

    $row.find("td.number").each((j, td) => {
      const colName = chartCols[j];
      const shortName = colToShortName[colName];
      if (shortName) {
        rowData[shortName] = $(td).text().trim();
      }
    });

    chartData.push(rowData);
  });

  const todayStr = new Date().toLocaleDateString("en-CA");
  const monthStr = String(month).padStart(2, "0");

  for (const row of chartData) {
    const dateStr = `${year}-${monthStr}-${row.date.padStart(2, "0")}`;
    if (dateStr > todayStr) continue;

    for (const [shortName, value] of Object.entries(row)) {
      if (shortName === "date" || value === "--" || value === "XX") continue;

      const game = existingGames.find((g) => g.id === shortName);
      if (!game) continue;

      const gameId = gameIdMap[game.name];
      if (!gameId) continue;

      await Result.findOneAndUpdate(
        { date: dateStr, gameId },
        {
          gameName: game.name,
          time: game.time || "",
          result: value,
          generatedAt: new Date(),
        },
        { upsert: true },
      );
    }
  }

  return { chartDays: chartData.length, chartGames };
}

export async function scrapeAll() {
  const res = await fetch(TARGET_URL);
  const html = await res.text();
  const $ = cheerio.load(html);

  const scrapedGames = [];

  $(".quick-result-board > tbody").each((i, tbody) => {
    const $tbody = $(tbody);
    const sectionRow = $tbody.find("tr.board-section").first();
    if (sectionRow.length === 0) return;

    const sectionName = sectionRow.find("h3").text().trim();

    $tbody.find("tr.game-result").each((j, row) => {
      const $row = $(row);
      const hasDetailCells = $row.find(".yesterday-number").length > 0 && $row.find(".today-number").length > 0;
      if (!hasDetailCells) return;

      const id = $row.attr("id") || "";
      const isHighlight = $row.hasClass("highlight");
      const name = $row.find(".game-name").first().text().trim();
      const timeRaw = $row.find(".game-time").text().trim();
      const time = parseTime(timeRaw) || "";

      const yesterdayResult = $row.find(".yesterday-number h3").text().trim();
      const todayResult = $row.find(".today-number h3").text().trim();

      if (!name) return;

      scrapedGames.push({
        id: id.toUpperCase(),
        name,
        time,
        timeOrder: time ? timeToOrder(time) : 0,
        yesterdayResult: yesterdayResult || "--",
        todayResult: todayResult || "XX",
        highlight: isHighlight,
        section: sectionName,
      });
    });
  });

  const $chartTable = $("table.chart-table");
  const $headerRow = $chartTable.find("tr.date-name");

  const chartCols = [];
  const chartGames = new Set();
  const colToShortName = {};

  if ($headerRow.length > 0) {
    $headerRow.find("th.name").each((i, th) => {
      const colName = $(th).text().trim().toUpperCase();
      chartCols.push(colName);
      const mapped = CHART_COLUMN_MAP[colName];
      if (mapped) {
        colToShortName[colName] = mapped;
        chartGames.add(mapped);
      } else {
        const matched = scrapedGames.find(g => g.id.toUpperCase() === colName);
        if (matched) {
          colToShortName[colName] = matched.id;
          chartGames.add(matched.id);
        }
      }
    });
  }

  const chartData = [];
  $chartTable.find("tr.day-number").each((i, row) => {
    const $row = $(row);
    const day = $row.find("td.day").text().trim();
    if (!day) return;
    const rowData = { date: day };

    $row.find("td.number").each((j, td) => {
      const colName = chartCols[j];
      const shortName = colToShortName[colName];
      if (shortName) {
        rowData[shortName] = $(td).text().trim();
      }
    });

    chartData.push(rowData);
  });

  const chartTitle = $chartTable.find(".month h1").text().trim();
  const monthMatch = chartTitle.match(/(\w+)\s+(\d{4})/);
  const chartMonth = monthMatch ? monthMatch[1] : null;
  const chartYear = monthMatch ? monthMatch[2] : null;
  const chartMonthNum = chartMonth
    ? String(MONTH_NAMES.indexOf(chartMonth) + 1).padStart(2, "0")
    : null;

  const gameIdMap = {};

  for (const game of scrapedGames) {
    const existing = await Game.findOne({ name: game.name });
    if (existing) {
      existing.shortName = game.id;
      existing.time = game.time;
      existing.timeOrder = game.timeOrder;
      if (chartGames.has(game.id)) {
        existing.showInChart = true;
      }
      await existing.save();
      gameIdMap[game.name] = existing._id;
    } else {
      const newGame = await Game.create({
        name: game.name,
        shortName: game.id,
        time: game.time,
        timeOrder: game.timeOrder,
        showInChart: chartGames.has(game.id),
      });
      gameIdMap[game.name] = newGame._id;
    }
  }

  const todayStr = new Date().toLocaleDateString("en-CA");
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");

  for (const game of scrapedGames) {
    const gameId = gameIdMap[game.name];
    if (!gameId) continue;

    if (game.todayResult !== "XX" && game.todayResult !== "--") {
      await Result.findOneAndUpdate(
        { date: todayStr, gameId },
        {
          gameName: game.name,
          time: game.time,
          result: game.todayResult,
          generatedAt: new Date(),
        },
        { upsert: true },
      );
    }

    if (game.yesterdayResult !== "--") {
      await Result.findOneAndUpdate(
        { date: yesterdayStr, gameId },
        {
          gameName: game.name,
          time: game.time,
          result: game.yesterdayResult,
          generatedAt: new Date(),
        },
        { upsert: true },
      );
    }
  }

  if (chartMonthNum && chartYear && chartData.length > 0) {
    for (const row of chartData) {
      const dateStr = `${chartYear}-${chartMonthNum}-${row.date.padStart(2, "0")}`;
      if (dateStr > todayStr) continue;

      for (const [shortName, value] of Object.entries(row)) {
        if (shortName === "date" || value === "--" || value === "XX") continue;

        const game = scrapedGames.find((g) => g.id === shortName);
        if (!game) continue;

        const gameId = gameIdMap[game.name];
        if (!gameId) continue;

        await Result.findOneAndUpdate(
          { date: dateStr, gameId },
          {
            gameName: game.name,
            time: game.time || "",
            result: value,
            generatedAt: new Date(),
          },
          { upsert: true },
        );
      }
    }
  }

  // Scrape yearly chart data for current year and previous years
  const currentYear = new Date().getFullYear();
  const yearsToScrape = [currentYear];
  // Also scrape the most recent completed year if current month is early in the year
  if (new Date().getMonth() < 6) {
    yearsToScrape.push(currentYear - 1);
  }

  const scrapedMonthNum = chartMonthNum ? parseInt(chartMonthNum) : 0;
  let totalChartDays = chartData.length;
  let totalChartGames = chartGames.size;
  for (const year of yearsToScrape) {
    for (let m = 1; m <= 12; m++) {
      if (scrapedMonthNum > 0 && year === currentYear && m >= scrapedMonthNum) continue;
      const result = await scrapeAndStoreMonthChart(m, year, gameIdMap, scrapedGames);
      totalChartDays += result.chartDays;
      if (result.chartGames.size > totalChartGames) {
        totalChartGames = result.chartGames.size;
      }
    }
  }

  return {
    gamesScraped: scrapedGames.length,
    chartColumns: chartCols.length,
    chartDays: totalChartDays,
    chartGamesCount: totalChartGames,
  };
}
