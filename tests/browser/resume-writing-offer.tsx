// Review-only fixture for the actual production component; no provider/auth bypass.
import { createRoot } from 'react-dom/client';
import '../../src/app/globals.css';
import ResumeWritingOffer from '../../src/components/cv/studio/ResumeWritingOffer';
createRoot(document.getElementById('root')!).render(<ResumeWritingOffer/>);
