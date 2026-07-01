import { config } from "./config.mjs";
import { runAgent } from "./agent.mjs";

const prompt = `
Run one monitor tick for the Robinhood Agentic account.

Check portfolio value, buying power, open positions, open orders, today's realized P/L, and current quotes for ${config.watchlist.join(", ")}.

Do not place orders. If there is no high-quality setup within risk limits, say "NO TRADE" clearly. If there is a setup worth watching, provide the exact trigger, invalidation, target, order style, and max notional below $${config.maxPositionNotionalUsd}.
`.trim();

async function tick() {
  console.log(`\n=== ${new Date().toLocaleString()} monitor tick ===`);
  const response = await runAgent(prompt);
  console.log(response.output_text || JSON.stringify(response.output, null, 2));
}

while (true) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, config.pollSeconds * 1000));
}
