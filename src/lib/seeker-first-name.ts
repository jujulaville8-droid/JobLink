import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Optional personalization must never prevent browsing jobs. */
export const getSeekerFirstName = cache(async (): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: profile, error } = await supabase
      .from("seeker_profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    return error ? null : profile?.first_name?.trim() || null;
  } catch {
    return null;
  }
});
