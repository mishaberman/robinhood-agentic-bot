import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const docsDataDir = join(root, "docs", "data");
const researchDir = join(root, "research");
const companiesDir = join(researchDir, "db", "companies");
const outputPath = join(docsDataDir, "research.json");

const metricLabels = {
  revenue: "Revenue",
  gross_profit: "Gross profit",
  operating_income: "Operating income",
  net_income: "Net income",
  diluted_eps: "Diluted EPS",
  operating_cash_flow: "Operating cash flow",
  capex: "Capital expenditures",
  cash: "Cash",
  inventory: "Inventory"
};

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readText(path, fallback = "") {
  if (!existsSync(path)) return fallback;
  return readFile(path, "utf8");
}

function compactText(value, max = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentChange(now, before) {
  const current = toNumber(now);
  const prior = toNumber(before);
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function rangePosition(price, low, high) {
  const current = toNumber(price);
  const lowNumber = toNumber(low);
  const highNumber = toNumber(high);
  if (current === null || lowNumber === null || highNumber === null || highNumber === lowNumber) return null;
  return Math.max(0, Math.min(100, ((current - lowNumber) / (highNumber - lowNumber)) * 100));
}

function volumeRatio(volume, averageVolume) {
  const current = toNumber(volume);
  const average = toNumber(averageVolume);
  if (current === null || average === null || average === 0) return null;
  return current / average;
}

function latestFact(metric) {
  const facts = metric?.facts || [];
  return [...facts]
    .filter((fact) => fact.value !== null && fact.value !== undefined)
    .sort((a, b) => {
      const filed = String(b.filed || "").localeCompare(String(a.filed || ""));
      if (filed !== 0) return filed;
      return String(b.end || "").localeCompare(String(a.end || ""));
    })[0] || null;
}

function metricSnapshot(financialFacts) {
  const metrics = financialFacts?.metrics || {};
  return Object.entries(metricLabels)
    .map(([key, label]) => {
      const metric = metrics[key];
      const fact = latestFact(metric);
      if (!fact) return null;
      return {
        key,
        label,
        unit: metric.unit,
        value: fact.value,
        period: fact.fp,
        fiscal_year: fact.fy,
        end: fact.end,
        filed: fact.filed,
        form: fact.form,
        frame: fact.frame || null,
        accession_number: fact.accession_number
      };
    })
    .filter(Boolean);
}

function extractedTrendBullets(markdown) {
  const lines = String(markdown || "").split("\n");
  const start = lines.findIndex((line) => /^## Extracted Trend Snapshot/i.test(line));
  if (start === -1) return [];
  const bullets = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    const match = line.match(/^\s*-\s+(.+)/);
    if (match) bullets.push(match[1]);
  }
  return bullets;
}

function strategyFor(scorecard, symbol) {
  const item = scorecard?.symbols?.[symbol] || {};
  return {
    priority: item.priority ?? null,
    role: item.role || null,
    theme: item.theme || null,
    bull_triggers: item.bull_triggers || [],
    confirmation: item.confirmation || [],
    disqualifiers: item.disqualifiers || [],
    notional_bias: item.notional_bias || null,
    source_notes: item.source_notes || []
  };
}

function marketFor(snapshot, symbol) {
  const raw = snapshot?.symbols?.[symbol] || null;
  if (!raw) return null;
  return {
    ...raw,
    day_change: toNumber(raw.price) !== null && toNumber(raw.previous_close) !== null ? toNumber(raw.price) - toNumber(raw.previous_close) : null,
    day_change_pct: percentChange(raw.price, raw.previous_close),
    spread: toNumber(raw.ask) !== null && toNumber(raw.bid) !== null ? toNumber(raw.ask) - toNumber(raw.bid) : null,
    spread_pct: percentChange(raw.ask, raw.bid),
    range_52w_position_pct: rangePosition(raw.price, raw.low_52w, raw.high_52w),
    volume_vs_30d: volumeRatio(raw.volume, raw.avg_volume_30d)
  };
}

async function loadCompany(symbol, watchItem, scorecard, marketSnapshot) {
  const dir = join(companiesDir, symbol);
  const [profile, filingsFile, financialFacts, trendSummary, managementNotes] = await Promise.all([
    readJson(join(dir, "profile.json"), {}),
    readJson(join(dir, "filings.json"), { filings: [] }),
    readJson(join(dir, "financial_facts.json"), null),
    readText(join(dir, "trend_summary.md")),
    readText(join(dir, "management_notes.md"))
  ]);

  const filings = (filingsFile.filings || []).map((filing) => ({
    form: filing.form || null,
    filing_date: filing.filing_date || null,
    report_date: filing.report_date || null,
    accession_number: filing.accession_number || null,
    description: filing.description || null,
    items: filing.items || "",
    url: filing.url || null
  }));

  return {
    symbol,
    name: profile.name || watchItem.name || profile.title || symbol,
    cik: profile.cik || null,
    themes: profile.themes || watchItem.themes || [],
    sec_ticker: profile.sec_ticker || null,
    market: marketFor(marketSnapshot, symbol),
    strategy: strategyFor(scorecard, symbol),
    summaries: {
      trend_bullets: extractedTrendBullets(trendSummary),
      trend_summary_preview: compactText(trendSummary, 1400),
      management_notes_preview: compactText(managementNotes, 900)
    },
    financial_metrics: metricSnapshot(financialFacts),
    filings_count: filings.length,
    recent_filings: filings.slice(0, 12),
    filings
  };
}

async function main() {
  const [watchlist, scorecard, dbIndex, marketSnapshot] = await Promise.all([
    readJson(join(researchDir, "watchlist.json"), { companies: [] }),
    readJson(join(researchDir, "strategy", "watchlist-scorecard.json"), {}),
    readJson(join(researchDir, "db", "index.json"), {}),
    readJson(join(researchDir, "market-snapshot.json"), { symbols: {} })
  ]);

  const companies = await Promise.all(
    (watchlist.companies || []).map((item) => loadCompany(item.ticker, item, scorecard, marketSnapshot))
  );

  const filings = companies
    .flatMap((company) => company.filings.map((filing) => ({ symbol: company.symbol, company: company.name, ...filing })))
    .sort((a, b) => String(b.filing_date || "").localeCompare(String(a.filing_date || "")));

  const exportData = {
    metadata: {
      generated_at: new Date().toISOString(),
      research_generated_at: dbIndex.generated_at || null,
      market_snapshot_at: marketSnapshot.generated_at || null,
      source: "Local SEC research database plus Robinhood read-only market snapshot",
      note:
        "Public-safe research export. It summarizes local filings, trend summaries, strategy notes, and quote/fundamental snapshots; it is not streaming market data."
    },
    global_rules: scorecard.global_rules || {},
    sector_anchors: scorecard.sector_anchors || {},
    market_snapshot: {
      generated_at: marketSnapshot.generated_at || null,
      source: marketSnapshot.source || null,
      note: marketSnapshot.note || null
    },
    companies,
    filings
  };

  await mkdir(docsDataDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
