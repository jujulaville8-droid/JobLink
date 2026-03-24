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
        "title, description, requirements, location, job_type, company_id, companies(company_name)"
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
    const systemPrompt = `You are a professional cover letter writer for job seekers in Antigua & Barbuda. Write concise, genuine cover letters (150-200 words). Be specific — match the candidate's actual skills and experience to the job requirements. Do not use generic filler phrases like "I am excited to apply" or "I believe I would be a great fit." Start with "Dear Hiring Manager," and end with "Sincerely, ${profile.first_name} ${profile.last_name}". Write in a warm but professional Caribbean English tone.`;

    const userPrompt = `Write a cover letter for this candidate applying to this job.

CANDIDATE:
- Name: ${profile.first_name} ${profile.last_name}
- Skills: ${(profile.skills || []).join(", ") || "Not specified"}
- Experience: ${profile.experience_years ?? "Not specified"} years
- Education: ${profile.education || "Not specified"}
- About: ${profile.bio || "Not specified"}

JOB:
- Title: ${job.title}
- Company: ${companyName}
- Description: ${job.description || "Not provided"}
- Requirements: ${job.requirements || "Not provided"}
- Location: ${job.location || "Antigua"}
- Type: ${job.job_type || "Not specified"}`;

    // Call Claude Haiku
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
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
