import test from "node:test";
import assert from "node:assert/strict";
import { displayNameFromEmail, greetingForHour } from "../src/lib/greeting";

test("le salut suit les périodes locales de la journée", () => {
  assert.equal(greetingForHour(0), "Bonsoir");
  assert.equal(greetingForHour(4), "Bonsoir");
  assert.equal(greetingForHour(5), "Bonjour");
  assert.equal(greetingForHour(6), "Bonjour");
  assert.equal(greetingForHour(11), "Bonjour");
  assert.equal(greetingForHour(12), "Bon après-midi");
  assert.equal(greetingForHour(17), "Bon après-midi");
  assert.equal(greetingForHour(18), "Bonsoir");
  assert.equal(greetingForHour(23), "Bonsoir");
});

test("le nom affiché est extrait et mis en forme depuis l’adresse courriel", () => {
  assert.equal(displayNameFromEmail("fatou.diallo+compta@example.org"), "Fatou Diallo");
  assert.equal(displayNameFromEmail("jean_dupont@example.org"), "Jean Dupont");
  assert.equal(displayNameFromEmail("@example.org"), "Votre espace");
});

test("une heure invalide est refusée", () => {
  assert.throws(() => greetingForHour(24), RangeError);
});
