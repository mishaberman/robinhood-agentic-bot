import "dotenv/config";

const parseNumber = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
};

const parseBoolean = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

const parseWatchlist = () => {
  const raw =
    process.env.WATCHLIST ??
    "MU,WDC,SNDK,STX,HON,STM,ASML,MRVL,NBIS,APLD,NVDA,AMD,AVGO,DELL,HPQ,HPE,SMH";
  return raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
};

export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-5.5",
  robinhoodMcpUrl: process.env.ROBINHOOD_MCP_URL || "https://agent.robinhood.com/mcp/trading",
  robinhoodOAuthAccessToken: process.env.ROBINHOOD_OAUTH_ACCESS_TOKEN || "",
  pollSeconds: parseNumber("POLL_SECONDS", 30),
  enableRealOrderTools: parseBoolean("ENABLE_REAL_ORDER_TOOLS", false),
  enableOptionsTools: parseBoolean("ENABLE_OPTIONS_TOOLS", false),
  enableLeveragedEtps: parseBoolean("ENABLE_LEVERAGED_ETPS", false),
  targetAccountHint: process.env.TARGET_ACCOUNT_HINT || "Agentic",
  startingCapitalUsd: parseNumber("STARTING_CAPITAL_USD", 2000),
  targetValueUsd: parseNumber("TARGET_VALUE_USD", 3000),
  maxPositionNotionalUsd: parseNumber("MAX_POSITION_NOTIONAL_USD", 250),
  maxTotalExposureUsd: parseNumber("MAX_TOTAL_EXPOSURE_USD", 1500),
  maxDailyLossUsd: parseNumber("MAX_DAILY_LOSS_USD", 60),
  maxTradesPerDay: parseNumber("MAX_TRADES_PER_DAY", 8),
  maxSingleTradeLossUsd: parseNumber("MAX_SINGLE_TRADE_LOSS_USD", 15),
  watchlist: parseWatchlist()
};

export function assertRuntimeConfig() {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required. Copy .env.example to .env and fill it in.");
  }
}
