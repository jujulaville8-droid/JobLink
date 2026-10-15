export const APPLICATION_DRAFT_MAX_LENGTH = 2000;
export const APPLICATION_DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const APPLICATION_DRAFT_CHANGED = "joblink:application-drafts-changed";
const PREFIX = "joblink.application-draft.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ApplicationDraft {
  version: 1;
  userId: string;
  jobId: string;
  coverLetter: string;
  savedAt: number;
  expiresAt: number;
}

function keyFor(userId: string, jobId: string) {
  return UUID.test(userId) && UUID.test(jobId)
    ? `${PREFIX}${userId.toLowerCase()}:${jobId.toLowerCase()}`
    : null;
}

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(APPLICATION_DRAFT_CHANGED));
}

function parseDraft(raw: string | null, userId: string, jobId: string, now: number): ApplicationDraft | null {
  if (!raw || raw.length > 16000) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || value.userId !== userId.toLowerCase() || value.jobId !== jobId.toLowerCase()
      || typeof value.coverLetter !== "string" || !value.coverLetter.trim()
      || value.coverLetter.length > APPLICATION_DRAFT_MAX_LENGTH
      || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0 || value.savedAt > now + 60000
      || value.expiresAt !== value.savedAt + APPLICATION_DRAFT_LIFETIME_MS || value.expiresAt <= now) return null;
    // Return only the supported fields. Stored browser data is untrusted.
    return { version: 1, userId: value.userId, jobId: value.jobId, coverLetter: value.coverLetter,
      savedAt: value.savedAt, expiresAt: value.expiresAt };
  } catch { return null; }
}

/** Reading never restores text into a form or extends the draft's lifetime. */
export function readApplicationDraft(userId: string, jobId: string, now = Date.now()): ApplicationDraft | null {
  const key = keyFor(userId, jobId);
  if (!key) return null;
  try { return parseDraft(storage()?.getItem(key) ?? null, userId, jobId, now); }
  catch { return null; }
}

/** Call only after the user explicitly chooses to save on this device. */
export function saveApplicationDraft(userId: string, jobId: string, coverLetter: string, now = Date.now()): boolean {
  const key = keyFor(userId, jobId);
  if (!key || !coverLetter.trim() || coverLetter.length > APPLICATION_DRAFT_MAX_LENGTH) return false;
  const draft: ApplicationDraft = { version: 1, userId: userId.toLowerCase(), jobId: jobId.toLowerCase(),
    coverLetter, savedAt: now, expiresAt: now + APPLICATION_DRAFT_LIFETIME_MS };
  if (!parseDraft(JSON.stringify(draft), userId, jobId, now)) return false;
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(key, JSON.stringify(draft));
    changed();
    return true;
  } catch { return false; }
}

export function deleteApplicationDraft(userId: string, jobId: string): boolean {
  const key = keyFor(userId, jobId);
  if (!key) return false;
  try {
    const target = storage();
    if (!target) return false;
    target.removeItem(key);
    changed();
    return true;
  } catch { return false; }
}

/** At session changes, remove other accounts' drafts and expired/invalid entries.
 * Passing null removes this feature's drafts on sign-out. No other storage is touched.
 * Expired bytes are removed on the next visit; expiry never depends on a background browser job.
 */
export function cleanApplicationDrafts(activeUserId: string | null, now = Date.now()): boolean {
  try {
    const target = storage();
    if (!target) return false;
    const keys = Array.from({ length: target.length }, (_, i) => target.key(i))
      .filter((key): key is string => !!key?.startsWith(PREFIX));
    let removed = false;
    for (const key of keys) {
      const [userId, jobId, extra] = key.slice(PREFIX.length).split(":");
      if (!activeUserId || userId !== activeUserId.toLowerCase() || extra !== undefined
        || !keyFor(userId ?? "", jobId ?? "")
        || !parseDraft(target.getItem(key), userId, jobId, now)) {
        target.removeItem(key);
        removed = true;
      }
    }
    if (removed) changed();
    return true;
  } catch { return false; }
}
