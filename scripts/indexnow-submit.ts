// Usage:
//   npx tsx scripts/indexnow-submit.ts <url> [url...]
//   npx tsx scripts/indexnow-submit.ts --sitemap   (submits all /jobs/<id> URLs from the live sitemap)
import { submitToIndexNow, INDEXNOW_HOST } from "../src/lib/seo/indexnow";

async function main() {
  const args = process.argv.slice(2);
  let urls = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--sitemap")) {
    const xml = await (await fetch(`https://${INDEXNOW_HOST}/sitemap.xml`)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    urls = urls.concat(locs.filter((u) => /\/jobs\/[^/]+$/.test(u)));
  }
  if (urls.length === 0) {
    console.error("No URLs given.");
    process.exit(1);
  }
  const { status, submitted } = await submitToIndexNow(urls);
  console.log(`IndexNow HTTP ${status} for ${submitted} URL(s)`);
  if (status !== 200 && status !== 202) process.exit(1);
}

main();
