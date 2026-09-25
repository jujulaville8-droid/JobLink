import React from 'react';
import { createRoot } from 'react-dom/client';
import AlertsPage from '../../src/app/(dashboard)/alerts/page';
import '../../src/app/globals.css';

createRoot(document.getElementById('root')!).render(<div style={{ padding: '24px 16px', minHeight: '100vh', background: '#faf8f5', fontFamily: 'Arial, sans-serif' }}><AlertsPage /></div>);
