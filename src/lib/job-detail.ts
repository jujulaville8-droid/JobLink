import { createClient } from "@/lib/supabase/server";

export type ApplyState = "apply" | "login" | "not-seeker" | "applied" | "closed" | "profile-incomplete";

export interface JobDetailCompany {
  id: string;
  company_name: string;
  logo_url: string | null;
  description: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  is_verified: boolean;
}

/** One listing with its company, shared by /jobs/[id] and the /jobs detail pane. */
export async function loadJobDetail(id: string) {
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("job_listings")
    .select(
      `
      *,
      company:companies (
        id,
        company_name,
        logo_url,
        description,
        industry,
        location,
        website,
        is_verified
      )
    `
    )
    .eq("id", id)
    .single();

  return {
    supabase,
    job,
    error,
    company: (job?.company ?? null) as unknown as JobDetailCompany | null,
  };
}

/** The viewer's Apply button state and saved flag for one listing. */
export async function loadApplyState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  closed: boolean,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let applyState: ApplyState = "login";
  let isSaved = false;

  if (closed) {
    applyState = "closed";
  } else if (!user) {
    applyState = "login";
  } else {
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData || userData.role !== "seeker") {
      applyState = "not-seeker";
    } else {
      const { data: profile } = await supabase
        .from("seeker_profiles")
        .select("id, first_name, last_name, phone, cv_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        applyState = "profile-incomplete";
      } else {
        const [{ data: existing }, { data: savedJob }, cvProfile] = await Promise.all([
          supabase.from("applications").select("id").eq("job_id", jobId).eq("seeker_id", profile.id).maybeSingle(),
          supabase.from("saved_jobs").select("id").eq("job_id", jobId).eq("seeker_id", profile.id).maybeSingle(),
          profile.cv_url ? Promise.resolve(null)
            : supabase.from("cv_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        ]);
        const complete = profile.first_name && profile.last_name && profile.phone && (profile.cv_url || cvProfile?.data);
        applyState = !complete ? "profile-incomplete" : existing ? "applied" : "apply";
        // Saving does not require an application-ready profile.
        isSaved = !!savedJob;
      }
    }
  }

  return { user, applyState, isSaved };
}
