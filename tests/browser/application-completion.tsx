// Actual production components, synthetic backend/auth, local-only browser QA.
import { createRoot } from 'react-dom/client';
import HomeHeader from '../../src/components/home/HomeHeader';
import ApplyPage from '../../src/app/jobs/[id]/apply/page';
import ProfilePage from '../../src/app/(dashboard)/profile/page';
import ResumeStudio from '../../src/components/cv/studio/ResumeStudio';
import { getApplicationReturnTo } from '../../src/lib/return-to';
import { JOB_ID, useFixtureRevision } from './application-completion-stubs';
import '../../src/app/globals.css';
import '../../src/components/home/home.css';

function FixtureApp() {
  useFixtureRevision();
  const path = window.location.pathname;
  if (/^\/jobs\/[^/]+\/apply$/.test(path)) return <ApplyPage />;
  if (path === '/profile') return <main className="p-4 sm:p-6"><ProfilePage /></main>;
  if (path === '/profile/cv') return <ResumeStudio applicationReturnTo={getApplicationReturnTo(new URLSearchParams(window.location.search).get('returnTo'))} />;
  return <><HomeHeader /><main className="p-6"><h1>Synthetic browser fixture</h1><p>Real UI components with stubbed auth and backend. No live submissions.</p><a href={`/jobs/${JOB_ID}/apply`}>Open synthetic application</a></main></>;
}

createRoot(document.getElementById('root')!).render(<FixtureApp />);
