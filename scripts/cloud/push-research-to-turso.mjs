import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTursoSchema,
  clearResearchTables,
  createTursoClient,
  executeInBatches,
  logActivity
} from "./turso-common.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sqlitePath = join(root, "research", "research.sqlite");

function stableId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 32);
}

async function readLocalDatabase() {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const companies = db.prepare("SELECT ticker, name, title, cik, profile_json FROM companies").all();
    const filings = db.prepare("SELECT * FROM sec_filings ORDER BY ticker, filing_date, id").all();
    const docs = db
      .prepare("SELECT rowid, ticker, kind, title, body, path, url FROM documents_fts ORDER BY ticker, kind, rowid")
      .all();
    return { companies, filings, docs };
  } finally {
    db.close();
  }
}

function insertCompanyStatements(companies, updatedAt) {
  return companies.map((company) => ({
    sql: `INSERT INTO companies (ticker, name, title, cik, profile_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        cik = excluded.cik,
        profile_json = excluded.profile_json,
        updated_at = excluded.updated_at`,
    args: [
      company.ticker,
      company.name || null,
      company.title || null,
      company.cik || null,
      company.profile_json || "{}",
      updatedAt
    ]
  }));
}

function insertFilingStatements(filings, updatedAt) {
  return filings.map((filing) => ({
    sql: `INSERT INTO sec_filings (
      id, ticker, form, filing_date, report_date, accession_number, description, items, url,
      full_text_path, raw_html_path, text_bytes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ticker = excluded.ticker,
      form = excluded.form,
      filing_date = excluded.filing_date,
      report_date = excluded.report_date,
      accession_number = excluded.accession_number,
      description = excluded.description,
      items = excluded.items,
      url = excluded.url,
      full_text_path = excluded.full_text_path,
      raw_html_path = excluded.raw_html_path,
      text_bytes = excluded.text_bytes,
      updated_at = excluded.updated_at`,
    args: [
      filing.id,
      filing.ticker,
      filing.form || null,
      filing.filing_date || null,
      filing.report_date || null,
      filing.accession_number || null,
      filing.description || null,
      filing.items || null,
      filing.url || null,
      filing.full_text_path || null,
      filing.raw_html_path || null,
      filing.text_bytes || 0,
      updatedAt
    ]
  }));
}

function insertDocumentStatements(docs, updatedAt) {
  const statements = [];

  for (const doc of docs) {
    const id = stableId([doc.ticker, doc.kind, doc.path, doc.url, doc.title, String(doc.rowid)]);
    const args = [
      id,
      doc.ticker,
      doc.kind,
      doc.title,
      doc.body || "",
      doc.path || null,
      doc.url || null,
      updatedAt
    ];

    statements.push({
      sql: `INSERT INTO research_documents (id, ticker, kind, title, body, path, url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          ticker = excluded.ticker,
          kind = excluded.kind,
          title = excluded.title,
          body = excluded.body,
          path = excluded.path,
          url = excluded.url,
          updated_at = excluded.updated_at`,
      args
    });

    statements.push({
      sql: `INSERT INTO documents_fts (doc_id, ticker, kind, title, body, path, url)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: args.slice(0, 7)
    });
  }

  return statements;
}

async function main() {
  const markerPath = join(root, "research", "db", "README.md");
  await readFile(markerPath, "utf8");

  const started = Date.now();
  const updatedAt = new Date().toISOString();
  const { companies, filings, docs } = await readLocalDatabase();
  const client = createTursoClient();

  try {
    await applyTursoSchema(client);
    await clearResearchTables(client);

    await executeInBatches(client, insertCompanyStatements(companies, updatedAt));
    await executeInBatches(client, insertFilingStatements(filings, updatedAt));
    await executeInBatches(client, insertDocumentStatements(docs, updatedAt), 10);

    const elapsedSeconds = ((Date.now() - started) / 1000).toFixed(1);
    await logActivity(client, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      category: "research",
      action: "push_research_to_turso",
      summary: `Pushed ${companies.length} companies, ${filings.length} SEC filings, and ${docs.length} research documents to Turso.`,
      details: {
        companies: companies.length,
        sec_filings: filings.length,
        research_documents: docs.length,
        elapsed_seconds: Number(elapsedSeconds)
      },
      source: "scripts/cloud/push-research-to-turso.mjs"
    });
    console.log(
      `Pushed ${companies.length} companies, ${filings.length} SEC filings, and ${docs.length} research documents to Turso in ${elapsedSeconds}s.`
    );
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
