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
  languages?: { name: string; proficiency: string }[];
  projects?: { title: string; role: string; description: string }[];
  volunteer?: { organization: string; role: string; description: string }[];
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

    const systemPrompt = `You are an elite resume writer who creates resumes that get interviews. Generate a comprehensive resume in JSON format. Follow these rules:

SUMMARY: 3 sentences. No first person. Formula: [Title] with [X] years in [domain]. [Quantified achievement]. [Key value proposition]. No generic phrases (hardworking, team player, seeking opportunities, results driven, detail oriented, passionate).

WORK EXPERIENCE: 3 entries minimum. Each description is 3-4 sentences. Every sentence starts with a power verb: Spearheaded, Streamlined, Cultivated, Negotiated, Orchestrated, Expanded, Accelerated, Transformed, Pioneered, Redesigned, Consolidated, Maximized. NEVER use: Responsible for, Managed, Handled, Assisted, Helped, Worked on. Every description MUST have 2+ specific metrics (percentages, dollar amounts, team sizes, time saved, volume processed). Show outcomes and impact, never daily duties.

SKILLS: 10 skills. 6 hard/technical, 4 substantive soft. No generic (team player, hard worker, computer skills, Microsoft Office). Include specific tools, systems, methodologies, and certifications relevant to the role.

EDUCATION: Use real Caribbean institutions (Antigua State College, University of the West Indies, Antigua and Barbuda Institute of Continuing Education, CFBC) when appropriate.

LANGUAGES: Include English as Native plus any other Caribbean languages (Spanish, French Creole) at realistic proficiency levels.

PROJECTS: 1-2 relevant projects with specific outcomes and metrics.

VOLUNTEER: 1 community involvement entry relevant to Antigua/Caribbean.

FORMAT: Valid JSON only. No markdown fences. No dashes or em dashes. No bullet points. Commas and periods only. No text before or after the JSON object.`;

    const userPrompt = `Create a world class resume JSON for:
Name: ${name}
Target Role: ${intake.targetRole}
Years of Experience: ${intake.yearsExperience}
Past Roles/Companies: ${intake.pastRoles}
Key Skills: ${intake.topSkills}
Education: ${intake.education}
Location: ${profile?.location || "Antigua"}

JSON structure (return ONLY this, no other text):
{"summary":"3 sentence summary","experiences":[{"company_name":"real company","job_title":"title","location":"city","start_date":"YYYY-MM","end_date":null,"is_current":true,"description":"3-4 achievement sentences with 2+ metrics each"}],"education":[{"institution":"real school","degree":"degree","field_of_study":"field","start_date":"YYYY-MM","end_date":"YYYY-MM","is_current":false}],"skills":["10 specific skills"],"languages":[{"name":"English","proficiency":"Native"}],"projects":[{"title":"project name","role":"your role","description":"outcome with metrics"}],"volunteer":[{"organization":"org name","role":"role","description":"impact"}]}

Generate 3 work experiences, 1-2 education, 10 skills, 2+ languages, 1-2 projects, 1 volunteer entry. Make every description specific and metric rich. Use real Antiguan companies and institutions.`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
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

  // Insert languages
  if (data.languages?.length) {
    await admin.from("cv_languages").delete().eq("cv_profile_id", profileId);
    await admin.from("cv_languages").insert(
      data.languages.map((lang, i) => ({
        cv_profile_id: profileId,
        name: lang.name,
        proficiency: lang.proficiency,
        sort_order: i,
      }))
    );
  }

  // Insert projects
  if (data.projects?.length) {
    await admin.from("cv_projects").delete().eq("cv_profile_id", profileId);
    await admin.from("cv_projects").insert(
      data.projects.map((proj, i) => ({
        cv_profile_id: profileId,
        title: proj.title,
        role: proj.role,
        description: proj.description,
        sort_order: i,
      }))
    );
  }

  // Insert volunteer
  if (data.volunteer?.length) {
    await admin.from("cv_volunteer").delete().eq("cv_profile_id", profileId);
    await admin.from("cv_volunteer").insert(
      data.volunteer.map((vol, i) => ({
        cv_profile_id: profileId,
        organization: vol.organization,
        role: vol.role,
        description: vol.description,
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
