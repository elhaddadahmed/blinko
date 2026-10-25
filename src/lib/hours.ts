export const DAYS = [
  ["mo", "Montag"],
  ["di", "Dienstag"],
  ["mi", "Mittwoch"],
  ["do", "Donnerstag"],
  ["fr", "Freitag"],
  ["sa", "Samstag"],
  ["so", "Sonntag"],
] as const;

export type Hours = Record<string, string>;

/** Liest das jsonb-Feld defensiv: nur bekannte Tage, nur Text, max. 40 Zeichen. */
export function parseHours(value: unknown): Hours {
  const result: Hours = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return result;
  }
  for (const [key] of DAYS) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry === "string" && entry.trim()) {
      result[key] = entry.trim().slice(0, 40);
    }
  }
  return result;
}
