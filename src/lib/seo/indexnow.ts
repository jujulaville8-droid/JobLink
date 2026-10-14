// IndexNow (Bing, Yandex, etc.) URL submission. Server-side / script use only.
// The key is public by design: it is hosted at https://joblinkantigua.com/<key>.txt.
export const INDEXNOW_HOST = "joblinkantigua.com";
export const INDEXNOW_KEY = "dac26be346de80faca34d27954770ba9";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function buildIndexNowPayload(urls: string[]) {
  const urlList = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === INDEXNOW_HOST;
    } catch {
      return false;
    }
  });
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList };
}

export async function submitToIndexNow(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; submitted: number }> {
  const payload = buildIndexNowPayload(urls);
  if (payload.urlList.length === 0) return { status: 0, submitted: 0 };
  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, submitted: payload.urlList.length };
}
