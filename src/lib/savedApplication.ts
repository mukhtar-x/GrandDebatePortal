/**
 * Remembers the latest application on this device so the portal can fill in the lookup form.
 * Only the application ID and contact email are stored, and only the most recent one.
 */
const STORAGE_KEY = "tgd26-last-application";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface SavedApplication {
  applicationId: string;
  email: string;
}

export function saveApplication(application: SavedApplication) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...application, savedAt: Date.now() }));
  } catch {
    // Storage can be unavailable (private browsing); the portal then starts empty.
  }
}

export function readSavedApplication(): SavedApplication | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as
      | (SavedApplication & { savedAt?: number })
      | null;
    if (!stored || typeof stored.applicationId !== "string" || typeof stored.email !== "string") return null;
    if (!stored.savedAt || Date.now() - stored.savedAt > MAX_AGE_MS) {
      forgetSavedApplication();
      return null;
    }
    return { applicationId: stored.applicationId, email: stored.email };
  } catch {
    return null;
  }
}

export function forgetSavedApplication() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}
