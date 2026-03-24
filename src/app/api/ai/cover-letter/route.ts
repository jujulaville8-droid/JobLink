import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DAILY_LIMIT = 2;
const TIMEZONE = "America/Antigua";

export async function POST(req: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Rate limit check — 2 per calendar day (Antigua time)
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", "cover_letter")
      .gte(
        "created_at",
        `${new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE })}T00:00:00-04:00`
      );

    if ((count ?? 0) >= DAILY_LIMIT) {
      return NextResponse.json(
        {
          error:
            "You've used your 2 Smart Cover Letters for today. Come back tomorrow for more.",
        },
        { status: 429 }
      );
    }

    // Fetch seeker profile
    const { data: profile } = await admin
      .from("seeker_profiles")
      .select(
        "first_name, last_name, bio, skills, experience_years, education"
      )
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Please complete your profile before using Smart Cover Letter." },
        { status: 400 }
      );
    }

    // Fetch job listing + company
    const { data: job } = await admin
      .from("job_listings")
      .select(
        "title, description, location, job_type, category, company_id, companies(company_name)"
      )
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const companyName =
      (job.companies as unknown as { company_name: string })?.company_name ??
      "the company";

    // Build prompt
    const systemPrompt = `Professional cover letter writer for Antigua & Barbuda job seekers. Rules: 150 words max. No dashes, em dashes, or hyphens between words. No bullet points. No generic phrases like "I am excited to apply" or "I believe I would be a great fit" or "I am writing to express my interest". Write in natural flowing sentences. Start with "Dear Hiring Manager," and end with "Sincerely, ${profile.first_name} ${profile.last_name}". Warm, professional tone. Match the candidate's real skills to the job.`;

    const skills = (profile.skills || []).slice(0, 5).join(", ");
    const desc = (job.description || "").slice(0, 500);

    const userPrompt = `Cover letter for: ${profile.first_name} ${profile.last_name}, ${profile.experience_years ?? 0}yr exp, skills: ${skills || "general"}, education: ${profile.education || "N/A"}. Applying to: ${job.title} at ${companyName}, ${job.location || "Antigua"}. Job: ${desc}`;

    // Call Claude Haiku
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Log usage
    await admin.from("ai_usage").insert({
      user_id: user.id,
      feature: "cover_letter",
    });

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[ai/cover-letter]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
