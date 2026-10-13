import { createRoot } from 'react-dom/client'
import SupportButton from '../../src/components/SupportButton'
import '../../src/app/globals.css'

createRoot(document.getElementById('root')!).render(<>
  <main style={{ padding: '2rem', minHeight: '150vh', background: '#faf8f5' }}>
    <h1 style={{ fontSize: '2rem', color: '#095355' }}>JobLinks support test fixture</h1>
    <p>Isolated preview of the actual support component and website stylesheet.</p>
    <button id="background-action" style={{ marginTop: '1rem' }}>Background action</button>
  </main>
  {new URLSearchParams(location.search).get('surface') !== 'home' && <nav data-support-obstruction aria-label="Fixture mobile navigation" className="md:hidden" style={{ position: 'fixed', bottom: 0, height: 76, width: '100%', background: 'white', borderTop: '1px solid #e8e3db', padding: '1rem' }}>Home · Jobs · Account</nav>}
  <SupportButton />
</>)
