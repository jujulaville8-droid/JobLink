import { afterEach, expect, it, vi } from 'vitest';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeWritingAdmin from '@/components/ResumeWritingAdmin';
import { writingOrder } from './fixtures/resume-writing';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows no paid intake or reconciliation control when disabled',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({orders:[],unmatched:[],disabled:true})));render(<ResumeWritingAdmin />);await screen.findByRole('status');expect(screen.queryByText('Synthetic Seeker')).toBeNull();expect(screen.queryByRole('button',{name:'Reconcile payment'})).toBeNull();});
it('requires manual delivery confirmation and submits only a versioned admin status request',async()=>{
  const user=userEvent.setup();const fetcher=vi.fn(async()=>Response.json({orders:[{...writingOrder,payment_status:'paid',fulfillment_status:'draft_ready',version:4}],unmatched:[]}));vi.stubGlobal('fetch',fetcher);render(<ResumeWritingAdmin />);
  await screen.findByRole('heading',{name:/Synthetic Seeker/});const update=screen.getByRole('button',{name:'Verify payment and update'}) as HTMLButtonElement;expect(update.disabled).toBe(true);
  await user.click(screen.getByRole('checkbox',{name:/I delivered the final PDF/}));await user.click(update);
  await waitFor(()=>expect(fetcher.mock.calls.length).toBeGreaterThan(1));
  const call=vi.mocked(fetch).mock.calls.find(([,init])=>init?.method==='PATCH');expect(JSON.parse(String(call?.[1]?.body))).toEqual({version:4,status:'complete',delivered:true});
});
it('holds refunded/disputed orders while retaining completed fulfillment',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({orders:[{...writingOrder,payment_status:'refunded',payment_review_required:true,fulfillment_status:'complete'}],unmatched:[]})));render(<ResumeWritingAdmin />);await screen.findByRole('heading',{name:/Synthetic Seeker/});expect(screen.getByText(/Completed manually/)).toBeTruthy();expect(screen.getByText(/Fulfillment progress is preserved/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Verify payment and update'})).toBeNull();});
