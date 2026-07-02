const state = {
  data: null,
  research: null,
  filter: "all",
  selectedCompany: null,
  filingSymbol: "all",
  lastLoadedAt: null,
  lastRefreshError: null,
  refreshTimer: null,
  marketRange: "1D",
  liveMarket: {},
  liveMarketLoadedAt: null,
  liveMarketLoading: false,
  liveMarketError: null
};

const CLIENT_REFRESH_MS = 60 * 1000;
const PUBLIC_MARKET_SOURCE = "Yahoo Finance chart API via public CORS proxy";
const MARKET_RANGES = {
  "1D": { label: "1D", range: "1d", interval: "5m" },
  "1W": { label: "1W", range: "5d", interval: "15m" },
  "1M": { label: "1M", range: "1mo", interval: "1d" },
  YTD: { label: "YTD", range: "ytd", interval: "1d" },
  "1Y": { label: "1Y", range: "1y", interval: "1d" },
  "5Y": { label: "5Y", range: "5y", interval: "1wk" }
};

const decisionLabels = {
  all: "All",
  "NO TRADE ALERT": "No Trade",
  "TRADE REVIEW": "Trade",
  "EXIT REVIEW": "Exit",
  ERROR: "Errors"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(iso) {
  if (!iso) return "No timestamp";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
}

function formatMoneyCompact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(Number(value));
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
}

function trendMode(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "info";
  if (number > 0.05) return "up";
  if (number < -0.05) return "down";
  return "flat";
}

function percentChange(current, prior) {
  const currentNumber = Number(current);
  const priorNumber = Number(prior);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(priorNumber) || priorNumber === 0) return null;
  return ((currentNumber - priorNumber) / priorNumber) * 100;
}

function compactSource(value) {
  return String(value || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function chartSvg(points, mode = "info") {
  const cleaned = (points || [])
    .map((point) => ({ time: Number(point.time), close: Number(point.close) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close));

  if (cleaned.length < 2) {
    return `<div class="chart-empty">Chart unavailable</div>`;
  }

  const width = 320;
  const height = 96;
  const padding = 8;
  const minTime = cleaned[0].time;
  const maxTime = cleaned.at(-1).time;
  const prices = cleaned.map((point) => point.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const timeSpan = Math.max(1, maxTime - minTime);
  const priceSpan = Math.max(0.01, maxPrice - minPrice);
  const color = mode === "down" ? "#b3342a" : mode === "up" ? "#1f7a55" : "#245b8f";

  const path = cleaned
    .map((point, index) => {
      const x = padding + ((point.time - minTime) / timeSpan) * (width - padding * 2);
      const y = height - padding - ((point.close - minPrice) / priceSpan) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `${path} L${width - padding} ${height - padding} L${padding} ${height - padding} Z`;

  return `
    <svg class="spark-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price trend chart">
      <path d="${area}" fill="${color}" opacity="0.12"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
      <line x1="${padding}" x2="${width - padding}" y1="${height - padding}" y2="${height - padding}" stroke="#ded8cb"></line>
    </svg>
  `;
}

function classFor(run) {
  if (run?.severity) return run.severity;
  if (run?.status === "error") return "error";
  if (run?.decision === "TRADE REVIEW" || run?.decision === "EXIT REVIEW") return "notify";
  if (run?.decision === "NO TRADE ALERT") return "quiet";
  return "info";
}

function badge(label, mode = "info") {
  return `<span class="badge ${mode}">${escapeHtml(label)}</span>`;
}

function smallStat(value, label, mode = "") {
  return `
    <div class="mini-stat ${escapeHtml(mode)}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function latestAccount(data) {
  const withAccount = data.runs?.find((run) => run.account && Object.keys(run.account).length);
  return withAccount?.account || {};
}

function renderStatus(data) {
  const latest = data.latest;
  const account = latestAccount(data);
  const stats = data.stats || {};
  const status = document.querySelector("#status");
  const latestMode = classFor(latest);
  const latestDecision = latest?.decision || "Waiting for first run";
  const latestMessage = latest?.message || "Dashboard data is ready. New monitor decisions will appear after each logged run.";

  status.innerHTML = `
    <article class="status-card primary">
      <div>
        <div class="run-meta">
          ${badge(latestDecision, latestMode)}
          <span class="run-time">${escapeHtml(formatTime(latest?.started_at))}</span>
        </div>
        <h3>Latest Decision</h3>
        <p class="status-copy">${escapeHtml(latestMessage)}</p>
      </div>
      <div>${sparkSvg(stats)}</div>
    </article>
    <article class="status-card">
      <p class="eyebrow">Cash</p>
      <p class="status-value">${escapeHtml(formatMoney(account.cash_usd ?? account.cash))}</p>
      <p class="status-copy">Agentic account snapshot from the latest logged local run.</p>
    </article>
    <article class="status-card">
      <p class="eyebrow">Runs</p>
      <p class="status-value">${escapeHtml(stats.total_runs ?? 0)}</p>
      <p class="status-copy">${escapeHtml(stats.no_trade_runs ?? 0)} no-trade decisions, ${escapeHtml(stats.errors ?? 0)} errors.</p>
    </article>
    <article class="status-card">
      <p class="eyebrow">Alerts</p>
      <p class="status-value">${escapeHtml(stats.alerts ?? 0)}</p>
      <p class="status-copy">${escapeHtml(stats.trade_reviews ?? 0)} trade reviews, ${escapeHtml(stats.exit_reviews ?? 0)} exit reviews.</p>
    </article>
  `;
}

function sparkSvg(stats) {
  const noTrade = Number(stats.no_trade_runs || 0);
  const trade = Number(stats.trade_reviews || 0);
  const exit = Number(stats.exit_reviews || 0);
  const errors = Number(stats.errors || 0);
  const total = Math.max(1, noTrade + trade + exit + errors);
  const bars = [
    ["No trade", noTrade, "#1f7a55"],
    ["Trade", trade, "#9a6400"],
    ["Exit", exit, "#245b8f"],
    ["Errors", errors, "#b3342a"]
  ];
  const width = 180;
  const height = 118;
  const barWidth = 28;
  const gap = 16;
  const start = 14;
  const maxHeight = 70;

  const rects = bars
    .map(([label, value, color], index) => {
      const h = Math.max(4, (value / total) * maxHeight);
      const x = start + index * (barWidth + gap);
      const y = 82 - h;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${color}"></rect>
        <text x="${x + barWidth / 2}" y="104" text-anchor="middle" font-size="9" fill="#68717a">${escapeHtml(label)}</text>
        <text x="${x + barWidth / 2}" y="${Math.max(14, y - 6)}" text-anchor="middle" font-size="11" font-weight="800" fill="#1b1f23">${value}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Decision mix">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#fffaf0" stroke="#ded8cb"></rect>
      <line x1="12" x2="${width - 12}" y1="84" y2="84" stroke="#ded8cb"></line>
      ${rects}
    </svg>
  `;
}

function renderFilters(data) {
  const filters = document.querySelector("#filters");
  const present = new Set((data.runs || []).map((run) => run.decision));
  const keys = ["all", "NO TRADE ALERT", "TRADE REVIEW", "EXIT REVIEW", "ERROR"];
  filters.innerHTML = keys
    .filter((key) => key === "all" || present.has(key))
    .map(
      (key) => `
        <button type="button" class="${state.filter === key ? "active" : ""}" data-filter="${escapeHtml(key)}">
          ${escapeHtml(decisionLabels[key] || key)}
        </button>
      `
    )
    .join("");
  filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderFilters(data);
      renderTimeline(data);
    });
  });
}

function renderTimeline(data) {
  const timeline = document.querySelector("#timeline");
  const runs = (data.runs || []).filter((run) => state.filter === "all" || run.decision === state.filter);
  if (!runs.length) {
    timeline.innerHTML = `<div class="empty">No runs match this filter.</div>`;
    return;
  }

  timeline.innerHTML = runs
    .map((run) => {
      const mode = classFor(run);
      const details = [
        run.ticker ? `Ticker: ${run.ticker}` : null,
        run.score !== null && run.score !== undefined ? `Score: ${run.score}` : null,
        run.source ? `Source: ${run.source}` : null,
        run.status ? `Status: ${run.status}` : null
      ]
        .filter(Boolean)
        .join(" | ");

      return `
        <article class="run-card">
          <div class="stripe ${mode}"></div>
          <div class="run-body">
            <div class="run-meta">
              ${badge(run.decision || "STATUS", mode)}
              <span class="run-time">${escapeHtml(formatTime(run.started_at))}</span>
            </div>
            <p class="run-message">${escapeHtml(run.message || run.output_text || "No message recorded.")}</p>
            ${details ? `<div class="run-details">${escapeHtml(details)}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPipeline(data) {
  const pipeline = document.querySelector("#pipeline");
  const stages = data.latest?.stages?.length ? data.latest.stages : [];
  if (!stages.length) {
    pipeline.innerHTML = `<div class="empty">No run stages have been logged yet.</div>`;
    return;
  }

  pipeline.innerHTML = stages
    .map(
      (stage, index) => `
        <div class="stage ${escapeHtml(stage.status || "done")}">
          <div class="stage-dot">${index + 1}</div>
          <div>
            <p class="stage-title">${escapeHtml(stage.name)}</p>
            <p class="stage-summary">${escapeHtml(stage.summary || "")}</p>
          </div>
        </div>
      `
    )
    .join("");
}

function renderWatchlist(data) {
  const watchlist = document.querySelector("#watchlist");
  watchlist.innerHTML = (data.watchlist || [])
    .map((item) => {
      const stateText = item.state?.decision || "Watch";
      const mode = item.state?.decision === "TRADE REVIEW" || item.state?.decision === "EXIT REVIEW" ? "notify" : "info";
      const note = item.state?.message || "No logged trigger. Waiting for catalyst, relative strength, and clean setup.";
      return `
        <article class="ticker-card">
          <div class="ticker-symbol">
            <span>${escapeHtml(item.symbol)}</span>
            <span class="ticker-priority">#${escapeHtml(item.priority)}</span>
          </div>
          ${badge(stateText, mode)}
          <p class="ticker-note">${escapeHtml(note)}</p>
        </article>
      `;
    })
    .join("");
}

function renderRisk(data) {
  const risk = data.risk_rules || {};
  const riskEl = document.querySelector("#risk");
  const items = [
    [risk.min_trade_review_score ?? 80, "Minimum trade-review score"],
    [formatMoney(risk.max_position_notional_usd), "Max single position"],
    [formatMoney(risk.max_daily_loss_usd), "Max daily realized loss"],
    [risk.max_trades_per_day ?? "n/a", "Max trades per day"]
  ];
  riskEl.innerHTML = items
    .map(
      ([number, label]) => `
        <div class="risk-item">
          <p class="risk-number">${escapeHtml(number)}</p>
          <p class="risk-label">${escapeHtml(label)}</p>
        </div>
      `
    )
    .join("");

  document.querySelector("#pulse").innerHTML = `
    <svg viewBox="0 0 520 160" role="img" aria-label="Risk gate flow">
      <rect x="0" y="0" width="520" height="160" rx="8" fill="#fffaf0" stroke="#ded8cb"></rect>
      ${["Catalyst", "Research", "Tape", "Setup", "Risk", "Decision"]
        .map((label, index) => {
          const x = 22 + index * 82;
          const y = 60 + (index % 2) * 16;
          const color = index < 5 ? "#245b8f" : "#1f7a55";
          const line =
            index < 5
              ? `<path d="M${x + 54} ${y + 18} C${x + 74} ${y + 18}, ${x + 52} ${60 + ((index + 1) % 2) * 16 + 18}, ${x + 82} ${60 + ((index + 1) % 2) * 16 + 18}" fill="none" stroke="#b9b1a1" stroke-width="2"></path>`
              : "";
          return `
            ${line}
            <rect x="${x}" y="${y}" width="58" height="36" rx="8" fill="${color}" opacity="0.92"></rect>
            <text x="${x + 29}" y="${y + 23}" text-anchor="middle" fill="white" font-size="10" font-weight="800">${label}</text>
          `;
        })
        .join("")}
      <text x="20" y="132" fill="#68717a" font-size="12">A trade alert only appears after every gate clears.</text>
    </svg>
  `;
}

function renderMarketRangeControls() {
  const target = document.querySelector("#rangeControls");
  if (!target) return;

  target.innerHTML = Object.keys(MARKET_RANGES)
    .map(
      (key) => `
        <button type="button" class="${state.marketRange === key ? "active" : ""}" data-range="${escapeHtml(key)}">
          ${escapeHtml(MARKET_RANGES[key].label)}
        </button>
      `
    )
    .join("");

  target.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.marketRange = button.dataset.range;
      renderMarketSnapshot(state.research);
      updatePublicMarketData();
    });
  });
}

function latestPoint(points) {
  return [...(points || [])]
    .reverse()
    .find((point) => Number.isFinite(Number(point.close)));
}

async function fetchPublicChart(symbol, rangeKey) {
  const range = MARKET_RANGES[rangeKey] || MARKET_RANGES["1D"];
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range.range);
  url.searchParams.set("interval", range.interval);
  url.searchParams.set("includePrePost", rangeKey === "1D" ? "true" : "false");
  url.searchParams.set("events", "div,splits");

  const payload = await fetchPublicMarketJson(url.toString());
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const closes = quote?.close || [];
  const points = timestamps
    .map((timestamp, index) => ({
      time: timestamp * 1000,
      close: Number(closes[index])
    }))
    .filter((point) => Number.isFinite(point.close));
  const latest = latestPoint(points);
  const first = points[0];
  const meta = result?.meta || {};
  const price = Number(meta.regularMarketPrice ?? latest?.close);
  const prior = Number(meta.previousClose ?? meta.chartPreviousClose ?? first?.close);
  const rangePrior = first?.close ?? prior;
  const asOfMs = Number(meta.regularMarketTime) ? Number(meta.regularMarketTime) * 1000 : latest?.time;

  return {
    symbol,
    price,
    previous_close: Number.isFinite(prior) ? prior : null,
    as_of: asOfMs ? new Date(asOfMs).toISOString() : null,
    day_change_pct: percentChange(price, prior),
    range_change_pct: percentChange(price, rangePrior),
    points,
    source: PUBLIC_MARKET_SOURCE,
    range: rangeKey
  };
}

async function fetchPublicMarketJson(targetUrl) {
  const urls = [
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    targetUrl
  ];
  let lastError = null;

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Public market fetch failed");
}

async function updatePublicMarketData() {
  const companies = state.research?.companies || [];
  if (!companies.length) return;

  state.liveMarketLoading = true;
  state.liveMarketError = null;
  renderMarketSnapshot(state.research);

  const rangeKey = state.marketRange;
  const results = await Promise.allSettled(companies.map((company) => fetchPublicChart(company.symbol, rangeKey)));
  const liveMarket = {};
  const failures = [];

  results.forEach((result, index) => {
    const symbol = companies[index]?.symbol;
    if (result.status === "fulfilled") {
      liveMarket[symbol] = result.value;
    } else {
      failures.push(symbol);
    }
  });

  if (state.marketRange === rangeKey) {
    state.liveMarket = liveMarket;
    state.liveMarketLoadedAt = new Date().toISOString();
    state.liveMarketLoading = false;
    state.liveMarketError = failures.length ? `Public chart fallback for ${failures.join(", ")}` : null;
    renderMarketSnapshot(state.research);
  }
}

function renderMarketSnapshot(research) {
  const meta = document.querySelector("#marketMeta");
  const market = research?.market_snapshot || {};
  const refreshState = state.lastRefreshError
    ? `Last browser refresh failed: ${state.lastRefreshError}`
    : `Browser checks every ${Math.round(CLIENT_REFRESH_MS / 1000)}s`;
  const liveState = state.liveMarketLoading
    ? `Loading ${state.marketRange} public charts`
    : state.liveMarketLoadedAt
      ? `${state.marketRange} public charts ${formatTime(state.liveMarketLoadedAt)}`
      : "Public charts pending";
  meta.textContent = [
    market.generated_at ? `Market ${formatTime(market.generated_at)}` : "No market snapshot",
    research?.metadata?.generated_at ? `Export ${formatTime(research.metadata.generated_at)}` : null,
    state.lastLoadedAt ? `Browser checked ${formatTime(state.lastLoadedAt)}` : null,
    liveState,
    state.liveMarketError,
    refreshState
  ]
    .filter(Boolean)
    .join(" | ");
  renderMarketRangeControls();

  const target = document.querySelector("#marketSnapshot");
  const companies = research?.companies || [];
  if (!companies.length) {
    target.innerHTML = `<div class="empty">No company research data has been exported yet.</div>`;
    return;
  }

  target.innerHTML = companies
    .map((company) => {
      const snapshot = company.market || {};
      const live = state.liveMarket?.[company.symbol] || null;
      const quote = live ? { ...snapshot, ...live } : snapshot;
      const rangeChange = live?.range_change_pct ?? quote.day_change_pct;
      const mode = trendMode(rangeChange);
      const range = Math.round(Number(quote.range_52w_position_pct || 0));
      const spread = quote.spread_pct === null || quote.spread_pct === undefined ? "n/a" : formatPercent(quote.spread_pct, 3);
      const source = live ? `${PUBLIC_MARKET_SOURCE} | ${state.marketRange}` : "Published snapshot";
      return `
        <article class="market-card">
          <div class="market-head">
            <div>
              <p class="ticker-line">${escapeHtml(company.symbol)}</p>
              <p class="company-name">${escapeHtml(company.name)}</p>
            </div>
            ${badge(formatPercent(rangeChange), mode)}
          </div>
          <div class="price-row">
            <strong>${escapeHtml(formatPrice(quote.price))}</strong>
            <span>${escapeHtml(formatTime(quote.as_of))}<br>${escapeHtml(compactSource(source))}</span>
          </div>
          <div class="chart-block">
            ${chartSvg(live?.points, mode)}
          </div>
          <div class="mini-grid">
            ${smallStat(formatPrice(quote.previous_close), "Prev close")}
            ${smallStat(`${formatNumber(quote.volume)} / ${formatNumber(quote.avg_volume_30d)}`, "Vol / 30d avg")}
            ${smallStat(formatMoneyCompact(quote.market_cap), "Market cap")}
            ${smallStat(quote.pe_ratio === null ? "n/a" : formatNumber(quote.pe_ratio, 1), "P/E")}
            ${smallStat(spread, "Bid/ask spread")}
            ${smallStat(quote.volume_vs_30d === null ? "n/a" : `${formatNumber(quote.volume_vs_30d, 2)}x`, "Volume pace")}
          </div>
          <div class="range-block">
            <div class="range-labels">
              <span>${escapeHtml(formatPrice(quote.low_52w))}</span>
              <span>52w ${escapeHtml(formatNumber(range))}%</span>
              <span>${escapeHtml(formatPrice(quote.high_52w))}</span>
            </div>
            <div class="range-track">
              <span style="left: ${escapeHtml(range)}%"></span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCompanySelect(research) {
  const select = document.querySelector("#companySelect");
  const companies = research?.companies || [];
  if (!companies.length) {
    select.innerHTML = "";
    return;
  }

  if (!state.selectedCompany || !companies.some((company) => company.symbol === state.selectedCompany)) {
    state.selectedCompany = companies[0].symbol;
  }

  select.innerHTML = companies
    .map((company) => `<option value="${escapeHtml(company.symbol)}">${escapeHtml(company.symbol)} - ${escapeHtml(company.name)}</option>`)
    .join("");
  select.value = state.selectedCompany;
  select.onchange = () => {
    state.selectedCompany = select.value;
    renderCompanyDetail(research);
  };
}

function metricTable(metrics) {
  if (!metrics?.length) return `<div class="empty">No financial fact metrics exported for this company.</div>`;
  return `
    <div class="metric-grid">
      ${metrics
        .map(
          (metric) => `
            <div class="metric-item">
              <strong>${escapeHtml(metric.unit === "USD/shares" ? formatPrice(metric.value) : formatMoneyCompact(metric.value))}</strong>
              <span>${escapeHtml(metric.label)}</span>
              <em>${escapeHtml([metric.fiscal_year, metric.period, metric.form, metric.filed].filter(Boolean).join(" | "))}</em>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCompanyDetail(research) {
  const target = document.querySelector("#companyDetail");
  const company = (research?.companies || []).find((item) => item.symbol === state.selectedCompany);
  if (!company) {
    target.innerHTML = `<div class="empty">No company selected.</div>`;
    return;
  }

  const market = company.market || {};
  const strategy = company.strategy || {};
  const filings = company.recent_filings || [];
  const trendBullets = company.summaries?.trend_bullets || [];
  const themeTags = (company.themes || []).map((theme) => `<span>${escapeHtml(theme)}</span>`).join("");

  target.innerHTML = `
    <div class="company-hero">
      <div>
        <div class="company-title-row">
          <h3>${escapeHtml(company.symbol)} ${escapeHtml(company.name)}</h3>
          ${badge(strategy.role || "Watchlist", "info")}
        </div>
        <p class="company-meta">${escapeHtml([market.sector, market.industry, company.cik ? `CIK ${company.cik}` : null].filter(Boolean).join(" | "))}</p>
        <div class="theme-row">${themeTags}</div>
      </div>
      <div class="company-price">
        <strong>${escapeHtml(formatPrice(market.price))}</strong>
        <span>${escapeHtml(formatPercent(market.day_change_pct))} today</span>
      </div>
    </div>

    <div class="research-columns">
      <section>
        <h4>Extracted Trend Snapshot</h4>
        ${
          trendBullets.length
            ? `<ul class="tight-list">${trendBullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
            : `<div class="empty">No trend bullets exported.</div>`
        }
      </section>
      <section>
        <h4>Strategy Context</h4>
        <div class="strategy-block">
          ${smallStat(strategy.priority ?? "n/a", "Priority")}
          ${smallStat(strategy.notional_bias || "n/a", "Notional bias")}
          ${smallStat(company.filings_count, "SEC filings")}
          ${smallStat(market.range_52w_position_pct === null ? "n/a" : `${formatNumber(market.range_52w_position_pct, 0)}%`, "52w range position")}
        </div>
        <p class="strategy-theme">${escapeHtml(strategy.theme || "No strategy theme exported.")}</p>
      </section>
    </div>

    <section>
      <h4>Financial Fact Snapshot</h4>
      ${metricTable(company.financial_metrics)}
    </section>

    <section>
      <h4>Recent SEC Filings</h4>
      <div class="mini-filings">
        ${filings
          .map(
            (filing) => `
              <a href="${escapeHtml(filing.url || "#")}">
                <strong>${escapeHtml(filing.filing_date || "")} ${escapeHtml(filing.form || "")}</strong>
                <span>${escapeHtml([filing.description, filing.items ? `Items ${filing.items}` : null].filter(Boolean).join(" | "))}</span>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFilings(research) {
  const select = document.querySelector("#filingSelect");
  const count = document.querySelector("#filingCount");
  const target = document.querySelector("#filingsTable");
  const companies = research?.companies || [];
  const allFilings = research?.filings || [];

  select.innerHTML = [
    `<option value="all">All tickers</option>`,
    ...companies.map((company) => `<option value="${escapeHtml(company.symbol)}">${escapeHtml(company.symbol)}</option>`)
  ].join("");
  select.value = state.filingSymbol;
  select.onchange = () => {
    state.filingSymbol = select.value;
    renderFilings(research);
  };

  const filings = allFilings.filter((filing) => state.filingSymbol === "all" || filing.symbol === state.filingSymbol);
  count.textContent = `${filings.length} filing rows`;
  target.innerHTML = `
    <table class="filings-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Filed</th>
          <th>Form</th>
          <th>Report</th>
          <th>Description</th>
          <th>Accession</th>
        </tr>
      </thead>
      <tbody>
        ${filings
          .map(
            (filing) => `
              <tr>
                <td>${escapeHtml(filing.symbol)}</td>
                <td>${escapeHtml(filing.filing_date || "")}</td>
                <td><a href="${escapeHtml(filing.url || "#")}">${escapeHtml(filing.form || "")}</a></td>
                <td>${escapeHtml(filing.report_date || "")}</td>
                <td>${escapeHtml([filing.description, filing.items ? `Items ${filing.items}` : null].filter(Boolean).join(" | "))}</td>
                <td>${escapeHtml(filing.accession_number || "")}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCoverageGaps(research) {
  const target = document.querySelector("#coverageGaps");
  const companies = research?.companies || [];
  const missingMarket = companies.filter((company) => !company.market).map((company) => company.symbol);
  const missingFacts = companies.filter((company) => !company.financial_metrics?.length).map((company) => company.symbol);
  const items = [
    `Public chart cards try ${PUBLIC_MARKET_SOURCE} on each browser refresh; if that fails, they fall back to the 5-minute published Robinhood snapshot.`,
    `No private authenticated Robinhood stream is exposed to the browser; public API availability can vary by provider, CORS, and rate limits.`,
    `No live VWAP/support/resistance chart is published yet; those are still assessed during monitor runs.`,
    `Management-note tables are mostly placeholders until manual earnings-call notes are added.`,
    missingMarket.length ? `Missing market snapshot: ${missingMarket.join(", ")}.` : `Market snapshot present for all ${companies.length} watchlist entries.`,
    missingFacts.length ? `Missing SEC financial facts: ${missingFacts.join(", ")}.` : `SEC financial fact snapshots present for operating-company entries; SMH is ETF/benchmark context.`
  ];

  target.innerHTML = items.map((item) => `<div class="gap-item">${escapeHtml(item)}</div>`).join("");
}

function renderLinks(data) {
  const links = document.querySelector("#links");
  const reportLinks = (data.reports || []).map((report) => ({
    title: report.title,
    href: report.href,
    detail: report.preview
  }));
  const baseLinks = [
    { title: "Dashboard JSON", href: data.links?.data_json, detail: data.metadata?.data_note },
    { title: "Sanitized Decision Log", href: data.links?.sanitized_decision_log, detail: "One public-safe JSONL row per locally recorded monitor decision." },
    { title: "Sanitized Log Index", href: data.links?.sanitized_log_index, detail: "Public-safe index of exported logs and local audit previews." },
    data.links?.repository
      ? { title: "GitHub Repository", href: data.links.repository, detail: "Source, workflows, and Pages deployment history." }
      : null
  ].filter(Boolean);

  links.innerHTML = [...reportLinks, ...baseLinks]
    .filter((link) => link.href)
    .map(
      (link) => `
        <a class="source-link" href="${escapeHtml(link.href)}">
          <strong>${escapeHtml(link.title)}</strong>
          <span>${escapeHtml(link.detail || "")}</span>
        </a>
      `
    )
    .join("");
}

async function loadData() {
  const cache = Date.now();
  const [dashboardResponse, researchResponse] = await Promise.all([
    fetch(`./data/dashboard.json?cache=${cache}`),
    fetch(`./data/research.json?cache=${cache}`)
  ]);
  if (!dashboardResponse.ok) throw new Error(`Dashboard data failed: ${dashboardResponse.status}`);
  if (!researchResponse.ok) throw new Error(`Research data failed: ${researchResponse.status}`);
  return {
    dashboard: await dashboardResponse.json(),
    research: await researchResponse.json()
  };
}

function renderLoadError(error) {
  document.querySelector("#status").innerHTML = `
    <article class="status-card primary">
      <div>
        ${badge("ERROR", "error")}
        <h3>Dashboard data unavailable</h3>
        <p class="status-copy">${escapeHtml(error.message)}</p>
      </div>
    </article>
  `;
}

function render({ dashboard: data, research }) {
  state.data = data;
  state.research = research;
  renderStatus(data);
  renderMarketSnapshot(research);
  renderFilters(data);
  renderTimeline(data);
  renderPipeline(data);
  renderWatchlist(data);
  renderRisk(data);
  renderCompanySelect(research);
  renderCompanyDetail(research);
  renderFilings(research);
  renderCoverageGaps(research);
  renderLinks(data);
}

async function refreshData() {
  try {
    const payload = await loadData();
    state.lastLoadedAt = new Date().toISOString();
    state.lastRefreshError = null;
    render(payload);
    updatePublicMarketData();
  } catch (error) {
    state.lastRefreshError = error.message;
    if (!state.data || !state.research) {
      renderLoadError(error);
      return;
    }
    renderMarketSnapshot(state.research);
  }
}

refreshData();
state.refreshTimer = window.setInterval(refreshData, CLIENT_REFRESH_MS);
