import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { audit } from "./audit.mjs";
import { confirmationPhrase, localPreflightApprovalCheck } from "./safety.mjs";

export async function decideApproval(request) {
  const check = localPreflightApprovalCheck(request);
  if (!check.ok) {
    await audit("approval_denied_preflight", { request, reason: check.reason });
    console.log(`Denied ${request.name}: ${check.reason}`);
    return false;
  }

  const phrase = confirmationPhrase(request);
  console.log("\nMCP approval requested:");
  console.log(`Tool: ${request.name}`);
  console.log(`Arguments: ${request.arguments || "{}"}`);
  console.log(`Type exactly this phrase to approve: ${phrase}`);

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("> ");
    const approved = answer.trim() === phrase;
    await audit(approved ? "approval_granted" : "approval_denied_user", {
      request,
      expectedPhrase: phrase
    });
    return approved;
  } finally {
    rl.close();
  }
}
