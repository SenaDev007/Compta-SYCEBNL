import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createEmptyWorkspace } from "../src/lib/accounting/types";
import {
  createOfflineCipher,
  openOfflineAccount,
  saveOfflineWorkspace,
} from "../src/lib/offline-vault";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

const user = { id: "offline-user-test", email: "  Comptable@Test.org " };
const password = "MotDePasse-de-test-2026";
const secretProjectName = "Projet confidentiel de démonstration";

function testWorkspace() {
  const workspace = createEmptyWorkspace();
  workspace.projects = [
    {
      id: "offline-project-test",
      code: "PROJ-TEST-01",
      title: secretProjectName,
      partner: "Partenaire de test",
      organization: "Association de test",
      highlights: "Notes de test",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      budgetLines: [],
    },
  ];
  return workspace;
}

async function readStoredRecord(email: string) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("compta-sycebnl-vault", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const record = await new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction("profiles", "readonly");
    const request = transaction.objectStore("profiles").get(email);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return record;
}

test("la copie hors connexion est chiffrée et ne peut être ouverte qu’avec le bon mot de passe", async () => {
  const workspace = testWorkspace();
  const cipher = await createOfflineCipher(password);
  await saveOfflineWorkspace(user, workspace, 3, false, cipher);

  const stored = await readStoredRecord("comptable@test.org");
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).includes(secretProjectName), false);
  assert.equal(JSON.stringify(stored).includes("Partenaire de test"), false);

  const unlocked = await openOfflineAccount("comptable@test.org", password);
  assert.equal(unlocked.status, "ok");
  if (unlocked.status !== "ok") return;
  assert.equal(unlocked.user.id, user.id);
  assert.equal(unlocked.version, 3);
  assert.equal(unlocked.dirty, false);
  assert.equal(unlocked.requiresConflict, false);
  assert.equal(unlocked.workspace.projects[0].title, secretProjectName);

  const rejected = await openOfflineAccount("comptable@test.org", "mauvais-mot-de-passe");
  assert.equal(rejected.status, "invalid");
});

test("les changements hors connexion et une comparaison en attente sont conservés après fermeture", async () => {
  const workspace = testWorkspace();
  workspace.projects[0].highlights = "Modification non transmise";
  const cipher = await createOfflineCipher(password);
  await saveOfflineWorkspace(user, workspace, 8, true, cipher, true);

  const reopened = await openOfflineAccount(" COMPTABLE@test.org ", password);
  assert.equal(reopened.status, "ok");
  if (reopened.status !== "ok") return;
  assert.equal(reopened.version, 8);
  assert.equal(reopened.dirty, true);
  assert.equal(reopened.requiresConflict, true);
  assert.equal(reopened.workspace.projects[0].highlights, "Modification non transmise");
});
