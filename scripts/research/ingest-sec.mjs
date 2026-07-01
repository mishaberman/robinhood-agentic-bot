import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const watchlistPath = join(root, "research", "watchlist.json");
const dbRoot = join(root, "research", "db");
const secUserAgent =
  process.env.SEC_USER_AGENT ||
  "robinhood-agentic-bot research contact: user-local-codex@example.com";

const metricConcepts = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "Revenue",
    "RevenueFromContractsWithCustomers"
  ],
  gross_profit: ["GrossProfit"],
  cost_of_revenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfSales"],
  operating_income: [
    "OperatingIncomeLoss",
    "ProfitLossFromOperatingActivities",
    "OperatingProfitLoss"
  ],
  net_income: [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
    "NetIncomeLossAvailableToCommonStockholdersDiluted"
  ],
  diluted_eps: ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
  rd_expense: ["ResearchAndDevelopmentExpense"],
  sga_expense: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"
  ],
  operating_cash_flow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivities"
  ],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "CashAndCashEquivalents"
  ],
  inventory: ["InventoryNet", "Inventories", "CurrentInventories"],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  equity: ["StockholdersEquity", "Equity"]
};

const secOperatingForms = new Set(["10-K", "10-Q", "8-K", "20-F", "6-K"]);
const metricFactForms = new Set(["10-K", "10-Q", "20-F", "6-K"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": secUserAgent,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  await sleep(120);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": secUserAgent,
      Accept: "text/html,text/plain"
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const text = await response.text();
  await sleep(120);
  return text;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function safeFilePart(value) {
  return String(value || "")
    .replaceAll("/", "-")
    .replaceAll("\\", "-")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function padCik(cik) {
  return String(cik).padStart(10, "0");
}

function secFilingUrl(cik, accessionNumber, primaryDocument) {
  const compactAccession = accessionNumber.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${compactAccession}/${primaryDocument}`;
}

function cutoffDate(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function normalizeRecentFilings(submissions, cik, years) {
  const recent = submissions?.filings?.recent || {};
  const cutoff = cutoffDate(years);
  const forms = recent.form || [];

  return forms
    .map((form, index) => ({
      form,
      filing_date: recent.filingDate?.[index],
      report_date: recent.reportDate?.[index],
      accession_number: recent.accessionNumber?.[index],
      primary_document: recent.primaryDocument?.[index],
      description: recent.primaryDocDescription?.[index],
      items: recent.items?.[index] || "",
      url:
        recent.accessionNumber?.[index] && recent.primaryDocument?.[index]
          ? secFilingUrl(cik, recent.accessionNumber[index], recent.primaryDocument[index])
          : null
    }))
    .filter((filing) => filing.filing_date >= cutoff)
    .filter((filing) => secOperatingForms.has(filing.form));
}

function isEarningsReleaseCandidate(filing) {
  const text = `${filing.items} ${filing.description} ${filing.primary_document}`;
  if (filing.form === "8-K") return /2\.02|results|earnings|quarter|annual|financial/i.test(text);
  if (filing.form === "6-K") return /results|earnings|quarter|annual|financial|interim/i.test(text);
  return false;
}

function shouldStoreFullText(filing) {
  return ["10-K", "10-Q", "20-F", "6-K"].includes(filing.form) || isEarningsReleaseCandidate(filing);
}

function htmlToPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|table|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function storeFullSecFilings(companyDir, ticker, filings) {
  const fullTextIndex = {
    generated_at: new Date().toISOString(),
    ticker,
    note:
      "Full text is stored only for public SEC primary documents: 10-K, 10-Q, 20-F, 6-K, and earnings-related 8-K primary documents.",
    filings: []
  };

  for (const filing of filings.filter(shouldStoreFullText)) {
    if (!filing.url) continue;
    const fileBase = [
      filing.filing_date,
      filing.form,
      safeFilePart(filing.accession_number),
      safeFilePart(filing.primary_document)
    ].join("_");
    const htmlPath = join(companyDir, "sec_filings", "raw_html", `${fileBase}.html`);
    const textPath = join(companyDir, "sec_filings", "full_text", `${fileBase}.txt`);

    if (!(await exists(textPath))) {
      console.log(`  full text ${ticker} ${filing.form} ${filing.filing_date}`);
      const html = await fetchText(filing.url);
      await writeText(htmlPath, html);
      await writeText(textPath, `${htmlToPlainText(html)}\n`);
    }

    fullTextIndex.filings.push({
      form: filing.form,
      filing_date: filing.filing_date,
      report_date: filing.report_date,
      accession_number: filing.accession_number,
      primary_document: filing.primary_document,
      description: filing.description,
      items: filing.items,
      url: filing.url,
      raw_html_path: htmlPath,
      full_text_path: textPath
    });
  }

  await writeJson(join(companyDir, "sec_filings", "full_text_index.json"), fullTextIndex);
}

function candidateFactsForConcept(companyFacts, concept) {
  const taxonomies = companyFacts?.facts || {};
  return Object.entries(taxonomies).flatMap(([taxonomy, factsByConcept]) => {
    const fact = factsByConcept?.[concept];
    if (!fact?.units) return [];
    return Object.entries(fact.units)
      .filter(([, facts]) => Array.isArray(facts))
      .map(([unit, facts]) => ({ taxonomy, concept, unit, facts }));
  });
}

function compactFact(fact) {
  return {
    start: fact.start,
    end: fact.end,
    fy: fact.fy,
    fp: fact.fp,
    form: fact.form,
    filed: fact.filed,
    frame: fact.frame,
    value: fact.val,
    accession_number: fact.accn
  };
}

function extractMetrics(companyFacts, years) {
  const cutoff = cutoffDate(years);
  const metrics = {};

  for (const [metric, concepts] of Object.entries(metricConcepts)) {
    const candidates = concepts.flatMap((concept) => candidateFactsForConcept(companyFacts, concept));
    const candidateWithFacts = candidates
      .map((candidate) => ({
        ...candidate,
        facts: candidate.facts
          .filter((fact) => fact.end >= cutoff)
          .filter((fact) => metricFactForms.has(fact.form))
          .map(compactFact)
          .sort((a, b) => {
            const byEnd = String(a.end).localeCompare(String(b.end));
            if (byEnd !== 0) return byEnd;
            return String(a.filed).localeCompare(String(b.filed));
          })
      }))
      .filter((candidate) => candidate.facts.length > 0)
      .sort((a, b) => {
        const latestA = a.facts.at(-1)?.end || "";
        const latestB = b.facts.at(-1)?.end || "";
        const latestDelta = latestB.localeCompare(latestA);
        if (latestDelta !== 0) return latestDelta;
        const conceptPriority = concepts.indexOf(a.concept) - concepts.indexOf(b.concept);
        if (conceptPriority !== 0) return conceptPriority;
        return b.facts.length - a.facts.length;
      })[0];

    metrics[metric] = candidateWithFacts
      ? {
          taxonomy: candidateWithFacts.taxonomy,
          concept: candidateWithFacts.concept,
          unit: candidateWithFacts.unit,
          facts: candidateWithFacts.facts
        }
      : { taxonomy: null, concept: null, unit: null, facts: [] };
  }

  return metrics;
}

function latestFact(metrics, metric) {
  const facts = metrics[metric]?.facts || [];
  return facts.at(-1) || null;
}

function profileFromTickerEntry(entry, ticker) {
  return {
    ticker,
    cik: entry.cik_str,
    title: entry.title,
    sec_ticker: entry.ticker
  };
}

async function main() {
  const watchlist = JSON.parse(await readFile(watchlistPath, "utf8"));
  const tickerMap = await fetchJson("https://www.sec.gov/files/company_tickers.json");
  const secByTicker = new Map(
    Object.values(tickerMap).map((entry) => [String(entry.ticker).toUpperCase(), entry])
  );

  const index = {
    generated_at: new Date().toISOString(),
    lookback_years: watchlist.lookback_years,
    companies: []
  };

  for (const company of watchlist.companies) {
    const ticker = company.ticker.toUpperCase();
    const companyDir = join(dbRoot, "companies", ticker);

    if (company.skip_sec_operating_company_ingest) {
      await writeJson(join(companyDir, "profile.json"), {
        ...company,
        note: "Skipped SEC operating-company ingestion because this is an ETF/benchmark."
      });
      index.companies.push({ ticker, skipped: true, reason: "ETF/benchmark" });
      continue;
    }

    const secEntry = secByTicker.get(ticker);
    if (!secEntry) {
      await writeJson(join(companyDir, "profile.json"), {
        ...company,
        error: "Ticker not found in SEC company_tickers.json"
      });
      index.companies.push({ ticker, error: "SEC ticker not found" });
      continue;
    }

    const profile = {
      ...company,
      ...profileFromTickerEntry(secEntry, ticker)
    };
    const cik = padCik(profile.cik);

    console.log(`Fetching ${ticker} (${cik})`);
    const [submissions, companyFacts] = await Promise.all([
      fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
      fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`)
    ]);

    const filings = normalizeRecentFilings(submissions, profile.cik, watchlist.lookback_years);
    const metrics = extractMetrics(companyFacts, watchlist.lookback_years);

    await writeJson(join(companyDir, "profile.json"), profile);
    await writeJson(join(companyDir, "filings.json"), {
      generated_at: new Date().toISOString(),
      ticker,
      filings
    });
    await writeJson(join(companyDir, "financial_facts.json"), {
      generated_at: new Date().toISOString(),
      ticker,
      metrics
    });
    await writeJson(join(companyDir, "earnings_sources.json"), {
      generated_at: new Date().toISOString(),
      ticker,
      note:
        "Transcript ingestion stores source metadata and short summaries only. Do not copy paywalled/copyrighted transcripts into this database.",
      sec_earnings_release_candidates: filings.filter(isEarningsReleaseCandidate),
      sec_8k_earnings_release_candidates: filings.filter(isEarningsReleaseCandidate)
    });
    await storeFullSecFilings(companyDir, ticker, filings);

    index.companies.push({
      ticker,
      cik: profile.cik,
      filings: filings.length,
      latest_revenue: latestFact(metrics, "revenue"),
      latest_net_income: latestFact(metrics, "net_income")
    });
  }

  await writeJson(join(dbRoot, "index.json"), index);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
