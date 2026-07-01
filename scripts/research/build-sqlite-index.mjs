import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dbRoot = join(root, "research", "db");
const sqlitePath = join(root, "research", "research.sqlite");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readTextOrEmpty(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  try {
    await unlink(sqlitePath);
  } catch {
    // Fresh build; no previous index.
  }

  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE companies (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      title TEXT,
      cik INTEGER,
      profile_json TEXT
    );

    CREATE TABLE sec_filings (
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
      text_bytes INTEGER
    );

    CREATE VIRTUAL TABLE documents_fts USING fts5(
      ticker,
      kind,
      title,
      body,
      path UNINDEXED,
      url UNINDEXED,
      tokenize = 'porter'
    );
  `);

  const insertCompany = db.prepare(
    "INSERT INTO companies (ticker, name, title, cik, profile_json) VALUES (?, ?, ?, ?, ?)"
  );
  const insertFiling = db.prepare(`
    INSERT INTO sec_filings (
      id, ticker, form, filing_date, report_date, accession_number, description, items, url,
      full_text_path, raw_html_path, text_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDoc = db.prepare(
    "INSERT INTO documents_fts (ticker, kind, title, body, path, url) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const companiesDir = join(dbRoot, "companies");
  const tickers = (await readdir(companiesDir)).sort();

  db.exec("BEGIN");
  try {
    for (const ticker of tickers) {
      const dir = join(companiesDir, ticker);
      const profile = await readJson(join(dir, "profile.json"));
      insertCompany.run(
        ticker,
        profile.name || null,
        profile.title || null,
        profile.cik || null,
        JSON.stringify(profile)
      );

      const trendPath = join(dir, "trend_summary.md");
      const managementPath = join(dir, "management_notes.md");
      const trend = await readTextOrEmpty(trendPath);
      const management = await readTextOrEmpty(managementPath);
      if (trend) insertDoc.run(ticker, "trend_summary", `${ticker} trend summary`, trend, trendPath, null);
      if (management) {
        insertDoc.run(ticker, "management_notes", `${ticker} management notes`, management, managementPath, null);
      }

      const fullTextIndexPath = join(dir, "sec_filings", "full_text_index.json");
      let fullTextIndex;
      try {
        fullTextIndex = await readJson(fullTextIndexPath);
      } catch {
        continue;
      }

      for (const filing of fullTextIndex.filings || []) {
        const body = await readTextOrEmpty(filing.full_text_path);
        const id = `${ticker}:${filing.accession_number}:${filing.primary_document}`;
        const title = `${ticker} ${filing.form} ${filing.filing_date} ${filing.description || ""}`.trim();
        insertFiling.run(
          id,
          ticker,
          filing.form || null,
          filing.filing_date || null,
          filing.report_date || null,
          filing.accession_number || null,
          filing.description || null,
          filing.items || null,
          filing.url || null,
          filing.full_text_path || null,
          filing.raw_html_path || null,
          Buffer.byteLength(body)
        );
        if (body) insertDoc.run(ticker, "sec_filing", title, body, filing.full_text_path, filing.url || null);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  console.log(`Built ${sqlitePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
