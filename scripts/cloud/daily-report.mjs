import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTursoSchema, createTursoClient, logActivity } from "./turso-common.mjs";
import { randomUUID } from "node:crypto";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const timeZone = process.env.REPORT_TIME_ZONE || "America/Los_Angeles";

function datePartsInZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day
  };
}

function localDateKey(date = new Date(), zone = timeZone) {
  const parts = datePartsInZone(date, zone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function zonedMidnightToUtc(dateKey, zone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcMs = targetUtc;

  for (let i = 0; i < 3; i += 1) {
    const offset = offsetMsForZone(new Date(utcMs), zone);
    utcMs = targetUtc - offset;
  }

  return new Date(utcMs);
}

function offsetMsForZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function formatLocalTime(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

function compactText(value, max = 420) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text || "n/a";
  return `${text.slice(0, max - 1)}...`;
}

function fenced(value) {
  return `\`\`\`text\n${String(value || "").replaceAll("```", "` ` `").trim() || "n/a"}\n\`\`\``;
}

function detailsBlock(summary, body) {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

async function queryDay(client, table, timeColumn, startIso, endIso, orderColumn = timeColumn) {
  const result = await client.execute({
    sql: `SELECT * FROM ${table} WHERE ${timeColumn} >= ? AND ${timeColumn} < ? ORDER BY ${orderColumn}`,
    args: [startIso, endIso]
  });
  return result.rows;
}

function statsFor({ runs, alerts, activities }) {
  return {
    monitor_runs: runs.length,
    monitor_errors: runs.filter((run) => run.status === "error").length,
    alerts: alerts.length,
    trade_reviews: alerts.filter((alert) => alert.kind === "TRADE REVIEW").length,
    exit_reviews: alerts.filter((alert) => alert.kind === "EXIT REVIEW").length,
    no_trade_runs: activities.filter((activity) => activity.action === "no_trade_alert").length,
    activity_items: activities.length
  };
}

function alertSection(alerts) {
  if (!alerts.length) return "No `TRADE REVIEW` or `EXIT REVIEW` alerts were created.";

  return alerts
    .map((alert) => {
      const heading = `### ${formatLocalTime(alert.created_at)} - ${alert.kind}${alert.ticker ? ` ${alert.ticker}` : ""}`;
      const meta = [
        `- Score: ${alert.score ?? "n/a"}`,
        `- Title: ${alert.title}`,
        `- Alert ID: ${alert.id}`,
        `- Source run: ${alert.source_run_id || "n/a"}`
      ].join("\n");
      return `${heading}\n\n${meta}\n\n${detailsBlock("Full alert text", fenced(alert.body))}`;
    })
    .join("\n\n");
}

function activitySection(activities) {
  if (!activities.length) return "No activity-log rows were recorded.";

  return activities
    .map((activity) => {
      const details = activity.details_json ? `\n  Details: \`${activity.details_json}\`` : "";
      return `- ${formatLocalTime(activity.created_at)} [${activity.category}/${activity.action}] ${activity.summary}${details}`;
    })
    .join("\n");
}

function runSection(runs) {
  if (!runs.length) return "No monitor runs were recorded.";

  return runs
    .map((run) => {
      const heading = `${formatLocalTime(run.started_at)} - ${run.status} - ${run.id}`;
      const meta = [
        `- Started: ${run.started_at}`,
        `- Finished: ${run.finished_at || "n/a"}`,
        `- Model: ${run.model || "n/a"}`,
        `- Error: ${run.error || "none"}`,
        `- Output preview: ${compactText(run.output_text)}`
      ].join("\n");
      return detailsBlock(heading, `${meta}\n\n${fenced(run.output_text || run.error || "")}`);
    })
    .join("\n\n");
}

function buildMarkdown({ reportDate, startIso, endIso, runs, alerts, activities, stats }) {
  const topTickers = [...new Set(alerts.map((alert) => alert.ticker).filter(Boolean))];

  return `# Robinhood Agentic Daily Log - ${reportDate}

Generated: ${new Date().toISOString()}
Timezone: ${timeZone}
Window: ${startIso} to ${endIso}

## Executive Snapshot

- Monitor runs: ${stats.monitor_runs}
- Alerts: ${stats.alerts} (${stats.trade_reviews} trade review, ${stats.exit_reviews} exit review)
- No-trade monitor runs: ${stats.no_trade_runs}
- Errors: ${stats.monitor_errors}
- Activity items: ${stats.activity_items}
- Tickers that triggered alerts: ${topTickers.length ? topTickers.join(", ") : "none"}

## What Happened

${activitySection(activities)}

## Trade / Exit Alerts

${alertSection(alerts)}

## Monitor Run Appendix

${runSection(runs)}

## Review Notes

- What worked:
- What looked wrong or too noisy:
- Missed context to add tomorrow:
- Changes to scoring/risk rules:
- Follow-up research:
`;
}

async function upsertReport(client, reportDate, markdown, stats) {
  await client.execute({
    sql: `INSERT INTO daily_reports (report_date, generated_at, timezone, title, markdown, stats_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_date) DO UPDATE SET
        generated_at = excluded.generated_at,
        timezone = excluded.timezone,
        title = excluded.title,
        markdown = excluded.markdown,
        stats_json = excluded.stats_json`,
    args: [
      reportDate,
      new Date().toISOString(),
      timeZone,
      `Robinhood Agentic Daily Log - ${reportDate}`,
      markdown,
      JSON.stringify(stats)
    ]
  });
}

async function main() {
  const reportDate = process.argv[2] || localDateKey();
  const startIso = zonedMidnightToUtc(reportDate, timeZone).toISOString();
  const endIso = zonedMidnightToUtc(addDays(reportDate, 1), timeZone).toISOString();
  const client = createTursoClient();

  try {
    await applyTursoSchema(client);
    const [runs, alerts, activities] = await Promise.all([
      queryDay(client, "monitor_runs", "started_at", startIso, endIso),
      queryDay(client, "alerts", "created_at", startIso, endIso),
      queryDay(client, "activity_log", "created_at", startIso, endIso)
    ]);

    const stats = statsFor({ runs, alerts, activities });
    const markdown = buildMarkdown({ reportDate, startIso, endIso, runs, alerts, activities, stats });
    const outputPath = join(root, "reports", "daily", `${reportDate}.md`);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${markdown}\n`);
    await upsertReport(client, reportDate, markdown, stats);
    await logActivity(client, {
      id: randomUUID(),
      category: "reporting",
      action: "daily_report_generated",
      summary: `Generated daily report for ${reportDate}.`,
      details: { report_date: reportDate, output_path: outputPath, stats },
      source: "scripts/cloud/daily-report.mjs"
    });

    console.log(`Wrote ${outputPath}`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
