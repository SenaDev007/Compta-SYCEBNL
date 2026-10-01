import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { consumeAuthLimit } from "../src/lib/auth/rate-limit";

test("la limite d’authentification bloque les tentatives excédentaires puis se réinitialise", () => {
  const scope = `test-${randomUUID()}`;
  assert.equal(consumeAuthLimit(scope, "192.0.2.1", "Alice@example.org", 2, 10_000, 1_000), null);
  assert.equal(consumeAuthLimit(scope, "192.0.2.1", "alice@example.org", 2, 10_000, 1_000), null);
  assert.equal(consumeAuthLimit(scope, "192.0.2.1", "alice@example.org", 2, 10_000, 1_000), 10);
  assert.equal(consumeAuthLimit(scope, "192.0.2.2", "alice@example.org", 2, 10_000, 1_000), null);
  assert.equal(consumeAuthLimit(scope, "192.0.2.1", "alice@example.org", 2, 10_000, 11_000), null);
});
