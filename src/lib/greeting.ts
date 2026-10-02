export type DayGreeting = "Bonjour" | "Bon après-midi" | "Bonsoir";

export function greetingForHour(hour: number): DayGreeting {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError("L’heure doit être comprise entre 0 et 23.");
  }
  if (hour < 5) return "Bonsoir";
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function displayNameFromEmail(email: string): string {
  const localPart = email.trim().split("@", 1)[0]?.split("+", 1)[0] ?? "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "Votre espace";
  return words.map((word) => word.charAt(0).toLocaleUpperCase("fr-FR") + word.slice(1)).join(" ");
}
