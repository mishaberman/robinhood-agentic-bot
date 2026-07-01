import { createClient } from "@libsql/client";

export function requireTursoEnv() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required. Store them as environment secrets, not in source files."
    );
  }

  return { url, authToken };
}

export function createTursoClient() {
  return createClient(requireTursoEnv());
}

export async function applyTursoSchema(client) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS companies (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      title TEXT,
      cik INTEGER,
      profile_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sec_filings (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      form TEXT,
      filing_date TEXT,
      report_date TEXT,
      accession_number TEXT,
      description TEXT,
      items TEXT,
      url TEXT,
      full_text_path TEXT,
      raw_html_path TEXT,
      text_bytes INTEGER,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS research_documents (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      path TEXT,
      url TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      doc_id UNINDEXED,
      ticker,
      kind,
      title,
      body,
      path UNINDEXED,
      url UNINDEXED,
      tokenize = 'porter'
    )`,
    `CREATE TABLE IF NOT EXISTS monitor_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      model TEXT,
      prompt TEXT,
      output_text TEXT,
      error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      ticker TEXT,
      score INTEGER,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      dedupe_key TEXT UNIQUE,
      source_run_id TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT,
      source TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS daily_reports (
      report_date TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      timezone TEXT NOT NULL,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      stats_json TEXT NOT NULL
    )`
  ];

  for (const sql of statements) {
    await client.execute(sql);
  }
}

export async function clearResearchTables(client) {
  for (const sql of [
    "DELETE FROM documents_fts",
    "DELETE FROM research_documents",
    "DELETE FROM sec_filings",
    "DELETE FROM companies"
  ]) {
    await client.execute(sql);
  }
}

export async function executeInBatches(client, statements, batchSize = 25) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await client.batch(statements.slice(index, index + batchSize), "write");
  }
}

export async function logActivity(client, { id, createdAt, category, action, summary, details, source }) {
  await client.execute({
    sql: `INSERT INTO activity_log (id, created_at, category, action, summary, details_json, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      createdAt || new Date().toISOString(),
      category,
      action,
      summary,
      details ? JSON.stringify(details) : null,
      source || null
    ]
  });
}
