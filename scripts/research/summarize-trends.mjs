import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dbRoot = join(root, "research", "db");

const metricLabels = {
  revenue: "Revenue",
  gross_profit: "Gross profit",
  operating_income: "Operating income",
  net_income: "Net income",
  diluted_eps: "Diluted EPS",
  rd_expense: "R&D expense",
  sga_expense: "SG&A expense",
  capex: "Capital expenditures",
  operating_cash_flow: "Operating cash flow",
  cash: "Cash",
  inventory: "Inventory",
  total_assets: "Total assets",
  total_liabilities: "Total liabilities",
  equity: "Equity"
};

const durationMetrics = new Set([
  "revenue",
  "gross_profit",
  "cost_of_revenue",
  "operating_income",
  "net_income",
  "diluted_eps",
  "rd_expense",
  "sga_expense",
  "capex",
  "operating_cash_flow"
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

async function writeIfMissing(path, value) {
  try {
    await access(path);
  } catch {
    await writeText(path, value);
  }
}

function formatValue(value, unit) {
  if (value === null || value === undefined) return "n/a";
  if (unit === "USD/shares") return `$${Number(value).toFixed(2)}`;
  if (unit === "shares") return Number(value).toLocaleString("en-US");
  const abs = Math.abs(Number(value));
  if (abs >= 1_000_000_000) return `$${(Number(value) / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(Number(value) / 1_000_000).toFixed(1)}M`;
  return `$${Number(value).toLocaleString("en-US")}`;
}

function pctChange(current, prior) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function durationDays(fact) {
  if (!fact.start || !fact.end) return null;
  const start = new Date(`${fact.start}T00:00:00Z`);
  const end = new Date(`${fact.end}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function factScore(fact, metric) {
  let score = 0;
  if (fact.frame) score += 4;
  if (String(fact.form) === "10-K") score += 1;
  if (String(fact.form) === "10-Q") score += 1;
  if (String(fact.form) === "20-F") score += 1;
  if (String(fact.form) === "6-K") score += 1;

  if (durationMetrics.has(metric) && fact.fp !== "FY") {
    const days = durationDays(fact);
    if (days !== null && days <= 120) score += 8;
    if (days !== null && days > 120) score -= 4;
  }

  if (!durationMetrics.has(metric) && !fact.start) score += 4;
  return score;
}

function betterFact(current, candidate, metric) {
  if (!current) return candidate;
  const scoreDelta = factScore(candidate, metric) - factScore(current, metric);
  if (scoreDelta !== 0) return scoreDelta > 0 ? candidate : current;
  return String(candidate.filed) > String(current.filed) ? candidate : current;
}

function dedupePeriodFacts(facts, metric) {
  const byKey = new Map();
  for (const fact of facts || []) {
    const key = `${fact.fy}-${fact.fp}-${fact.end}`;
    byKey.set(key, betterFact(byKey.get(key), fact, metric));
  }
  return [...byKey.values()].sort((a, b) => String(a.end).localeCompare(String(b.end)));
}

function latestFacts(metrics, metric, count = 8) {
  const deduped = dedupePeriodFacts(metrics[metric]?.facts || [], metric);
  return deduped.slice(-count);
}

function periodLabel(fact) {
  return `${fact.fy} ${fact.fp}${fact.frame ? ` (${fact.frame})` : ""}`;
}

function priorComparableFact(series, latest) {
  const sameQuarterLastYear = series.find(
    (fact) => fact.fy === latest.fy - 1 && fact.fp === latest.fp
  );
  if (sameQuarterLastYear) return sameQuarterLastYear;
  return series.length > 1 ? series.at(-2) : null;
}

function lineForMetric(metrics, metric) {
  const series = latestFacts(metrics, metric, 8);
  const latest = series.at(-1);
  if (!latest) return `- ${metricLabels[metric]}: not available in extracted SEC facts.`;

  const prior = priorComparableFact(series, latest);
  const change = prior && prior !== latest ? pctChange(Number(latest.value), Number(prior.value)) : null;
  const changeText = change === null ? "" : `, ${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs ${periodLabel(prior)}`;
  return `- ${metricLabels[metric]}: ${formatValue(latest.value, metrics[metric].unit)} in ${periodLabel(latest)}${changeText}.`;
}

function filingBullets(filings) {
  const recent = filings
    .filter((filing) => ["10-K", "10-Q", "8-K", "20-F", "6-K"].includes(filing.form))
    .slice(0, 10);
  if (!recent.length) return "- No recent filings extracted.";
  return recent
    .map((filing) => `- ${filing.filing_date}: ${filing.form}${filing.description ? `, ${filing.description}` : ""} (${filing.url})`)
    .join("\n");
}

function buildSummary(profile, filings, facts, earningsSources) {
  const metrics = facts.metrics || {};
  const keyMetrics = [
    "revenue",
    "gross_profit",
    "operating_income",
    "net_income",
    "diluted_eps",
    "operating_cash_flow",
    "capex",
    "cash",
    "inventory"
  ];

  const earningsCandidates =
    earningsSources.sec_earnings_release_candidates ||
    earningsSources.sec_8k_earnings_release_candidates ||
    [];

  return `# ${profile.ticker} Research Summary

Generated: ${new Date().toISOString()}

Company: ${profile.title || profile.name}
Themes: ${(profile.themes || []).join(", ")}

## Extracted Trend Snapshot

${keyMetrics.map((metric) => lineForMetric(metrics, metric)).join("\n")}

## Recent Filing Feed

${filingBullets(filings.filings || [])}

## Earnings Call / Release Coverage

- SEC earnings-release candidates found: ${earningsCandidates.length}.
- Transcript text is not copied into this database. Add source links and short original notes only.
- Next useful manual pass: read the last 8-12 quarterly earnings releases/call transcripts and add a concise note for management tone, guide changes, demand drivers, margin commentary, capex, inventory, export-control exposure, and space/aerospace supply-chain relevance where applicable.

## Decision Notes To Maintain

- Bull thesis changes:
- Bear thesis changes:
- What management keeps repeating:
- What management stopped saying:
- Metrics to watch next quarter:
- Intraday trading relevance:
`;
}

async function main() {
  const companiesDir = join(dbRoot, "companies");
  const tickers = await readdir(companiesDir);
  const summaries = [];

  for (const ticker of tickers.sort()) {
    const dir = join(companiesDir, ticker);
    const profile = await readJson(join(dir, "profile.json"));
    if (profile.skip_sec_operating_company_ingest || profile.note?.includes("Skipped")) continue;

    const [filings, facts, earningsSources] = await Promise.all([
      readJson(join(dir, "filings.json")),
      readJson(join(dir, "financial_facts.json")),
      readJson(join(dir, "earnings_sources.json"))
    ]);

    const summary = buildSummary(profile, filings, facts, earningsSources);
    await writeText(join(dir, "trend_summary.md"), summary);
    await writeIfMissing(
      join(dir, "management_notes.md"),
      `# ${profile.ticker} Management Notes

Purpose: accumulate original short notes from earnings calls, earnings releases, investor presentations, and material company updates. Do not paste full transcripts or long copyrighted passages.

## Call-By-Call Notes

| Date | Period | Source | Demand | Margins | Guidance | Risks | Trading Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |

## What Management Keeps Repeating

- 

## What Management Stopped Saying

- 

## Thesis Change Log

- 
`
    );
    summaries.push(`- [${ticker}](companies/${ticker}/trend_summary.md)`);
  }

  await writeText(
    join(dbRoot, "README.md"),
    `# Research Database

Generated: ${new Date().toISOString()}

This database is built from SEC company facts, recent SEC filing metadata, and manually maintainable earnings-source notes. It is intended as slow research memory for the Robinhood semiconductor, AI-hardware, storage, and space-supply-chain trade monitor.

## Company Summaries

${summaries.join("\n")}

## Use In Trading Monitor

Before raising a trade alert, prefer candidates where fresh news and live price action line up with the longer-term trend summary. Do not use this database as a guarantee; it is background context.
`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
