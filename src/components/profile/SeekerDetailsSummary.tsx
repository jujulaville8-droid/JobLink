import { seekerDetailRows, sensitiveDetailRows, SENSITIVE_DETAILS_NOTICE, type SeekerDetails, type SensitiveDetails } from "@/lib/seeker-details";

/**
 * Read-only list of answered details. Pass `sensitive` ONLY on the seeker's own
 * profile or admin views — never on employer or public pages.
 */
export default function SeekerDetailsSummary({
  details, sensitive, title = "Work details", className = "",
}: {
  details: SeekerDetails;
  sensitive?: SensitiveDetails | null;
  title?: string;
  className?: string;
}) {
  const rows = seekerDetailRows(details);
  const privateRows = sensitive ? sensitiveDetailRows(sensitive) : [];
  if (!rows.length && !privateRows.length) return null;
  return (
    <div className={className}>
      {rows.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-text-muted">{row.label}</dt>
                <dd className="text-sm text-text">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {privateRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Personal details (admin only)</h3>
          <p className="text-[11px] text-amber-800">{SENSITIVE_DETAILS_NOTICE}</p>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {privateRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-text-muted">{row.label}</dt>
                <dd className="text-sm text-text">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
