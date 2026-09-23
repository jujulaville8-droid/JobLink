// Test-only entry, served by Vite. Not a Next.js route or production auth bypass.
import { createRoot } from 'react-dom/client';
import ResumeStudio from '../../src/components/cv/studio/ResumeStudio';
import { resumeFixture } from '../fixtures/resume';

const stored = structuredClone(resumeFixture);
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) !== '/api/cv/studio') return nativeFetch(input, init);
  if (!init?.method) return Response.json(stored);
  const body = JSON.parse(String(init.body));
  if (body.section === 'profile') { Object.assign(stored.profile, body.entry); return Response.json({ entry: stored.profile }); }
  const rows = stored[body.section as keyof typeof stored];
  if (!Array.isArray(rows)) return Response.json({ error: 'Unknown section' }, { status: 400 });
  if (init.method === 'DELETE') return Response.json({ success: true });
  const entry = { ...body.entry, id: body.id, cv_profile_id: stored.profile.id, sort_order: body.sort_order };
  return Response.json({ entry });
};
createRoot(document.getElementById('root')!).render(<ResumeStudio />);
