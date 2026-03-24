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

    const body = (await req.json()) as { mode?: "preview" | "unlock"; jobTitle?: string };
    const { mode, jobTitle } = body;
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

    // Preview mode — generate and store, don't populate CV tables
    const { data: profile } = await admin
      .from("seeker_profiles")
      .select(
        "first_name, last_name, bio, skills, experience_years, education, location"
      )
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Please complete your profile first." },
        { status: 400 }
      );
    }

    const systemPrompt = `Generate a professional resume in JSON format for a job seeker in Antigua & Barbuda. Rules: No dashes or em dashes anywhere. No bullet points. Natural flowing descriptions. No generic filler like "results driven" or "team player". Be specific and realistic based on the candidate's actual background. Output valid JSON only, no markdown.`;

    const skills = (profile.skills || []).slice(0, 6).join(", ");
    const userPrompt = `Generate a resume JSON for: ${profile.first_name} ${profile.last_name}, ${profile.experience_years ?? 1} years experience, location: ${profile.location || "Antigua"}, skills: ${skills || "general"}, education: ${profile.education || "Secondary school"}, bio: ${(profile.bio || "").slice(0, 300)}.${jobTitle ? ` Target role: ${jobTitle}.` : ""}

Return this exact JSON structure:
{"summary":"2-3 sentence professional summary","experiences":[{"company_name":"realistic company","job_title":"title","location":"Antigua","start_date":"2024-01","end_date":null,"is_current":true,"description":"2-3 sentences about responsibilities"}],"education":[{"institution":"school name","degree":"degree","field_of_study":"field","start_date":"2020-01","end_date":"2024-06","is_current":false}],"skills":["skill1","skill2","skill3","skill4","skill5","skill6"]}

Generate 2-3 work experiences and 1-2 education entries. Make it realistic for Antigua.`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response (handle potential markdown wrapping)
    let resumeData: ResumeData;
    try {
      const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      resumeData = JSON.parse(jsonStr);
    } catch {
      console.error("[ai/resume] Failed to parse JSON:", raw);
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
