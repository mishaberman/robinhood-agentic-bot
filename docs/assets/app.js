const state = {
  data: null,
  filter: "all"
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
  const response = await fetch(`./data/dashboard.json?cache=${Date.now()}`);
  if (!response.ok) throw new Error(`Dashboard data failed: ${response.status}`);
  return response.json();
}

function render(data) {
  state.data = data;
  renderStatus(data);
  renderFilters(data);
  renderTimeline(data);
  renderPipeline(data);
  renderWatchlist(data);
  renderRisk(data);
  renderLinks(data);
}

loadData()
  .then(render)
  .catch((error) => {
    document.querySelector("#status").innerHTML = `
      <article class="status-card primary">
        <div>
          ${badge("ERROR", "error")}
          <h3>Dashboard data unavailable</h3>
          <p class="status-copy">${escapeHtml(error.message)}</p>
        </div>
      </article>
    `;
  });
