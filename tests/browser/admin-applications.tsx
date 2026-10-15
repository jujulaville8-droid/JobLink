import { createRoot } from 'react-dom/client';
import ApplicationsWorkspace from '../../src/components/admin-applications/ApplicationsWorkspace';
import Navbar from '../../src/components/Navbar';
import DashboardCanvas from '../../src/components/DashboardCanvas';
import SidebarNav from '../../src/components/SidebarNav';
import AdminApplicationsPreview from '../../src/components/admin-applications/AdminApplicationsPreview';
import { useFixtureLocation } from './admin-applications-stubs';
import '../../src/app/globals.css';
import '../../src/components/home/home.css';
import './admin-applications.css';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { href: '/admin/inbox', label: 'Applicant Inbox', icon: 'mail' },
  { href: '/admin/applications', label: 'Applications', icon: 'file-text' },
  { href: '/admin/post-job', label: 'Post a Job', icon: 'plus-circle' },
  { href: '/admin/companies', label: 'Company Logos', icon: 'building' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/approvals', label: 'Job Approvals', icon: 'check-circle' },
  { href: '/admin/reports', label: 'Reports', icon: 'alert-triangle' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'bar-chart' },
  { href: '/admin/featured', label: 'Featured Jobs', icon: 'star' },
  { href: '/admin/emails', label: 'Emails', icon: 'send' },
  { href: '/admin/testimonials', label: 'Hiring Stories', icon: 'star' },
  { href: '/admin/employer-enquiries', label: 'Employer Requests', icon: 'mail' },
];
function FixtureApp() {
  useFixtureLocation();
  const jobId = location.pathname.match(/^\/admin\/applications\/(?:jobs\/)?([^/]+)$/)?.[1];
  return <>
    <Navbar />
    <main className="min-h-screen pb-20 md:pb-0">
      <p className="admin-fixture-label">SYNTHETIC TEST DATA · 65 example jobs / 1,205 example applications · Local-only backend</p>
      <DashboardCanvas sidebar={<aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:top-16 md:bottom-0 border-r border-border bg-[--color-surface] z-30">
        <div className="flex flex-col flex-1 overflow-y-auto px-3 py-6"><SidebarNav links={links} />
          <div className="mt-auto pt-4 border-t border-border"><form action="/auth/signout" method="POST" onSubmit={event => { event.preventDefault(); throw new Error('Synthetic fixture forbids logout'); }}><button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors">Sign Out</button></form></div>
        </div>
      </aside>}>
        {new URLSearchParams(location.search).get('fixtureView') === 'preview' ? <AdminApplicationsPreview /> : <ApplicationsWorkspace jobId={jobId} initialDates={{ from: '2026-09-09', to: '2026-10-08' }} />}
      </DashboardCanvas>
    </main>
  </>;
}
createRoot(document.getElementById('root')!).render(<FixtureApp />);
