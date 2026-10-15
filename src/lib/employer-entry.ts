/** Preserve existing account destinations; anonymous employers start self-service signup. */
export function employerEntry(isAuthenticated: boolean, userRole: string | null) {
  if (!isAuthenticated) return { href: "/signup?role=employer", label: "Create employer account" };
  return userRole === "employer"
    ? { href: "/post-job", label: "Post a job" }
    : { href: "/dashboard", label: "Dashboard" };
}
