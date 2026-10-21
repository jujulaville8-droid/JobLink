import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeWritingOffer from '@/components/cv/studio/ResumeWritingOffer';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn()));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('consultation-first résumé help',()=>{
  it('makes the verified booking destination primary without collecting data or promising a paid package',async()=>{
    render(<ResumeWritingOffer/>);
    const link=screen.getByRole('link',{name:'Book a consultation'});
    expect(link.getAttribute('href')).toBe('https://calendly.com/qqwebsitesolutions/qq-solutions-consultation');
    expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText(/Joblinks Meeting/)).toBeTruthy();
    expect(screen.getByText(/job applications remain free/)).toBeTruthy();
    expect(screen.getByRole('link',{name:'Keep using the free résumé builder'}).getAttribute('href')).toBe('/profile/cv');
    expect(document.body.textContent).not.toMatch(/EC\$|Stripe|buy|purchas|refund|delivery|free call/i);
    expect(screen.queryByRole('form')).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
    link.addEventListener('click',event=>event.preventDefault());
    await userEvent.click(link);await userEvent.click(link);expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves a safe application return destination on the free builder and direct link',()=>{
    const path='/jobs/123e4567-e89b-42d3-a456-426614174000/apply';
    render(<ResumeWritingOffer applicationReturnTo={path}/>);
    expect(screen.getByRole('link',{name:'Return to your application'}).getAttribute('href')).toBe(path);
    expect(screen.getByRole('link',{name:'Keep using the free résumé builder'}).getAttribute('href')).toBe(`/profile/cv?returnTo=${encodeURIComponent(path)}`);
  });
  it.each(['//evil.example','https://evil.example','/admin'])('rejects unsafe or unrelated application destinations %s',value=>{
    render(<ResumeWritingOffer applicationReturnTo={value}/>);
    expect(screen.queryByRole('link',{name:'Return to your application'})).toBeNull();
    expect(screen.getByRole('link',{name:'Keep using the free résumé builder'}).getAttribute('href')).toBe('/profile/cv');
  });
});
