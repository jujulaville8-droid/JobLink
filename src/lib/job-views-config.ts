import 'server-only';

/** One server setting enables collection and display and defines history coverage. */
export function jobViewsLaunch(now = new Date()): Date | null {
  const value = process.env.JOB_VIEWS_LAUNCH_AT;
  if (!value || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const launch = new Date(value);
  return Number.isFinite(launch.getTime()) && launch <= now ? launch : null;
}
