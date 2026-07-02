import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const researchDir = join(root, "research");
const companiesDir = join(researchDir, "db", "companies");
const intelligenceDir = join(researchDir, "intelligence");
const dailyDir = join(intelligenceDir, "daily");
const predictionsPath = join(intelligenceDir, "predictions.jsonl");
const factChecksPath = join(intelligenceDir, "fact-checks.jsonl");
const externalSourcesPath = join(intelligenceDir, "external-sources.jsonl");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const reportDate = args.date || new Date().toISOString().slice(0, 10);
const useLlm = args.llm !== "false" && args["no-llm"] !== true && Boolean(process.env.OPENAI_API_KEY);

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readText(path, fallback = "") {
  if (!existsSync(path)) return fallback;
  return readFile(path, "utf8");
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

function compactText(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function dateDaysAgo(days) {
  const date = new Date(`${reportDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dateDaysAhead(days) {
  const date = new Date(`${reportDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pct(now, before) {
  const current = toNumber(now);
  const prior = toNumber(before);
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function hashId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20);
}

function extractBullets(markdown, headingPattern, max = 6) {
  const lines = String(markdown || "").split("\n");
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return [];
  const bullets = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    const match = line.match(/^\s*-\s+(.+)/);
    if (match) bullets.push(match[1]);
    if (bullets.length >= max) break;
  }
  return bullets;
}

function latestFilings(filings, max = 5) {
  return [...(filings || [])]
    .sort((a, b) => String(b.filing_date || "").localeCompare(String(a.filing_date || "")))
    .slice(0, max)
    .map((filing) => ({
      date: filing.filing_date || null,
      form: filing.form || null,
      description: filing.description || null,
      items: filing.items || "",
      url: filing.url || null
    }));
}

function sourceDigest(symbol, profile, trendSummary, managementNotes, filings, externalSources, strategy, market) {
  const recentCutoff = dateDaysAgo(14);
  const recentExternal = externalSources
    .filter((source) => source.symbol === symbol || source.ticker === symbol)
    .filter((source) => !source.date || String(source.date).slice(0, 10) >= recentCutoff)
    .slice(-8)
    .map((source) => ({
      date: source.date || source.ts || null,
      source: source.source || source.publisher || null,
      title: source.title || source.headline || null,
      url: source.url || null,
      note: compactText(source.note || source.summary || source.snippet || "", 260)
    }));

  return {
    symbol,
    company: profile.name || profile.title || symbol,
    generated_at: new Date().toISOString(),
    market_snapshot: market || null,
    strategy: {
      priority: strategy.priority ?? null,
      role: strategy.role || null,
      theme: strategy.theme || null,
      bull_triggers: strategy.bull_triggers || [],
      disqualifiers: strategy.disqualifiers || []
    },
    trend_bullets: extractBullets(trendSummary, /^## Extracted Trend Snapshot/i, 8),
    recent_filings: latestFilings(filings, 6),
    management_note_excerpt: compactText(managementNotes, 900),
    external_sources: recentExternal
  };
}

function fallbackSummary(digest) {
  const trend = digest.trend_bullets.slice(0, 3);
  const filings = digest.recent_filings.slice(0, 3).map((filing) => `${filing.date || "n/a"} ${filing.form || ""}`.trim());
  const priceMove = pct(digest.market_snapshot?.price, digest.market_snapshot?.previous_close);
  const moveText = priceMove === null ? "no current price move in the snapshot" : `${priceMove.toFixed(2)}% vs previous close`;
  const hasPositiveTrend = /up|\+|growth|record|accelerat|strong|demand|cash flow/i.test(trend.join(" "));
  const hasRiskTrend = /loss|decline|risk|inventory|capex|cash burn|margin|debt/i.test(trend.join(" "));

  let direction = "neutral";
  let confidence = 0.42;
  let range = [-3, 3];
  if (hasPositiveTrend && !hasRiskTrend) {
    direction = "bullish";
    confidence = 0.58;
    range = [-2, 5];
  } else if (hasPositiveTrend && hasRiskTrend) {
    direction = "mixed";
    confidence = 0.48;
    range = [-4, 5];
  } else if (hasRiskTrend) {
    direction = "bearish";
    confidence = 0.52;
    range = [-5, 2];
  }

  return {
    ai_summary:
      `${digest.symbol}: ${digest.strategy.theme || "watchlist context"}; ${trend[0] || "limited fresh extracted trend data"}. Latest source mix includes ${filings.join(", ") || "no recent filing rows"} and ${digest.external_sources.length} logged external source(s).`,
    stock_impact:
      `Current snapshot shows ${moveText}. The setup impact depends on whether fresh catalyst quality aligns with volume, spread, and VWAP behavior; this is not a stand-alone trade signal.`,
    prediction: {
      horizon_days: 5,
      direction,
      confidence,
      expected_move_pct_range: range,
      price_reference: digest.market_snapshot?.price ?? null,
      price_reference_as_of: digest.market_snapshot?.as_of || null,
      review_after: dateDaysAhead(5),
      rationale: [
        ...trend.slice(0, 2),
        digest.strategy.theme ? `Strategy theme: ${digest.strategy.theme}` : null,
        digest.external_sources.length ? "External source notes present in the source log." : null
      ].filter(Boolean),
      invalidation: digest.strategy.disqualifiers?.[0] || "Fails to confirm with clean price action and risk/reward."
    },
    model: "deterministic-fallback",
    caveat:
      "Generated without OPENAI_API_KEY in this environment. Daily automation should use LLM mode when credentials are present."
  };
}

async function llmSummary(digest) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const input = `
You are producing a public-safe daily research intelligence note for an intraday trading dashboard.
Do not give guaranteed returns. Do not use personalized financial advice language.
Summarize what the source digest means for the company, likely stock impact, and a falsifiable prediction to review later.
Return only compact JSON with keys: ai_summary, stock_impact, prediction, caveat.
prediction must include: horizon_days, direction, confidence from 0 to 1, expected_move_pct_range, price_reference, price_reference_as_of, review_after, rationale, invalidation.
Use a 5 trading-day horizon unless the source digest clearly suggests otherwise.

SOURCE DIGEST:
${JSON.stringify(digest, null, 2)}
`.trim();

  const response = await client.responses.create({
    model: process.env.RESEARCH_INTELLIGENCE_MODEL || "gpt-5.5",
    input
  });

  try {
    const parsed = JSON.parse(response.output_text);
    return { ...parsed, model: process.env.RESEARCH_INTELLIGENCE_MODEL || "gpt-5.5" };
  } catch {
    return {
      ...fallbackSummary(digest),
      model: process.env.RESEARCH_INTELLIGENCE_MODEL || "gpt-5.5",
      caveat: `LLM returned non-JSON; fallback used. Raw model text: ${compactText(response.output_text, 500)}`
    };
  }
}

function predictionRecord(date, digest, assessment) {
  const prediction = assessment.prediction || {};
  const id = hashId([date, digest.symbol, prediction.horizon_days, prediction.direction, prediction.price_reference]);
  const rawConfidence = toNumber(prediction.confidence);
  return {
    id,
    created_at: new Date().toISOString(),
    date,
    symbol: digest.symbol,
    company: digest.company,
    model: assessment.model,
    source_count: digest.recent_filings.length + digest.external_sources.length,
    ai_summary: assessment.ai_summary,
    stock_impact: assessment.stock_impact,
    caveat: assessment.caveat || null,
    horizon_days: prediction.horizon_days ?? 5,
    direction: prediction.direction || "neutral",
    confidence: rawConfidence === null ? null : rawConfidence > 1 ? rawConfidence / 100 : rawConfidence,
    expected_move_pct_range: prediction.expected_move_pct_range || null,
    price_reference: toNumber(prediction.price_reference),
    price_reference_as_of: prediction.price_reference_as_of || digest.market_snapshot?.as_of || null,
    review_after: prediction.review_after || dateDaysAhead(prediction.horizon_days ?? 5),
    rationale: prediction.rationale || [],
    invalidation: prediction.invalidation || null
  };
}

function outcomeForPrediction(prediction, actualMovePct) {
  if (actualMovePct === null) return "unknown";
  const direction = String(prediction.direction || "").toLowerCase();
  if (direction.includes("bull")) return actualMovePct > 1 ? "hit" : actualMovePct < -1 ? "miss" : "flat";
  if (direction.includes("bear")) return actualMovePct < -1 ? "hit" : actualMovePct > 1 ? "miss" : "flat";
  if (direction.includes("mixed")) return Math.abs(actualMovePct) > 1 ? "partial" : "flat";
  return Math.abs(actualMovePct) <= 1 ? "hit" : "miss";
}

async function factCheckDuePredictions(marketSnapshot) {
  const [predictions, existingChecks] = await Promise.all([readJsonl(predictionsPath), readJsonl(factChecksPath)]);
  const checkedIds = new Set(existingChecks.map((check) => check.prediction_id));
  const due = predictions.filter((prediction) => prediction.review_after <= reportDate && !checkedIds.has(prediction.id));
  const checks = [];

  for (const prediction of due) {
    const market = marketSnapshot?.symbols?.[prediction.symbol] || null;
    const currentPrice = toNumber(market?.price);
    const actualMovePct = pct(currentPrice, prediction.price_reference);
    const check = {
      id: randomUUID(),
      prediction_id: prediction.id,
      checked_at: new Date().toISOString(),
      check_date: reportDate,
      symbol: prediction.symbol,
      prediction_date: prediction.date,
      predicted_direction: prediction.direction,
      confidence: prediction.confidence,
      price_reference: prediction.price_reference,
      current_price: currentPrice,
      current_price_as_of: market?.as_of || null,
      actual_move_pct: actualMovePct,
      outcome: outcomeForPrediction(prediction, actualMovePct),
      lesson:
        actualMovePct === null
          ? "No current price snapshot was available, so this prediction needs later review."
          : "Outcome is scored mechanically against the prediction direction; qualitative catalyst review can refine this later."
    };
    checks.push(check);
  }

  if (checks.length) {
    await appendFile(factChecksPath, `${checks.map((check) => JSON.stringify(check)).join("\n")}\n`);
  }
  return checks;
}

async function main() {
  await mkdir(dailyDir, { recursive: true });
  const [watchlist, scorecard, marketSnapshot, externalSources] = await Promise.all([
    readJson(join(researchDir, "watchlist.json"), { companies: [] }),
    readJson(join(researchDir, "strategy", "watchlist-scorecard.json"), { symbols: {} }),
    readJson(join(researchDir, "market-snapshot.json"), { symbols: {} }),
    readJsonl(externalSourcesPath)
  ]);

  const companies = [];
  for (const item of watchlist.companies || []) {
    const symbol = item.ticker;
    const dir = join(companiesDir, symbol);
    const [profile, filingsFile, trendSummary, managementNotes] = await Promise.all([
      readJson(join(dir, "profile.json"), { name: item.name || symbol }),
      readJson(join(dir, "filings.json"), { filings: [] }),
      readText(join(dir, "trend_summary.md")),
      readText(join(dir, "management_notes.md"))
    ]);
    const digest = sourceDigest(
      symbol,
      profile,
      trendSummary,
      managementNotes,
      filingsFile.filings || [],
      externalSources,
      scorecard.symbols?.[symbol] || {},
      marketSnapshot.symbols?.[symbol] || null
    );
    const assessment = useLlm ? await llmSummary(digest) : fallbackSummary(digest);
    const prediction = predictionRecord(reportDate, digest, assessment);
    companies.push({ ...digest, assessment, prediction });
  }

  const existingPredictions = await readJsonl(predictionsPath);
  const existingIds = new Set(existingPredictions.map((prediction) => prediction.id));
  const newPredictions = companies.map((company) => company.prediction).filter((prediction) => !existingIds.has(prediction.id));
  if (newPredictions.length) {
    await appendFile(predictionsPath, `${newPredictions.map((prediction) => JSON.stringify(prediction)).join("\n")}\n`);
  }

  const newFactChecks = await factCheckDuePredictions(marketSnapshot);
  const allFactChecks = await readJsonl(factChecksPath);
  const daily = {
    date: reportDate,
    generated_at: new Date().toISOString(),
    mode: useLlm ? "llm" : "deterministic-fallback",
    source_note:
      "Public-safe daily intelligence. External third-party sources are summarized from metadata/short notes only; no full paywalled articles or transcripts are copied.",
    companies,
    new_predictions: newPredictions,
    new_fact_checks: newFactChecks,
    scorecard: {
      total_checked: allFactChecks.length,
      hits: allFactChecks.filter((check) => check.outcome === "hit").length,
      misses: allFactChecks.filter((check) => check.outcome === "miss").length,
      partials: allFactChecks.filter((check) => check.outcome === "partial" || check.outcome === "flat").length
    }
  };

  const outputPath = join(dailyDir, `${reportDate}.json`);
  await writeFile(outputPath, `${JSON.stringify(daily, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Predictions added: ${newPredictions.length}; fact checks added: ${newFactChecks.length}; mode: ${daily.mode}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
