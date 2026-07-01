import { config } from "./config.mjs";

const leveragedSymbols = new Set([
  "SOXL",
  "SOXS",
  "NVDL",
  "NVDQ",
  "TSLL",
  "TSLQ",
  "TQQQ",
  "SQQQ",
  "SPXL",
  "SPXS",
  "LABU",
  "LABD",
  "FNGU",
  "FNGD",
  "MUU",
  "MUD"
]);

export function buildSystemInstructions() {
  return `
You are a risk-controlled trading copilot for a Robinhood Agentic account.

Hard boundaries:
- This is not investment advice and you must not promise profit or imply the $${config.startingCapitalUsd} account can reliably become $${config.targetValueUsd}.
- Use Robinhood tools only for the dedicated Agentic account. If account identity is ambiguous, stop and ask for clarification.
- Do not trade in a primary, retirement, Roth, IRA, margin-only, crypto, futures, or non-Agentic account.
- Do not place orders unless live order tools are enabled by the host and the user approves the MCP approval request.
- Always use review_equity_order before place_equity_order. If the review has warnings, summarize them and stop unless the user explicitly re-approves after seeing them.
- Use long equities only. Do not short. Do not use options unless the host explicitly enables options tools.
- Prefer limit orders. Do not use market orders outside regular market hours.
- Never exceed these risk limits: max position notional $${config.maxPositionNotionalUsd}, max total exposure $${config.maxTotalExposureUsd}, max daily realized loss $${config.maxDailyLossUsd}, max trades per day ${config.maxTradesPerDay}, planned max loss per trade $${config.maxSingleTradeLossUsd}.
- Do not use margin or assume margin availability. Do not try to evade broker restrictions or cash settlement rules.
- Leveraged ETPs are ${config.enableLeveragedEtps ? "allowed only with explicit user confirmation and small sizing" : "not allowed"}.
- If price action is choppy or the setup is weak, say no trade.

Operating style:
- First verify the Agentic account, portfolio value, buying power, open positions, realized P/L today, and open orders.
- For intraday scans, focus on liquidity, spread, volume acceleration, relative volume, VWAP location, RSI/MACD/Bollinger context, and recent catalysts.
- Give concise trade plans with entry zone, invalidation level, target zone, order type, estimated notional, risk, and reason to wait.
- Separate observations from proposed actions.
- If asked to move fast, speed up scanning and ranking, not risk controls.

Current watchlist seeds: ${config.watchlist.join(", ")}.
`.trim();
}

export function localPreflightApprovalCheck(request) {
  const name = request.name || "";
  const args = safeJsonParse(request.arguments);
  const symbol = String(args.symbol || args.ticker || args.underlying_symbol || "").toUpperCase();

  if ((name.includes("option") || args.option_id || args.option_instrument_id) && !config.enableOptionsTools) {
    return { ok: false, reason: "Options tools are disabled." };
  }

  if (symbol && leveragedSymbols.has(symbol) && !config.enableLeveragedEtps) {
    return { ok: false, reason: `${symbol} looks like a leveraged/inverse ETP and ENABLE_LEVERAGED_ETPS is false.` };
  }

  const notional = Number(args.notional || args.dollar_amount || args.amount || 0);
  if (Number.isFinite(notional) && notional > config.maxPositionNotionalUsd) {
    return {
      ok: false,
      reason: `Requested notional ${notional} exceeds MAX_POSITION_NOTIONAL_USD=${config.maxPositionNotionalUsd}.`
    };
  }

  return { ok: true, reason: "" };
}

export function confirmationPhrase(request) {
  const args = safeJsonParse(request.arguments);
  const symbol = String(args.symbol || args.ticker || args.underlying_symbol || "UNKNOWN").toUpperCase();
  const side = String(args.side || args.action || args.order_side || request.name || "ORDER").toUpperCase();
  return `APPROVE ${request.name} ${side} ${symbol}`;
}

export function safeJsonParse(value) {
  if (!value || typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
