import test from "node:test";
import assert from "node:assert/strict";
import { confirmationPhrase, localPreflightApprovalCheck } from "../src/safety.mjs";

test("confirmation phrase is deterministic", () => {
  const phrase = confirmationPhrase({
    name: "place_equity_order",
    arguments: JSON.stringify({ symbol: "MU", side: "buy" })
  });
  assert.equal(phrase, "APPROVE place_equity_order BUY MU");
});

test("local preflight allows ordinary equity within notional limit", () => {
  const result = localPreflightApprovalCheck({
    name: "place_equity_order",
    arguments: JSON.stringify({ symbol: "MU", side: "buy", notional: 50 })
  });
  assert.equal(result.ok, true);
});

test("local preflight blocks oversized notional", () => {
  const result = localPreflightApprovalCheck({
    name: "place_equity_order",
    arguments: JSON.stringify({ symbol: "MU", side: "buy", notional: 100000 })
  });
  assert.equal(result.ok, false);
});

test("local preflight blocks leveraged ETPs by default", () => {
  const result = localPreflightApprovalCheck({
    name: "place_equity_order",
    arguments: JSON.stringify({ symbol: "SOXL", side: "buy", notional: 50 })
  });
  assert.equal(result.ok, false);
});
