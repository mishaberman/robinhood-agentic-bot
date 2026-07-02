import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const intelligenceDir = join(root, "research", "intelligence");
const dailyDir = join(intelligenceDir, "daily");
const docsDataDir = join(root, "docs", "data");
const outputPath = join(docsDataDir, "intelligence.json");

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

async function listDailyFiles() {
  if (!existsSync(dailyDir)) return [];
  return (await readdir(dailyDir))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();
}

function compactCompany(company) {
  return {
    symbol: company.symbol,
    company: company.company,
    source_counts: {
      recent_filings: company.recent_filings?.length || 0,
      external_sources: company.external_sources?.length || 0
    },
    recent_sources: [
      ...(company.external_sources || []).slice(0, 4).map((source) => ({
        type: "external",
        date: source.date,
        source: source.source,
        title: source.title,
        url: source.url,
        note: source.note
      })),
      ...(company.recent_filings || []).slice(0, 4).map((filing) => ({
        type: "sec",
        date: filing.date,
        source: "SEC",
        title: [filing.form, filing.description].filter(Boolean).join(" - "),
        url: filing.url,
        note: filing.items ? `Items ${filing.items}` : ""
      }))
    ],
    ai_summary: company.assessment?.ai_summary || "",
    stock_impact: company.assessment?.stock_impact || "",
    caveat: company.assessment?.caveat || null,
    prediction: company.prediction || null
  };
}

function aggregateChecks(checks) {
  const total = checks.length;
  const hits = checks.filter((check) => check.outcome === "hit").length;
  const misses = checks.filter((check) => check.outcome === "miss").length;
  const partials = checks.filter((check) => ["partial", "flat"].includes(check.outcome)).length;
  return {
    total,
    hits,
    misses,
    partials,
    hit_rate: total ? hits / total : null
  };
}

async function main() {
  const dailyFiles = await listDailyFiles();
  const dailyReports = [];
  for (const file of dailyFiles.slice(0, 20)) {
    const report = await readJson(join(dailyDir, file), null);
    if (report) dailyReports.push(report);
  }

  const [predictions, factChecks] = await Promise.all([
    readJsonl(join(intelligenceDir, "predictions.jsonl")),
    readJsonl(join(intelligenceDir, "fact-checks.jsonl"))
  ]);

  const latest = dailyReports[0] || null;
  const exportData = {
    metadata: {
      generated_at: new Date().toISOString(),
      source: "Local daily research intelligence ledger",
      note:
        "Public-safe AI/research summary export. Predictions are hypotheses for later review, not guarantees or personalized financial advice."
    },
    latest: latest
      ? {
          date: latest.date,
          generated_at: latest.generated_at,
          mode: latest.mode,
          source_note: latest.source_note,
          scorecard: latest.scorecard,
          companies: (latest.companies || []).map(compactCompany)
        }
      : null,
    history: dailyReports.map((report) => ({
      date: report.date,
      generated_at: report.generated_at,
      mode: report.mode,
      company_count: report.companies?.length || 0,
      new_predictions: report.new_predictions?.length || 0,
      new_fact_checks: report.new_fact_checks?.length || 0
    })),
    predictions: predictions
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 120),
    fact_checks: factChecks
      .sort((a, b) => String(b.checked_at || "").localeCompare(String(a.checked_at || "")))
      .slice(0, 120),
    scorecard: aggregateChecks(factChecks)
  };

  await mkdir(docsDataDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
