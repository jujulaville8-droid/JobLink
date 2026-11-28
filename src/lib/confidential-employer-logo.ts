import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONFIDENTIAL_EMPLOYER_COMPANY_ID } from "@/lib/confidential-employer";

/**
 * The stand-in company's logo, and nothing else. Row security hides that
 * company from signed-out visitors, so the public pages cannot read logo_url
 * from the listing join. This reads only that one column for that one company.
 */
export const loadConfidentialEmployerLogo = cache(async (): Promise<string | null> => {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("companies")
      .select("logo_url")
      .eq("id", CONFIDENTIAL_EMPLOYER_COMPANY_ID)
      .maybeSingle();
    if (error) return null;
    const logo = typeof data?.logo_url === "string" ? data.logo_url.trim() : "";
    return logo || null;
  } catch {
    return null;
  }
});
