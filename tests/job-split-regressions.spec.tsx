import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const nav=vi.hoisted(()=>({push:vi.fn(),back:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>nav}));
import {SelectJobLink,BackToResults} from '@/components/JobSplitNavigation';
import SaveJobButton from '@/components/SaveJobButton';
import JobCard from '@/components/JobCard';
const A='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const job={id:A,title:'Synthetic role',company_name:'Synthetic company',location:'Antigua',job_type:'full_time',created_at:'2026-10-01'};
const viewport=(desktop:boolean)=>vi.stubGlobal('matchMedia',()=>({matches:desktop}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();sessionStorage.clear()});
it('returns to the explicit results URL after mobile selection, desktop reselection and narrowing',()=>{
 viewport(false);render(<><SelectJobLink jobId={A} selectHref={'/jobs?q=cook&job='+A} selected={false} className='' ariaLabel='A'>A</SelectJobLink><SelectJobLink jobId={B} selectHref={'/jobs?q=cook&job='+B} selected={false} className='' ariaLabel='B'>B</SelectJobLink><BackToResults href='/jobs?q=cook'/></>);
 fireEvent.click(screen.getByRole('link',{name:'A'}));viewport(true);fireEvent.click(screen.getByRole('link',{name:'B'}));viewport(false);nav.push.mockClear();fireEvent.click(screen.getByRole('link',{name:'Back to results'}));
 expect(nav.back).not.toHaveBeenCalled();expect(nav.push).toHaveBeenCalledWith('/jobs?q=cook',{scroll:false});
});
it('shares one pending toggle across both save controls while its response is delayed',async()=>{
 let resolve!:(v:unknown)=>void;const send=vi.fn(()=>new Promise(r=>{resolve=r}));vi.stubGlobal('fetch',send);
 render(<><JobCard job={job} loggedIn/><SaveJobButton jobId={A} initialSaved={false} loggedIn large/></>);
 const controls=screen.getAllByRole('button',{name:'Save job'});fireEvent.click(controls[0]);fireEvent.click(controls[1]);
 await waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
 for(const button of screen.getAllByRole('button',{name:'Save job'}))expect((button as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>resolve({ok:true,json:async()=>({saved:true})}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Unsave job'})).toBeTruthy());
});

it('unlocks both save controls on failure, retains the saved flag and permits a retry',async()=>{
 const send=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({saved:true})});vi.stubGlobal('fetch',send);
 render(<><JobCard job={job} loggedIn/><SaveJobButton jobId={A} initialSaved={false} loggedIn large/></>);
 fireEvent.click(screen.getAllByRole('button',{name:'Save job'})[0]);
 await screen.findAllByRole('alert');
 for(const button of screen.getAllByRole('button',{name:'Save job'}))expect((button as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getAllByRole('button',{name:'Save job'})[1]);
 await waitFor(()=>expect(screen.getAllByRole('button',{pressed:true})).toHaveLength(2));
 expect(screen.queryByRole('alert')).toBeNull();expect(send).toHaveBeenCalledTimes(2);
});
it('a pane mounted during a card save inherits the per-job pending state',async()=>{
 let resolve!:(v:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r})));
 const view=render(<JobCard job={job} loggedIn/>);fireEvent.click(screen.getByRole('button',{name:'Save job'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
 view.rerender(<><JobCard job={job} loggedIn/><SaveJobButton jobId={A} initialSaved={false} loggedIn large/><SaveJobButton jobId={B} initialSaved={false} loggedIn large/></>);
 const buttons=screen.getAllByRole('button',{name:'Save job'});
 expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);expect((buttons[2] as HTMLButtonElement).disabled).toBe(false);
 await act(async()=>resolve({ok:true,json:async()=>({saved:true})}));
 await waitFor(()=>expect(screen.getAllByRole('button',{pressed:true})).toHaveLength(2));expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
});
