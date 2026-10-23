import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { UUID_PATTERN, readEmployerOutboxStatus, type ApplicationDetail } from '@/lib/admin-applications';
import { nullableText, record, relation, text, uuid } from '../_data';
import { SEEKER_DETAIL_COLUMNS, seekerDetailsFromRow, sensitiveDetailsFromRow } from '@/lib/seeker-details';
import { applicationReadError, privateJson, privateResponse } from '../_response';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return privateResponse(auth.error);

    const { applicationId } = await params;
    if (!UUID_PATTERN.test(applicationId)) return privateJson({ error: 'Invalid application ID.' }, 400);

    const admin = createAdminClient();
    const { data, error } = await admin.from('applications').select(`
      id, job_id, seeker_id, status, applied_at, cover_letter_text,
      job_listings!applications_job_id_fkey (id, title, companies (id, company_name)),
      seeker_profiles!applications_seeker_id_fkey (id, user_id, first_name, last_name, phone, location, cv_url)
    `).eq('id', applicationId).maybeSingle();
    if (error) return applicationReadError();
    if (!data) return privateJson({ error: 'Application not found.' }, 404);

    const row = record(data);
    const job = relation(row.job_listings);
    const company = job ? relation(job.companies) : null;
    const seeker = relation(row.seeker_profiles);
    let applicant: ApplicationDetail['applicant'] = null;
    const resume: ApplicationDetail['resume'] = { label: 'Current résumé', uploadedHref: null, builtHref: null };

    if (seeker) {
      const profileId = uuid(seeker.id);
      const userId = uuid(seeker.user_id);
      const [userResult, resumeResult] = await Promise.all([
        admin.from('users').select('email').eq('id', userId).maybeSingle(),
        admin.from('cv_profiles').select('id').eq('user_id', userId).maybeSingle(),
      ]);
      if (userResult.error || resumeResult.error) return applicationReadError();
      applicant = {
        id: profileId, userId, firstName: nullableText(seeker.first_name), lastName: nullableText(seeker.last_name),
        email: userResult.data ? nullableText(record(userResult.data).email) : null,
        phone: nullableText(seeker.phone), location: nullableText(seeker.location),
      };
      if (typeof seeker.cv_url === 'string' && seeker.cv_url.trim()) {
        resume.uploadedHref = `/api/cv-download?profileId=${profileId}`;
      }
      if (resumeResult.data) resume.builtHref = `/api/cv/export?userId=${userId}`;
    }

    // Read separately so the drawer keeps working before the tracking migration.
    let notificationTracking: ApplicationDetail['notificationTracking'] = 'not_tracked';
    const forward = await admin.from('applications')
      .select('employer_forward_status, employer_forward_attempted_at, employer_forwarded_at')
      .eq('id', applicationId).maybeSingle();
    if (!forward.error && forward.data) {
      const value = record(forward.data);
      const status = value.employer_forward_status;
      if ((status === 'sent' || status === 'not_sent') && typeof value.employer_forward_attempted_at === 'string') {
        notificationTracking = {
          status, attemptedAt: value.employer_forward_attempted_at,
          forwardedAt: nullableText(value.employer_forwarded_at),
        };
      }
    }

    // Visibility survives dispatch rollback. Only schema readiness gates this read;
    // never load payloads, recipients, résumé snapshots, or screening/model results.
    let employerOutboxStatus: ApplicationDetail['employerOutboxStatus'];
    if (process.env.EMPLOYER_SCREENING_SCHEMA_READY === 'true') {
      try {
        const outbox = await admin.rpc('employer_outbox_status', { p_application_id: applicationId });
        if (!outbox.error && outbox.data) {
          const status = record(outbox.data);
          employerOutboxStatus = readEmployerOutboxStatus({
            state: status.state, attempts: status.attempts, firstSendAt: status.first_send_at,
            acceptedAt: status.accepted_at, nextAttemptAt: status.next_attempt_at, lastErrorCode: status.last_error_code,
          }) ?? undefined;
        }
      } catch { /* Optional migration/read failures retain legacy detail without private diagnostics. */ }
    }

    // Optional profile details. Read separately so the drawer keeps working
    // before the profile-details migration; failures just omit the section.
    let profileDetails: ApplicationDetail['profileDetails'] = null;
    let sensitiveDetails: ApplicationDetail['sensitiveDetails'] = null;
    if (applicant) {
      const [detailsResult, sensitiveResult] = await Promise.all([
        admin.from('seeker_profiles').select(SEEKER_DETAIL_COLUMNS.join(', ')).eq('id', applicant.id).maybeSingle(),
        admin.from('seeker_sensitive_details').select('marital_status, children_count').eq('seeker_id', applicant.id).maybeSingle(),
      ]);
      if (!detailsResult.error && detailsResult.data) profileDetails = seekerDetailsFromRow(record(detailsResult.data));
      if (!sensitiveResult.error && sensitiveResult.data) sensitiveDetails = sensitiveDetailsFromRow(record(sensitiveResult.data));
    }

    const application: ApplicationDetail = {
      id: uuid(row.id), jobId: uuid(row.job_id), appliedAt: text(row.applied_at),
      status: text(row.status), coverLetterText: nullableText(row.cover_letter_text),
      job: job ? {
        id: uuid(job.id), title: text(job.title),
        company: company ? { id: uuid(company.id), name: text(company.company_name) } : null,
      } : null,
      applicant, resume, notificationTracking, profileDetails, sensitiveDetails,
      ...(employerOutboxStatus ? { employerOutboxStatus } : {}),
    };
    return privateJson({ application });
  } catch {
    return applicationReadError();
  }
}
