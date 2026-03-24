import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ResumeData {
  summary: string;
  experiences: {
    company_name: string;
    job_title: string;
    location: string;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    description: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
  }[];
  skills: string[];
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      mode?: "preview" | "unlock";
      intake?: {
        targetRole: string;
        yearsExperience: number;
        pastRoles: string;
        topSkills: string;
        education: string;
      };
    };
    const { mode, intake } = body;
    const admin = createAdminClient();

    // If unlocking, check purchase and move preview data to CV tables
    if (mode === "unlock") {
      const { data: purchase } = await admin
        .from("ai_purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("feature", "smart_resume")
        .maybeSingle();

      if (!purchase) {
        return NextResponse.json(
          { error: "Purchase not found. Please complete payment first." },
          { status: 403 }
        );
      }

      // Get preview data
      const { data: preview } = await admin
        .from("ai_resume_previews")
        .select("preview_data")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!preview) {
        return NextResponse.json(
          { error: "No preview found. Please generate a preview first." },
          { status: 404 }
        );
      }

      const resumeData = preview.preview_data as ResumeData;
      await populateCvTables(admin, user.id, resumeData);

      // Clean up preview
      await admin
        .from("ai_resume_previews")
        .delete()
        .eq("user_id", user.id);

      return NextResponse.json({ success: true });
    }

    // Preview mode — generate from intake data
    if (!intake || !intake.targetRole) {
      return NextResponse.json(
        { error: "Please complete the intake form first." },
        { status: 400 }
      );
    }

    // Also fetch profile for name and contact info
    const { data: profile } = await admin
      .from("seeker_profiles")
      .select("first_name, last_name, location")
      .eq("user_id", user.id)
      .single();

    const name = profile
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      : "Candidate";

    const systemPrompt = `You are an expert resume writer. Generate a resume in JSON format. Follow these rules strictly:

SUMMARY: 2-3 sentences. No first person pronouns. Lead with target job title and years of experience. Include one quantified achievement. No generic phrases like "hardworking professional", "team player", "seeking opportunities", "results driven", or "detail oriented".

WORK EXPERIENCE: Each entry has a description of 2-3 sentences. Every sentence must start with a strong action verb (Spearheaded, Streamlined, Cultivated, Negotiated, Orchestrated, Expanded, Reduced, Accelerated). Never use "Responsible for", "Managed", "Handled", "Assisted", or "Helped". Include specific numbers, percentages, or metrics in every description. Show impact and outcomes, not daily duties.

SKILLS: 8-10 skills. 60% hard/technical skills, 40% substantive soft skills. No generic skills like "team player", "hard worker", "computer skills". Include specific tools, methodologies, or certifications.

EDUCATION: Use real Antiguan or Caribbean institutions when the candidate is from the region.

FORMAT: Output valid JSON only. No markdown. No dashes or em dashes anywhere. No bullet points. Use commas and periods only.`;

    const userPrompt = `Generate a professional resume JSON for:
Name: ${name}
Target Role: ${intake.targetRole}
Years of Experience: ${intake.yearsExperience}
Past Roles/Companies: ${intake.pastRoles}
Key Skills: ${intake.topSkills}
Education: ${intake.education}
Location: ${profile?.location || "Antigua"}

Return exactly this JSON structure:
{"summary":"professional summary here","experiences":[{"company_name":"company","job_title":"title","location":"location","start_date":"YYYY-MM","end_date":null,"is_current":true,"description":"achievement focused description with metrics"}],"education":[{"institution":"school","degree":"degree","field_of_study":"field","start_date":"YYYY-MM","end_date":"YYYY-MM","is_current":false}],"skills":["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8"]}

Generate 2-3 work experiences based on their past roles. Generate 1-2 education entries. Use realistic Caribbean companies and institutions. Every experience description must contain at least one number or percentage.`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response — handle markdown wrapping, extra text, etc.
    let resumeData: ResumeData;
    try {
      // Strip markdown fences
      let jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      // Find the first { and last } to extract JSON even if there's surrounding text
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
      resumeData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[ai/resume] Failed to parse JSON. Raw response:", raw);
      console.error("[ai/resume] Parse error:", parseErr);
      return NextResponse.json(
        { error: "Failed to generate resume. Please try again." },
        { status: 500 }
      );
    }

    // Store preview
    await admin.from("ai_resume_previews").upsert(
      {
        user_id: user.id,
        preview_data: resumeData as unknown as Record<string, unknown>,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Log usage
    await admin.from("ai_usage").insert({
      user_id: user.id,
      feature: "smart_resume_preview",
    });

    return NextResponse.json({ preview: resumeData });
  } catch (err) {
    console.error("[ai/resume]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

async function populateCvTables(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  data: ResumeData
) {
  // Ensure cv_profile exists
  let { data: cvProfile } = await admin
    .from("cv_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cvProfile) {
    const { data: created } = await admin
      .from("cv_profiles")
      .insert({ user_id: userId })
      .select("id")
      .single();
    cvProfile = created;
  }

  if (!cvProfile) return;

  const profileId = cvProfile.id;

  // Update summary
  await admin
    .from("cv_profiles")
    .update({ summary: data.summary })
    .eq("id", profileId);

  // Clear existing data and insert new
  await Promise.all([
    admin.from("cv_work_experiences").delete().eq("cv_profile_id", profileId),
    admin.from("cv_education").delete().eq("cv_profile_id", profileId),
    admin.from("cv_skills").delete().eq("cv_profile_id", profileId),
  ]);

  // Insert experiences
  if (data.experiences?.length) {
    await admin.from("cv_work_experiences").insert(
      data.experiences.map((exp, i) => ({
        cv_profile_id: profileId,
        company_name: exp.company_name,
        job_title: exp.job_title,
        location: exp.location || "Antigua",
        start_date: exp.start_date,
        end_date: exp.end_date,
        is_current: exp.is_current ?? false,
        description: exp.description,
        sort_order: i,
      }))
    );
  }

  // Insert education
  if (data.education?.length) {
    await admin.from("cv_education").insert(
      data.education.map((edu, i) => ({
        cv_profile_id: profileId,
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
        start_date: edu.start_date,
        end_date: edu.end_date,
        is_current: edu.is_current ?? false,
        sort_order: i,
      }))
    );
  }

  // Insert skills
  if (data.skills?.length) {
    await admin.from("cv_skills").insert(
      data.skills.map((name, i) => ({
        cv_profile_id: profileId,
        name,
        sort_order: i,
      }))
    );
  }

  // Recalculate completion
  const { calculateCvCompletion } = await import("@/lib/cv-completion");
  const { fetchFullCv } = await import("@/lib/cv-helpers");
  const cv = await fetchFullCv(userId, true);
  if (cv) {
    const { percentage } = calculateCvCompletion(cv);
    await admin
      .from("cv_profiles")
      .update({ completion_percentage: percentage })
      .eq("user_id", userId);
  }
}
