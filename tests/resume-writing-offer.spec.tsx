import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeWritingOffer from '@/components/cv/studio/ResumeWritingOffer';
import { writingOrder, writingTerms } from './fixtures/resume-writing';
const disabled = {config:{intakeEnabled:false,checkoutEnabled:false,terms:null},orders:[]};

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('local résumé purchase preparation', () => {
  it('shows the package and unavailable-payment disclosure before collecting details', () => {
    render(<ResumeWritingOffer initialData={disabled} />);
    expect(screen.getByText('EC$50 · one-time')).toBeTruthy();
    expect(screen.getByText('One revision')).toBeTruthy();
    expect(screen.getByText('Final PDF and an editable copy')).toBeTruthy();
    expect(screen.getByText(/Purchasing is not available yet/)).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reviews a first résumé with no work experience without submitting an order or charging', async () => {
    const user = userEvent.setup();
    render(<ResumeWritingOffer initialData={disabled} />);
    await user.click(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    const name = screen.getByRole('textbox', { name: /Name for your résumé/ });
    expect(document.activeElement).toBe(name);
    await user.type(name, 'Synthetic Seeker');
    await user.type(screen.getByRole('textbox', { name: /Delivery email/ }), 'seeker@example.com');
    await user.type(screen.getByRole('textbox', { name: /Type of job you want/ }), 'Shop assistant');
    await user.click(screen.getByRole('button', { name: 'Review your details' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review your résumé request' }));
    expect(screen.getByText('Synthetic Seeker')).toBeTruthy();
    expect(screen.getByText('Total: EC$50 · one-time')).toBeTruthy();
    expect(screen.getByText(/Your request has not been submitted/)).toBeTruthy();
    const payment = screen.getByRole('button', { name: 'Pay EC$50' }) as HTMLButtonElement;
    expect(payment.disabled).toBe(true);
    await user.click(payment);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit your details' }));
    expect((screen.getByRole('textbox', { name: /Name for your résumé/ }) as HTMLInputElement).value).toBe('Synthetic Seeker');
  });

  it('requires contact and target-job details while keeping experience optional', async () => {
    const user = userEvent.setup();
    render(<ResumeWritingOffer initialData={disabled} />);
    await user.click(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    await user.click(screen.getByRole('button', { name: 'Review your details' }));
    expect(screen.queryByRole('heading', { name: 'Review your résumé request' })).toBeNull();
    const email = screen.getByRole('textbox', { name: /Delivery email/ }) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'invalid-address' } });
    expect(email.validity.typeMismatch).toBe(true);
    expect((screen.getByRole('textbox', { name: /Experience and responsibilities/ }) as HTMLTextAreaElement).required).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the local intake when closed but does not persist it across leaving the page', async () => {
    const user = userEvent.setup();
    const first = render(<ResumeWritingOffer initialData={disabled} />);
    await user.click(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    await user.type(screen.getByRole('textbox', { name: /Name for your résumé/ }), 'Synthetic Seeker');
    await user.click(screen.getByRole('button', { name: 'Keep using the free builder' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    await user.click(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    expect((screen.getByRole('textbox', { name: /Name for your résumé/ }) as HTMLInputElement).value).toBe('Synthetic Seeker');
    first.unmount();
    render(<ResumeWritingOffer initialData={disabled} />);
    await user.click(screen.getByRole('button', { name: 'Buy a résumé · EC$50' }));
    expect((screen.getByRole('textbox', { name: /Name for your résumé/ }) as HTMLInputElement).value).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves an explicitly consented request before preparing an external checkout and restores saved status', async () => {
    const user=userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input,init)=>{
      if(String(input).endsWith('/checkout'))return Response.json({mode:'sandbox',url:'https://buy.stripe.com/test_SyntheticSandbox?client_reference_id=30000000-0000-4000-8000-000000000001'});
      if(init?.method==='POST')return Response.json({order:writingOrder});
      return Response.json({config:{intakeEnabled:true,checkoutEnabled:true,terms:writingTerms},orders:[{...writingOrder,payment_status:'paid',fulfillment_status:'ready'}]});
    });
    render(<ResumeWritingOffer initialData={{config:{intakeEnabled:true,checkoutEnabled:true,terms:writingTerms,paymentMode:'sandbox'},orders:[]}} />);
    expect(screen.getByRole('status').textContent).toContain('no real payment');
    await user.click(screen.getByRole('button',{name:'Buy a résumé · EC$50'}));
    await user.type(screen.getByRole('textbox',{name:/Name for your résumé/}),'Synthetic Seeker');
    await user.type(screen.getByRole('textbox',{name:/Delivery email/}),'synthetic@example.com');
    await user.type(screen.getByRole('textbox',{name:/Type of job you want/}),'Shop assistant');
    await user.click(screen.getByRole('button',{name:'Review your details'}));
    expect((screen.getByRole('button',{name:'Save request'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox',{name:/I agree to these terms/}));
    await user.click(screen.getByRole('button',{name:'Save request'}));
    await screen.findByRole('button',{name:'Refresh saved status'});
    const posted=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(posted).toMatchObject({consent:true,termsVersion:writingTerms.version,intake:{name:'Synthetic Seeker'}});
    expect(posted.payment_status).toBeUndefined();expect(posted.user_id).toBeUndefined();
    await user.click(screen.getByRole('button',{name:'Pay EC$50'}));
    const link=await screen.findByRole('link',{name:'Pay EC$50 on Stripe (new tab)'});
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('href')).not.toContain('synthetic');
    expect(link.getAttribute('href')).toContain('/test_SyntheticSandbox?client_reference_id=');
    await user.click(screen.getByRole('button',{name:'Refresh saved status'}));
    expect(await screen.findByText(/Payment status: paid/)).toBeTruthy();
    expect(screen.queryByRole('link',{name:'Pay EC$50 on Stripe (new tab)'})).toBeNull();
    expect((screen.getByRole('button',{name:'Pay EC$50'}) as HTMLButtonElement).disabled).toBe(true);
  });
});
