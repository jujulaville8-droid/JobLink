/**
 * Business Discovery Bot for JobLinks Antigua
 *
 * Shells out to Claude Code in headless mode (uses Max subscription, zero API cost),
 * asks Claude to research Antigua businesses that are currently hiring, then saves
 * results to the `discovered_businesses` review queue in Supabase.
 *
 * Usage:
 *   npm run discover
 *   npx tsx scripts/discover-businesses.ts
 *
 * Requirements:
 *   - Claude Code CLI installed and logged in (`claude login`)
 *   - .env.local with SUPABASE_* keys
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";

// ─── Env loading ──────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("[discover] .env.local not found — aborting");
  process.exit(1);
}
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ────────────────────────────────────────────────────────────────
interface DiscoveredBusiness {
  company_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  sector: string;
  location: string;
  role_hiring_for: string;
  source: "google" | "facebook" | "indeed" | "careers_page";
  source_url: string;
  evidence: string;
  confidence_score: number;
}

interface OutreachJsonEntry {
  email?: string;
}

// ─── Step 1: Build dedup email set ────────────────────────────────────────
async function buildExistingEmailSet(): Promise<Set<string>> {
  const emails = new Set<string>();

  // From outreach_log (all prior contacts)
  const { data: logRows } = await supabase
    .from("outreach_log")
    .select("email");
  for (const row of logRows ?? []) {
    if (row.email) emails.add(row.email.toLowerCase().trim());
  }

  // From existing companies table (already signed up)
  const { data: userRows } = await supabase
    .from("users")
    .select("email")
    .eq("role", "employer");
  for (const row of userRows ?? []) {
    if (row.email) emails.add(row.email.toLowerCase().trim());
  }

  // From the seeded outreach-data.json (original manual list)
  const jsonPath = resolve(
    process.cwd(),
    "src/app/api/admin/outreach/outreach-data.json"
  );
  if (existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as OutreachJsonEntry[];
      for (const entry of raw) {
        if (entry.email) emails.add(entry.email.toLowerCase().trim());
      }
    } catch (err) {
      console.warn("[discover] Failed to parse outreach-data.json:", err);
    }
  }

  // From discovered_businesses (previous runs)
  const { data: priorDiscoveries } = await supabase
    .from("discovered_businesses")
    .select("email");
  for (const row of priorDiscoveries ?? []) {
    if (row.email) emails.add(row.email.toLowerCase().trim());
  }

  return emails;
}

// ─── Step 2: Build the research prompt ────────────────────────────────────
function buildPrompt(excludeEmails: Set<string>): string {
  const excludeList = Array.from(excludeEmails).slice(0, 300).join(", ");

  return `You are a research agent for JobLinks Antigua, a job platform at joblinkantigua.com.

## Your Goal

Find Antigua & Barbuda businesses that have a POSTED, ACTIVE JOB VACANCY right now. We want to reach out and offer them a free employer account on our platform so they can post jobs and receive applications. The business qualifies ONLY IF we can find evidence of a real open role they are currently trying to fill.

## What "currently hiring" means

A valid result requires ALL THREE:
1. You found a specific job post, listing, or announcement (on a job board, careers page, Facebook post, news article, etc.)
2. The role is named (e.g. "Line Cook", "Accountant", "Housekeeping Supervisor")
3. Nothing on the page indicates the role is already filled, expired, or from years ago

If all you have is a company's general contact email with no vacancy info, DO NOT include it. We are not building an email list — we are building a list of employers who will benefit from our platform RIGHT NOW.

## Research process — you have a turn budget, use it wisely

You have approximately 50 tool calls available. Budget them carefully. Do not thrash between sources. Here is the recommended sequence:

### Phase 1 — Job boards (use ~15 turns here, highest ROI)
Job boards already prove active hiring, so start here.

1. WebSearch: "site:caribbeanjobs.com antigua"
2. WebFetch the caribbeanjobs.com search page for Antigua
3. For 3-5 promising listings, WebFetch the full listing page to extract role, company, evidence
4. WebSearch: "site:indeed.com antigua and barbuda"
5. WebFetch 3-5 Indeed listings for details

### Phase 2 — Recent hiring announcements (use ~10 turns)
6. WebSearch: "now hiring" antigua 2026
7. WebSearch: "antigua vacancy" 2026
8. Follow up on 2-3 of the most promising results with WebFetch

### Phase 3 — Careers pages (use ~10 turns)
9. WebFetch 2-3 of: jumbybayisland.com/careers, carlisle-bay.com/careers, curtainbluff.com/careers, hodgesbayresort.com/careers
10. Skip any that 404 or show no current openings

### Phase 4 — Antigua news / Facebook (optional, use remaining turns)
Only if you still need more results:
11. WebSearch: "hiring antigua" site:antiguaobserver.com
12. WebSearch: "hiring" site:antiguanewsroom.com

### STOP CRITERIA — CRITICAL
You MUST output the <result> JSON before turn 50. Ideally earlier.

Rules:
- As soon as you have 5 validated results, STOP researching and output the JSON.
- If you reach turn 30 and have any results at all, STOP and output what you have.
- If you reach turn 40 and have zero results, output an empty <result>[]</result> and explain in a comment why.
- You are NOT required to find 8+ results. 3-4 strong results is a successful run.
- Do not keep searching hoping to improve marginally. The review queue cares about QUALITY per lead, not lead count per run — we'll run this bot many times.
- Your final turn MUST output the <result>...</result> JSON. Do not end without it.

For each candidate before adding it, briefly reason:
- Does the page show an open vacancy? Quote it as evidence.
- Is it recent (within ~6 months)? If undated, note that in the evidence.
- Is it actually in Antigua (not somewhere else named "Antigua")?
- Is the company already in the exclude list? If so, skip it.

## Fields to extract per business

- company_name (required)
- email: The HR/careers/recruitment email the business actually uses for applications. See "Email Extraction" section below — this is important.
- phone: if visible on the listing
- website: main company site
- sector: hospitality, retail, construction, healthcare, food & beverage, etc.
- location: city or area in Antigua
- role_hiring_for: the actual role title from the listing (required — no generic "various positions")
- source: one of "google", "facebook", "indeed", "careers_page"
- source_url: the exact URL where you saw the vacancy
- evidence: a short direct quote from the listing showing they are actively hiring for this role (required — max ~200 chars)
- confidence_score: 1-10 on how confident you are the role is OPEN RIGHT NOW
  - 9-10: listed on a real job board with a recent date
  - 7-8: on their careers page, undated but looks current
  - 5-6: found a mention but can't verify it's still open
  - below 5: don't include it

## Email Extraction (IMPORTANT)

The most valuable email is the HR/careers email the company uses for actual applications. Job ads almost always include one. Look for patterns like:
- "Send your CV to hr@company.com"
- "Apply to careers@company.com"
- "Email applications to jobs@company.com"
- "Submit resume to recruitment@company.com"
- "Forward your application to hiring@company.com"
- "Email: hrmanager@company.com"

When you find a job listing:
1. READ THE FULL LISTING TEXT for any email address
2. Prefer HR-style emails in this order: hr@ > careers@ > jobs@ > recruitment@ > hiring@ > hrmanager@ > info@ > contact@
3. If the listing links to an application email, capture that exact address
4. If the listing only has a form or a phone number, mark email as null
5. If no listing email, try fetching the company website's "Contact" or "Careers" page to find one

Do NOT use generic guesses like "contact@[domain]" unless you actually saw that address on a real page. Fabricated emails are worse than null.

When you find an email, briefly note in the evidence quote WHERE you found it, e.g.: "Send CV to hr@islandgrill.ag — from the Indeed listing body"

## Exclusion list

DO NOT include any business whose email is in this list (they've already been contacted):
${excludeList || "(no exclusions yet)"}

Also skip any obvious company name matches from that list.

## Output format

Return a JSON array ONLY, wrapped in <result> tags. No markdown, no commentary.

<result>
[
  {
    "company_name": "Example Restaurant",
    "email": "hr@example.com",
    "phone": "268-555-1234",
    "website": "https://example.com",
    "sector": "Food & Beverage",
    "location": "St. John's",
    "role_hiring_for": "Line Cook",
    "source": "indeed",
    "source_url": "https://indeed.com/viewjob?jk=abc123",
    "evidence": "We are seeking an experienced Line Cook to join our kitchen team in St. John's. Competitive salary.",
    "confidence_score": 9
  }
]
</result>

## Rules

- Stop when you have 8-12 STRONG results. Quality over quantity.
- A result with no evidence quote is invalid and must not be included.
- If you cannot find 8, return fewer. Do NOT pad the list with speculation.
- Do NOT invent businesses or fabricate evidence. If you cannot quote the listing, skip it.
- Focus on businesses likely to benefit from JobLinks — local Antigua SMBs, hotels, restaurants, retail, construction, professional services. Skip multinational corporations that already have mature hiring pipelines.`;
}

// ─── Step 3: Run Claude Code in headless mode ─────────────────────────────
function runClaudeHeadless(prompt: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(
      `[discover] Spawning claude -p (prompt: ${prompt.length} chars, ~${Math.round(prompt.length / 4)} tokens)...`
    );

    // Pass the prompt via stdin to avoid ARG_MAX / shell escaping issues.
    // Uses Sonnet to keep Max quota consumption lower — this task is
    // search + structured extraction, which Sonnet handles just as well.
    const proc = spawn(
      "claude",
      [
        "-p",
        "--model",
        "sonnet",
        "--max-turns",
        "100",
        "--allowed-tools",
        "WebSearch,WebFetch",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    proc.on("error", (err) => rejectPromise(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `claude exited with code ${code}\n--- stderr ---\n${stderr || "(empty)"}\n--- stdout ---\n${stdout.slice(0, 1500) || "(empty)"}`
          )
        );
        return;
      }
      resolvePromise(stdout);
    });

    // Write the prompt to stdin and close it so Claude knows input is done
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ─── Step 4: Parse Claude's output ────────────────────────────────────────
function parseClaudeOutput(raw: string): DiscoveredBusiness[] {
  // Try <result>...</result> wrapper first
  const wrapped = raw.match(/<result>([\s\S]*?)<\/result>/);
  let jsonText: string | null = null;

  if (wrapped) {
    jsonText = wrapped[1].trim();
  } else {
    // Fallback: try to find the first [...] block
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonText = arrayMatch[0];
  }

  if (!jsonText) {
    console.error("[discover] Could not locate JSON in Claude output");
    console.error("[discover] Raw output:", raw.slice(0, 2000));
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      console.error("[discover] Parsed JSON is not an array");
      return [];
    }
    return parsed as DiscoveredBusiness[];
  } catch (err) {
    console.error("[discover] JSON parse error:", err);
    console.error("[discover] Attempted to parse:", jsonText.slice(0, 1000));
    return [];
  }
}

// ─── Step 5: Insert into Supabase ─────────────────────────────────────────
async function insertDiscoveries(
  discoveries: DiscoveredBusiness[],
  excludeEmails: Set<string>
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const biz of discoveries) {
    const normalizedEmail = biz.email?.toLowerCase().trim() || null;

    // Double-check against exclude set (Claude may have ignored the instruction)
    if (normalizedEmail && excludeEmails.has(normalizedEmail)) {
      skipped++;
      console.log(`[discover] Skip (already contacted): ${biz.company_name}`);
      continue;
    }

    const { error } = await supabase.from("discovered_businesses").insert({
      company_name: biz.company_name,
      email: normalizedEmail,
      phone: biz.phone || null,
      website: biz.website || null,
      sector: biz.sector || null,
      location: biz.location || null,
      role_hiring_for: biz.role_hiring_for || null,
      source: biz.source,
      source_url: biz.source_url || null,
      evidence: biz.evidence || null,
      confidence_score: biz.confidence_score ?? null,
      status: "pending_review",
    });

    if (error) {
      console.error(`[discover] Insert failed for ${biz.company_name}:`, error.message);
      continue;
    }

    inserted++;
    console.log(
      `[discover] + ${biz.company_name} (${biz.sector}, score ${biz.confidence_score})`
    );
  }

  return { inserted, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("[discover] Starting business discovery run...");

  const excludeEmails = await buildExistingEmailSet();
  console.log(`[discover] Loaded ${excludeEmails.size} existing emails to exclude`);

  const prompt = buildPrompt(excludeEmails);

  const claudeOutput = await runClaudeHeadless(prompt);
  const discoveries = parseClaudeOutput(claudeOutput);

  console.log(`[discover] Claude returned ${discoveries.length} candidates`);

  if (discoveries.length === 0) {
    console.log("[discover] Nothing to insert. Exiting.");
    console.log("\n--- CLAUDE RAW OUTPUT (last 3000 chars) ---");
    console.log(claudeOutput.slice(-3000));
    console.log("--- END CLAUDE RAW OUTPUT ---");
    return;
  }

  const { inserted, skipped } = await insertDiscoveries(discoveries, excludeEmails);

  console.log("\n========================================");
  console.log(`[discover] Summary:`);
  console.log(`  Candidates returned: ${discoveries.length}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(
    `\n  Review in Supabase Studio:`
  );
  console.log(
    `  select * from discovered_businesses where status = 'pending_review' order by confidence_score desc;`
  );
  console.log("========================================");
}

main().catch((err) => {
  console.error("[discover] Fatal error:", err);
  process.exit(1);
});
