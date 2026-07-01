import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../src/config.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const docsDir = join(root, "docs");
const dataDir = join(docsDir, "data");
const logsDir = join(docsDir, "logs");
const reportDir = join(docsDir, "reports", "daily");
const localLogsDir = join(root, "logs");
const localReportsDir = join(root, "reports", "daily");
const ACTIVE_RISK_RULES = {
  min_trade_review_score: 80,
  default_notional_usd: [250, 500],
  max_daily_loss_usd: 60,
  max_position_notional_usd: 500,
  max_trades_per_day: 3,
  no_averaging_down: true
};

function redactText(value) {
  return String(value || "")
    .replace(/\b(account_number|rhs_account_number)\s*["':=]+\s*["']?([A-Z0-9-]{5,})/gi, "$1: [redacted]")
    .replace(/\b(?:gho|ghp|github_pat|robinhood|turso)_[A-Za-z0-9_:-]{12,}\b/gi, "[redacted-token]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-token]")
    .replace(/\b\d{8,12}\b/g, (match) => `....${match.slice(-4)}`);
}

function compactText(value, max = 560) {
  const text = redactText(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function dateKeyFromIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function decisionFromText(value) {
  const text = String(value || "");
  if (/\bEXIT REVIEW\b/i.test(text)) return "EXIT REVIEW";
  if (/\bTRADE REVIEW\b/i.test(text)) return "TRADE REVIEW";
  if (/\bNO TRADE ALERT\b/i.test(text)) return "NO TRADE ALERT";
  if (/\bNO TRADE\b/i.test(text)) return "NO TRADE ALERT";
  return "STATUS";
}

function statusForDecision(decision) {
  if (decision === "TRADE REVIEW" || decision === "EXIT REVIEW") return "notify";
  if (decision === "NO TRADE ALERT") return "quiet";
  return "info";
}

function scoreFromText(value) {
  const match = String(value || "").match(/\bscore\s*[:=-]\s*(\d{1,3})\b/i);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function tickerFromText(value) {
  const text = String(value || "");
  const labeled = text.match(/\b(?:symbol|ticker)\s*[:=-]\s*\$?([A-Z][A-Z0-9.-]{0,8})\b/i);
  if (labeled) return labeled[1].toUpperCase();
  const headed = text.match(/\b(?:TRADE REVIEW|EXIT REVIEW)\b\s*[:=-]?\s*\$?([A-Z][A-Z0-9.-]{0,8})\b/i);
  return headed ? headed[1].toUpperCase() : null;
}

function defaultStages(decision, status = "done") {
  const decisionSummary =
    decision === "TRADE REVIEW" || decision === "EXIT REVIEW"
      ? "Alert surfaced for user decision."
      : decision === "NO TRADE ALERT"
        ? "No setup met the score and risk gate."
        : "Run state recorded.";

  return [
    { name: "Account gate", status, summary: "Use only Agentic with agentic_allowed=true." },
    { name: "Portfolio", status, summary: "Cash, positions, orders, and realized P/L." },
    { name: "Market tape", status, summary: "Quotes, spreads, volume, and sector anchors." },
    { name: "Catalysts", status, summary: "News, filings, and local research context." },
    { name: "Scoring", status, summary: "100-point framework and disqualifiers." },
    { name: "Decision", status, summary: decisionSummary }
  ];
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

async function listFiles(dir, predicate = () => true) {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names.filter(predicate).sort();
}

async function loadLocalDecisionRuns() {
  const records = await readJsonl(join(localLogsDir, "monitor-decisions.jsonl"));
  return records.map((record) => {
    const decision = record.kind || record.decision || decisionFromText(record.message);
    return {
      id: record.id,
      started_at: record.ts,
      finished_at: record.ts,
      date: dateKeyFromIso(record.ts),
      status: "ok",
      source: record.source || "local",
      decision,
      severity: statusForDecision(decision),
      ticker: record.ticker || null,
      score: record.score ?? null,
      message: compactText(record.message, 900),
      output_text: compactText(record.message, 2600),
      account: record.account || {},
      risk: record.risk || {},
      stages: record.stages?.length ? record.stages : defaultStages(decision),
      links: record.links || []
    };
  });
}

async function loadGenericAuditLogs() {
  const files = await listFiles(localLogsDir, (name) => name.endsWith(".jsonl") && name !== "monitor-decisions.jsonl");
  const rows = [];
  for (const file of files) {
    const records = await readJsonl(join(localLogsDir, file));
    for (const record of records) {
      rows.push({
        file,
        ts: record.ts || record.created_at || null,
        event: record.event || record.action || "event",
        summary: compactText(record.payload?.summary || record.summary || record.event || record.action || "Log event", 420)
      });
    }
  }
  return rows.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))).slice(0, 60);
}

async function loadReports() {
  const files = await listFiles(localReportsDir, (name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name));
  await mkdir(reportDir, { recursive: true });
  const existing = await listFiles(reportDir, (name) => name.endsWith(".md"));
  await Promise.all(existing.filter((name) => !files.includes(name)).map((name) => unlink(join(reportDir, name))));

  const reports = [];
  for (const file of files) {
    const sourcePath = join(localReportsDir, file);
    const body = redactText(await readFile(sourcePath, "utf8"));
    const targetPath = join(reportDir, file);
    await writeFile(targetPath, body);
    const date = file.replace(/\.md$/i, "");
    const heading = body.match(/^#\s+(.+)$/m)?.[1] || `Daily Report ${date}`;
    reports.push({
      date,
      title: heading,
      href: `./reports/daily/${file}`,
      preview: compactText(body.replace(/^#.+$/m, ""), 460)
    });
  }

  return reports.sort((a, b) => b.date.localeCompare(a.date));
}

async function loadTursoRows() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return { available: false, runs: [], alerts: [], activity: [], reports: [] };
  }

  const { applyTursoSchema, createTursoClient } = await import("../cloud/turso-common.mjs");
  const client = createTursoClient();
  try {
    await applyTursoSchema(client);
    const [runs, alerts, activity, reports] = await Promise.all([
      client.execute(
        "SELECT id, started_at, finished_at, status, model, output_text, error FROM monitor_runs ORDER BY started_at DESC LIMIT 120"
      ),
      client.execute(
        "SELECT id, created_at, kind, ticker, score, title, body, status, source_run_id FROM alerts ORDER BY created_at DESC LIMIT 80"
      ),
      client.execute(
        "SELECT id, created_at, category, action, summary, details_json, source FROM activity_log ORDER BY created_at DESC LIMIT 120"
      ),
      client.execute(
        "SELECT report_date, generated_at, title, markdown, stats_json FROM daily_reports ORDER BY report_date DESC LIMIT 30"
      )
    ]);

    return {
      available: true,
      runs: runs.rows,
      alerts: alerts.rows,
      activity: activity.rows,
      reports: reports.rows
    };
  } finally {
    client.close();
  }
}

function normalizeTursoRuns(rows) {
  return rows.map((row) => {
    const output = row.output_text || row.error || "";
    const decision = row.status === "error" ? "ERROR" : decisionFromText(output);
    return {
      id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      date: dateKeyFromIso(row.started_at),
      status: row.status,
      source: "turso",
      model: row.model,
      decision,
      severity: row.status === "error" ? "error" : statusForDecision(decision),
      ticker: tickerFromText(output),
      score: scoreFromText(output),
      message: row.status === "error" ? compactText(row.error, 900) : compactText(output, 900),
      output_text: compactText(output, 3200),
      stages: defaultStages(decision, row.status === "error" ? "blocked" : "done"),
      links: []
    };
  });
}

function normalizeAlerts(rows) {
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    kind: row.kind,
    ticker: row.ticker,
    score: row.score,
    title: redactText(row.title),
    body: compactText(row.body, 1800),
    status: row.status,
    source_run_id: row.source_run_id
  }));
}

function normalizeActivity(rows) {
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    category: row.category,
    action: row.action,
    summary: compactText(row.summary, 520),
    source: row.source
  }));
}

async function writeSanitizedLogs(localRuns, genericLogs) {
  await mkdir(logsDir, { recursive: true });
  const decisionLog = localRuns
    .map((run) =>
      JSON.stringify({
        id: run.id,
        ts: run.started_at,
        decision: run.decision,
        ticker: run.ticker,
        score: run.score,
        message: run.message
      })
    )
    .join("\n");
  await writeFile(join(logsDir, "monitor-decisions.jsonl"), `${decisionLog}${decisionLog ? "\n" : ""}`);
  await writeFile(
    join(logsDir, "index.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        note: "Public-safe log export. Raw private logs stay in the local logs directory and are not published.",
        files: [{ name: "monitor-decisions.jsonl", href: "./monitor-decisions.jsonl" }],
        local_audit_preview: genericLogs
      },
      null,
      2
    )}\n`
  );
}

function aggregateStats(runs, alerts) {
  const decisionCounts = {};
  const tickerCounts = {};
  for (const run of runs) {
    decisionCounts[run.decision] = (decisionCounts[run.decision] || 0) + 1;
    if (run.ticker) tickerCounts[run.ticker] = (tickerCounts[run.ticker] || 0) + 1;
  }
  for (const alert of alerts) {
    if (alert.ticker) tickerCounts[alert.ticker] = (tickerCounts[alert.ticker] || 0) + 1;
  }

  return {
    total_runs: runs.length,
    alerts: alerts.length,
    trade_reviews: alerts.filter((alert) => alert.kind === "TRADE REVIEW").length,
    exit_reviews: alerts.filter((alert) => alert.kind === "EXIT REVIEW").length,
    no_trade_runs: runs.filter((run) => run.decision === "NO TRADE ALERT").length,
    errors: runs.filter((run) => run.status === "error").length,
    decision_counts: decisionCounts,
    ticker_counts: tickerCounts
  };
}

function watchlistBoard(runs, alerts) {
  const latestByTicker = new Map();
  for (const item of [...alerts, ...runs]) {
    if (!item.ticker) continue;
    const current = latestByTicker.get(item.ticker);
    const ts = item.created_at || item.started_at;
    if (!current || String(ts || "") > String(current.ts || "")) {
      latestByTicker.set(item.ticker, {
        ts,
        decision: item.kind || item.decision,
        score: item.score ?? null,
        message: compactText(item.title || item.message || item.body || "", 240)
      });
    }
  }

  return config.watchlist.map((symbol, index) => ({
    symbol,
    priority: index + 1,
    state: latestByTicker.get(symbol) || null
  }));
}

async function gitRemoteUrl() {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: root });
    return stdout.trim().replace(/\.git$/, "").replace(/^git@github.com:/, "https://github.com/");
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const [localRuns, genericLogs, localReports, turso, repositoryUrl] = await Promise.all([
    loadLocalDecisionRuns(),
    loadGenericAuditLogs(),
    loadReports(),
    loadTursoRows(),
    gitRemoteUrl()
  ]);

  const tursoRuns = normalizeTursoRuns(turso.runs);
  const tursoAlerts = normalizeAlerts(turso.alerts);
  const tursoActivity = normalizeActivity(turso.activity);

  const runs = [...tursoRuns, ...localRuns]
    .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")))
    .slice(0, 140);
  const alerts = tursoAlerts.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const stats = aggregateStats(runs, alerts);
  const latestRun = runs[0] || null;

  await writeSanitizedLogs(localRuns, genericLogs);

  const dashboard = {
    metadata: {
      generated_at: new Date().toISOString(),
      timezone: process.env.REPORT_TIME_ZONE || "America/Los_Angeles",
      repository_url: repositoryUrl,
      source_mode: turso.available ? "turso+local" : "local",
      data_note:
        "Public-safe dashboard export. Account numbers, tokens, and long numeric identifiers are redacted before publishing."
    },
    risk_rules: ACTIVE_RISK_RULES,
    latest: latestRun,
    stats,
    watchlist: watchlistBoard(runs, alerts),
    runs,
    alerts,
    activity: tursoActivity,
    reports: localReports,
    links: {
      data_json: "./data/dashboard.json",
      sanitized_decision_log: "./logs/monitor-decisions.jsonl",
      sanitized_log_index: "./logs/index.json",
      reports_dir: "./reports/daily/",
      repository: repositoryUrl
    }
  };

  await writeFile(join(dataDir, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`);
  console.log(`Wrote ${join(dataDir, "dashboard.json")}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
