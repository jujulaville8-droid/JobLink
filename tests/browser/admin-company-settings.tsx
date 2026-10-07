import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminCompaniesPage from '../../src/app/(dashboard)/admin/companies/page';
import AdminPostJobPage from '../../src/app/(dashboard)/admin/post-job/page';
import '../../src/app/globals.css';

const Page = new URLSearchParams(window.location.search).get('view') === 'post-job' ? AdminPostJobPage : AdminCompaniesPage;
createRoot(document.getElementById('root')!).render(<div style={{ padding: '24px 16px', minHeight: '100vh', background: '#faf8f5' }}><Page /></div>);
