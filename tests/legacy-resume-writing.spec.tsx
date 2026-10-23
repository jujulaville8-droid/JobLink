import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getResumeWritingReturnTo } from '@/lib/return-to';
import LegacyResumeWritingRequest from '@/components/cv/studio/LegacyResumeWritingRequest';
import { writingOrder,writingTerms } from './fixtures/resume-writing';
const config={intakeEnabled:true,checkoutEnabled:false,terms:writingTerms,paymentMode:'sandbox' as const};
beforeEach(()=>vi.stubGlobal('fetch',vi.fn()));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('legacy résumé request access without checkout',()=>{
  it('preserves explicit existing-request intent through verified sign-in returns',async()=>{
    vi.mocked(fetch).mockImplementation(async input=>String(input).endsWith('/config')?Response.json({config}):Response.json({error:'Authentication required'},{status:401}));
    render(<LegacyResumeWritingRequest/>);
    const link=await screen.findByRole('link',{name:'Sign in to view your saved request'});
    expect(link.getAttribute('href')).toBe('/login?returnTo='+encodeURIComponent('/resume-writing?requests=1'));
    expect(getResumeWritingReturnTo('/resume-writing?requests=1')).toBe('/resume-writing?requests=1');
    expect(getResumeWritingReturnTo('/resume-writing?requests=https://evil.test')).toBe('/resume-writing');
  });
  it('refreshes an older selected request outside the recent list without replacing unsaved intake',async()=>{
    const user=userEvent.setup();const paid={...writingOrder,payment_status:'paid',fulfillment_status:'draft_ready' as const,files:[{id:'40000000-0000-4000-8000-000000000001',kind:'pdf' as const,revision_number:0,published_at:'2026-10-18'}]};
    vi.mocked(fetch).mockImplementation(async input=>String(input).endsWith(writingOrder.id)?Response.json({order:paid}):Response.json({config,orders:[]}));
    render(<LegacyResumeWritingRequest initialOrderId={writingOrder.id} initialData={{config,orders:[writingOrder]}}/>);await user.click(screen.getByRole('button',{name:/Shop assistant/}));
    await user.type(screen.getByRole('textbox',{name:'Name for your résumé'}),' unsaved');await user.click(screen.getByRole('button',{name:'Refresh saved status'}));
    await screen.findByText('Saved status refreshed.');expect(fetch).toHaveBeenCalledWith(`/api/resume-writing/orders/${writingOrder.id}`,{cache:'no-store'});expect(screen.getByRole('link',{name:'Download PDF'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Pay EC$50'})).toBeNull();expect((screen.getByRole('textbox',{name:'Name for your résumé'}) as HTMLInputElement).value).toBe('Synthetic Seeker unsaved');
  });
  it('reports a failed older-request refresh instead of a misleading success',async()=>{
    const user=userEvent.setup();vi.mocked(fetch).mockImplementation(async input=>String(input).endsWith(writingOrder.id)?Response.json({error:'Not found'},{status:404}):Response.json({config,orders:[]}));
    render(<LegacyResumeWritingRequest initialOrderId={writingOrder.id} initialData={{config,orders:[writingOrder]}}/>);await user.click(screen.getByRole('button',{name:/Shop assistant/}));await user.click(screen.getByRole('button',{name:'Refresh saved status'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not refresh saved status');expect(screen.queryByText('Saved status refreshed.')).toBeNull();expect(screen.queryByRole('button',{name:'Pay EC$50'})).toBeNull();
  });
  it('shows only published current documents, and sends a bounded customer revision without client status claims',async()=>{
    const user=userEvent.setup();const order={...writingOrder,payment_status:'paid',intake_status:'complete' as const,fulfillment_status:'draft_ready' as const,files:[{id:'40000000-0000-4000-8000-000000000001',kind:'pdf' as const,revision_number:0,published_at:'2026-10-18'}]};vi.mocked(fetch).mockResolvedValue(Response.json({order:{...order,revision_count:1,fulfillment_status:'revision_requested'}}));render(<LegacyResumeWritingRequest initialOrderId={writingOrder.id} initialData={{config,orders:[order]}}/>);await user.click(screen.getByRole('button',{name:/Shop assistant/}));expect(screen.getByRole('link',{name:'Download PDF'}).getAttribute('href')).toContain('/files/40000000');await user.type(screen.getByRole('textbox',{name:/What would you like changed/}),'Correct my school project wording');await user.click(screen.getByRole('button',{name:'Request included revision'}));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));const body=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(body.action).toBe('revision');expect(body.status).toBeUndefined();
  });
  it('keeps current published downloads after approval when the mutation omits file metadata',async()=>{
    const user=userEvent.setup();const order={...writingOrder,payment_status:'paid',intake_status:'complete' as const,fulfillment_status:'draft_ready' as const,files:[{id:'40000000-0000-4000-8000-000000000001',kind:'pdf' as const,revision_number:0,published_at:'2026-10-18'}]};
    vi.mocked(fetch).mockResolvedValue(Response.json({order:{...writingOrder,payment_status:'paid',intake_status:'complete',fulfillment_status:'complete'}}));render(<LegacyResumeWritingRequest initialOrderId={writingOrder.id} initialData={{config,orders:[order]}}/>);await user.click(screen.getByRole('button',{name:/Shop assistant/}));await user.click(screen.getByRole('button',{name:'Approve résumé'}));await screen.findByText('Thank you. Your résumé is marked complete.');expect(screen.getByRole('link',{name:'Download PDF'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Approve résumé'})).toBeNull();
  });
});
