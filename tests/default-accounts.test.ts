import test from "node:test";
import assert from "node:assert/strict";
import { installMapAfriqueDefaults } from "../src/lib/accounting/default-accounts";
import { MAP_AFRIQUE_ACCOUNTS } from "../src/lib/accounting/map-afrique-accounts";
import { createEmptyWorkspace } from "../src/lib/accounting/types";

test("le référentiel MAP Afrique contient des numéros uniques et des libellés exploitables", () => {
  const numbers = MAP_AFRIQUE_ACCOUNTS.map((account) => account.number);
  assert.equal(MAP_AFRIQUE_ACCOUNTS.length, 1130);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(
    MAP_AFRIQUE_ACCOUNTS.every((account) => account.label.length > 0 && account.source === "map"),
  );
  const freshWorkspace = createEmptyWorkspace();
  assert.equal(freshWorkspace.accounts.length, MAP_AFRIQUE_ACCOUNTS.length);
  assert.ok(freshWorkspace.accounts.every((account) => account.source === "map"));
  assert.equal(freshWorkspace.entries.length, 0);
  assert.equal(
    MAP_AFRIQUE_ACCOUNTS.find((account) => account.number === "1011")?.label,
    "en numéraire",
  );
  assert.equal(
    MAP_AFRIQUE_ACCOUNTS.some((account) => account.number === "741"),
    false,
  );
  assert.ok(MAP_AFRIQUE_ACCOUNTS.some((account) => account.number === "713"));
  assert.ok(
    MAP_AFRIQUE_ACCOUNTS.some(
      (account) => account.number === "914" && account.label === "Bénévolat",
    ),
  );
});

test("la mise à jour remplace les anciens exemples et conserve les comptes utilisés ou personnels", () => {
  const workspace = createEmptyWorkspace();
  workspace.accounts = [
    { number: "101", label: "Ancien libellé fictif", source: "demo" },
    { number: "999999", label: "Ancien compte inutilisé", source: "demo" },
    { number: "999998", label: "Ancien compte utilisé", source: "demo" },
    { number: "521", label: "Libellé importé par l’association", source: "import" },
    { number: "888888", label: "Compte personnel", source: "custom" },
  ];
  workspace.entries.push({
    id: "entry-1",
    date: "2026-02-10",
    journal: "AC",
    reference: "ACH-01",
    label: "Achat",
    lines: [{ id: "line-1", accountNumber: "999998", debit: 10, credit: 0 }],
    createdAt: "2026-02-10T10:00:00.000Z",
  });

  const migrated = installMapAfriqueDefaults(workspace);
  assert.equal(migrated.accounts.length, MAP_AFRIQUE_ACCOUNTS.length + 2);
  assert.equal(migrated.accounts.find((account) => account.number === "101")?.source, "map");
  assert.equal(
    migrated.accounts.find((account) => account.number === "101")?.label,
    MAP_AFRIQUE_ACCOUNTS.find((account) => account.number === "101")?.label,
  );
  assert.equal(
    migrated.accounts.some((account) => account.number === "999999"),
    false,
  );
  assert.equal(migrated.accounts.find((account) => account.number === "999998")?.source, "custom");
  assert.equal(
    migrated.accounts.find((account) => account.number === "521")?.label,
    "Libellé importé par l’association",
  );
  assert.equal(migrated.accounts.find((account) => account.number === "888888")?.source, "custom");
  assert.equal(workspace.accounts[0]?.label, "Ancien libellé fictif");
});

test("les espaces déjà mis à jour ne sont pas modifiés de nouveau", () => {
  const workspace = createEmptyWorkspace();
  assert.equal(installMapAfriqueDefaults(workspace), workspace);
});
