// Real production UI; synthetic anonymous auth/job. No live data or submissions.
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import JobDetailPage from '../../src/app/jobs/[id]/page';
import JobSearchBar from '../../src/components/JobSearchBar';
import JobFilters from '../../src/components/JobFilters';
import AlertToggle from '../../src/components/AlertToggle';
import Pagination from '../../src/components/Pagination';
import BottomNav from '../../src/components/BottomNav';
import SupportButton from '../../src/components/SupportButton';
import LoginPage from '../../src/app/(auth)/login/page';
import SignupPage from '../../src/app/(auth)/signup/page';
import { JOB_ID } from './job-discovery-stubs';
import '../../src/app/globals.css';

async function mount() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  let content: ReactNode;
  if (path === `/jobs/${JOB_ID}`) content = await JobDetailPage({ params: Promise.resolve({ id: JOB_ID }) });
  else if (path === '/login') content = <div className="p-4"><LoginPage /></div>;
  else if (path === '/signup') content = <div className="p-4"><SignupPage /></div>;
  else content = <div className="mx-auto max-w-7xl px-4 py-6">
    <h1 className="text-2xl mb-4">Synthetic job search QA</h1>
    <JobSearchBar defaultValue={params.get('q') ?? ''} defaultLocation={params.get('location') ?? ''} />
    <div className="mt-6 flex flex-col lg:flex-row gap-6"><JobFilters /><section className="min-w-0 flex-1 border border-border rounded-xl p-6">
      <h2 className="text-xl">No matching jobs — fixture</h2>
      <AlertToggle loggedIn={false} emphasis query={params.get('q') ?? undefined} category={params.get('category') ?? undefined} location={params.get('location') ?? undefined} jobType={params.getAll('job_type')} />
      <Pagination currentPage={Number(params.get('page') || 1)} totalPages={12} />
    </section></div>
  </div>;
  createRoot(document.getElementById('root')!).render(<>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="p-4 border-b border-border bg-white">JobLink · local synthetic browser fixture</header>
    <main id="main-content" tabIndex={-1} className="min-h-screen pb-20 md:pb-0">{content}</main>
    <BottomNav /><SupportButton />
  </>);
}
void mount();
