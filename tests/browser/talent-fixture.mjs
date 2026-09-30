// Local-only HTTP fixture for the Next server and browser. No Supabase account,
// database, emails or external services are used. This is not an RLS emulator.
import { createServer } from 'node:http';

const port = Number(process.env.TALENT_FIXTURE_PORT || 4318);
const calls = [];
createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') { response.end(); return; }
  if (url.pathname === '/__calls') { response.end(JSON.stringify(calls)); return; }
  let claims = {};
  try { claims = JSON.parse(Buffer.from((request.headers.authorization || '').split('.')[1], 'base64url')); } catch {}
  const role = claims.fixture_role;
  calls.push({ path: url.pathname, search: url.search, role: role || 'anonymous', method: request.method });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405); response.end(JSON.stringify({ error: 'Read-only fixture' })); return;
  }
  if (url.pathname === '/auth/v1/user') {
    if (!role) { response.writeHead(401); response.end(JSON.stringify({ message: 'No test session' })); return; }
    response.end(JSON.stringify({ id: claims.sub, aud: 'authenticated', role: 'authenticated',
      email: `${role}@example.invalid`, email_confirmed_at: role === 'unverified' ? null : '2026-01-01T00:00:00Z',
      user_metadata: { role: role === 'seeker' ? 'seeker' : 'employer' }, app_metadata: { provider: 'email' } })); return;
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (request.method === 'HEAD') { response.setHeader('Content-Range', '*/0'); response.end(); return; }
    const table = url.pathname.split('/').at(-1);
    const single = request.headers.accept?.includes('vnd.pgrst.object');
    let rows = [];
    if (table === 'users' && role) rows = [{ id: claims.sub, role: role === 'seeker' ? 'seeker' : 'employer',
      email_verified: role !== 'unverified', is_banned: role === 'banned', is_admin: false }];
    if (table === 'companies' && role === 'employer') rows = [{ id: '10000000-0000-0000-0000-000000000000', user_id: claims.sub, company_name: 'Test company', is_pro: false }];
    // A canary catches any accidental candidate query from the public SSR path.
    // Only a full candidate query gets records; existing own-avatar lookups do not.
    if (table === 'seeker_profiles' && url.searchParams.get('select') === '*' && role !== 'seeker' && role !== 'unverified' && role !== 'banned') {
      rows = [{ id: '20000000-0000-0000-0000-000000000000', user_id: '30000000-0000-0000-0000-000000000000',
        first_name: 'PRIVATE_CANDIDATE_CANARY', last_name: 'FIXTURE', visibility: 'actively_looking',
        bio: 'Synthetic local browser fixture', skills: [], profile_complete_pct: 50, avatar_url: null }];
    }
    if (single && !rows.length) { response.writeHead(406); response.end(JSON.stringify({ code: 'PGRST116' })); return; }
    response.end(JSON.stringify(single ? rows[0] : rows)); return;
  }
  response.writeHead(404); response.end('{}');
}).listen(port, '127.0.0.1', () => console.log(`Read-only talent fixture on http://127.0.0.1:${port}`));
