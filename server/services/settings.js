import { DEFAULT_SETTINGS, formatMinutes, minutesFromHHMM } from "../../src/lib/campus.js";
import { appSettings } from "../db/schema.js";

let cached = null;
let cachedAt = 0;

export function clearSettingsCache() {
  cached = null;
}

export async function getSettings(db) {
  if (cached && Date.now() - cachedAt < 15000) return cached;
  const rows = await db.select().from(appSettings);
  const values = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    if (typeof DEFAULT_SETTINGS[row.key] === "number") {
      const number = Number(row.value);
      if (Number.isFinite(number)) values[row.key] = number;
    } else {
      values[row.key] = row.value;
    }
  }
  if (minutesFromHHMM(values.lateAfter) === null) values.lateAfter = DEFAULT_SETTINGS.lateAfter;
  cached = values;
  cachedAt = Date.now();
  return values;
}

export async function saveSettings(db, patch, userId) {
  const now = new Date();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    await db
      .insert(appSettings)
      .values({ key, value: String(value), updatedAt: now, updatedBy: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value), updatedAt: now, updatedBy: userId } });
  }
  clearSettingsCache();
  return getSettings(db);
}

export function describeSettings(settings) {
  return { ...settings, lateAfterLabel: formatMinutes(minutesFromHHMM(settings.lateAfter)) };
}
