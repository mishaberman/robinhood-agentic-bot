import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const researchDir = join(root, "research");
const watchlistPath = join(researchDir, "watchlist.json");
const snapshotPath = join(researchDir, "market-snapshot.json");

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestPoint(result) {
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    const close = toNumber(closes[index]);
    if (close !== null) {
      return { time: timestamps[index] * 1000, close };
    }
  }
  return null;
}

async function fetchYahooChart(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "5m");
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "div,splits");

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!response.ok) throw new Error(`${symbol}: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: no chart result`);

  const meta = result.meta || {};
  const latest = latestPoint(result);
  const regularAsOf = toNumber(meta.regularMarketTime) ? toNumber(meta.regularMarketTime) * 1000 : null;
  const regularPrice = toNumber(meta.regularMarketPrice);
  const latestIsNewer = latest?.time && regularAsOf ? latest.time >= regularAsOf : Boolean(latest?.time);
  const price = latestIsNewer ? latest.close : regularPrice;
  const asOfMs = latestIsNewer ? latest?.time : regularAsOf;

  return {
    price,
    as_of: asOfMs ? new Date(asOfMs).toISOString() : null,
    previous_close: toNumber(meta.previousClose ?? meta.chartPreviousClose),
    bid: null,
    ask: null,
    open: toNumber(meta.regularMarketOpen),
    high: toNumber(meta.regularMarketDayHigh),
    low: toNumber(meta.regularMarketDayLow),
    volume: toNumber(meta.regularMarketVolume),
    avg_volume_30d: null,
    high_52w: toNumber(meta.fiftyTwoWeekHigh),
    low_52w: toNumber(meta.fiftyTwoWeekLow),
    market_cap: null,
    pe_ratio: null,
    pb_ratio: null,
    sector: null,
    industry: meta.instrumentType || null,
    ceo: "",
    employees: null
  };
}

async function main() {
  const [watchlist, existing] = await Promise.all([
    readJson(watchlistPath, { companies: [] }),
    readJson(snapshotPath, { symbols: {} })
  ]);

  const symbols = (watchlist.companies || []).map((company) => company.ticker).filter(Boolean);
  const next = {
    generated_at: new Date().toISOString(),
    source: "Yahoo Finance public chart API",
    note:
      "Public market snapshot for GitHub Pages freshness. Account, position, and order data still requires the Robinhood monitor. Bid/ask, fundamentals, and private account fields may be absent.",
    symbols: {}
  };
  const failures = [];

  for (const symbol of symbols) {
    try {
      const publicQuote = await fetchYahooChart(symbol);
      const prior = existing.symbols?.[symbol] || {};
      next.symbols[symbol] = {
        ...prior,
        ...publicQuote,
        avg_volume_30d: publicQuote.avg_volume_30d ?? prior.avg_volume_30d ?? null,
        market_cap: publicQuote.market_cap ?? prior.market_cap ?? null,
        pe_ratio: publicQuote.pe_ratio ?? prior.pe_ratio ?? null,
        pb_ratio: publicQuote.pb_ratio ?? prior.pb_ratio ?? null,
        sector: publicQuote.sector ?? prior.sector ?? null,
        industry: publicQuote.industry ?? prior.industry ?? null,
        ceo: prior.ceo || "",
        employees: prior.employees ?? null
      };
    } catch (error) {
      failures.push(error.message);
      if (existing.symbols?.[symbol]) next.symbols[symbol] = existing.symbols[symbol];
    }
  }

  if (failures.length) {
    next.warning = `Some public quotes failed: ${failures.slice(0, 6).join("; ")}`;
  }

  await writeFile(snapshotPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${snapshotPath} for ${Object.keys(next.symbols).length} symbols`);
  if (failures.length) console.log(next.warning);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
