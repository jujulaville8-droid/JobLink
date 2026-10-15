import { describe, expect, it, vi } from "vitest";
import { buildIndexNowPayload, submitToIndexNow, INDEXNOW_KEY } from "@/lib/seo/indexnow";
import { readFileSync } from "node:fs";

describe("indexnow", () => {
  it("hosts the key file", () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
  it("dedupes and drops foreign hosts", () => {
    const p = buildIndexNowPayload(["https://joblinkantigua.com/jobs/1", "https://joblinkantigua.com/jobs/1", "https://evil.com/x"]);
    expect(p.urlList).toEqual(["https://joblinkantigua.com/jobs/1"]);
    expect(p.keyLocation).toBe(`https://joblinkantigua.com/${INDEXNOW_KEY}.txt`);
  });
  it("posts payload", async () => {
    const f = vi.fn().mockResolvedValue({ status: 202 });
    const r = await submitToIndexNow(["https://joblinkantigua.com/jobs/1"], f as unknown as typeof fetch);
    expect(r).toEqual({ status: 202, submitted: 1 });
    expect(JSON.parse(f.mock.calls[0][1].body).key).toBe(INDEXNOW_KEY);
  });
});
