import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { INDUSTRIES } from '@/lib/types';
import { knownJobCategory, jobCategoryFilter } from '@/lib/job-category';
const { eq, query, result } = vi.hoisted(() => {
  const eq = vi.fn();
  const result = { data: [] as Record<string, unknown>[], count: 1, error: null as { message: string } | null };
  const query: Record<string, unknown> = {};
  for (const method of ['select','or','order','range','ilike','in']) query[method] = vi.fn(() => query);
  query.eq = eq.mockImplementation(() => query);
  query.then = (resolve:(value:unknown)=>unknown) => Promise.resolve(resolve(result));
  return {eq,query,result};
});
vi.mock('@/lib/supabase/server', () => ({createClient:async()=>({from:()=>query,auth:{getUser:async()=>({data:{user:null}})}})}));
vi.mock('@/components/JobCard', () => ({default:()=>null}));
vi.mock('@/components/AlertToggle', () => ({default:()=>null}));
vi.mock('@/components/JobFilters', () => ({default:()=>null}));
vi.mock('@/components/JobSearchBar', () => ({default:()=>null}));
vi.mock('@/components/JobIndustryShortcuts', () => ({default:()=>null}));
vi.mock('@/components/Pagination', () => ({default:()=>null}));
import { generateMetadata } from '@/app/jobs/page';
import JobResults from '@/components/JobResults';
beforeEach(()=>{
 eq.mockClear();
 result.data = [];
 result.count = 1;
 result.error = null;
});
describe('category SEO consistency',()=>{
 it.each(INDUSTRIES)('normalizes case and whitespace for %s',category=>{
   expect(knownJobCategory(` ${category.toLowerCase()} `)).toBe(category);
   expect(jobCategoryFilter(category.toUpperCase())).toBe(category);
 });
 it('does not invent or widen unknown filters',()=>{
   expect(knownJobCategory('Unlisted field')).toBeUndefined();
   expect(jobCategoryFilter(' Unlisted field ')).toBe('Unlisted field');
   expect(jobCategoryFilter('')).toBeUndefined();
 });
 it.each(['accounting',' ACCOUNTING ','Accounting'])('queries the same category as its metadata: %s',async category=>{
   const metadata=await generateMetadata({searchParams:Promise.resolve({category})});
   expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/jobs?category=Accounting');
   await JobResults({searchParams:{category}});
   expect(eq.mock.calls.filter(([field])=>field==='category')).toEqual([['category','Accounting'],['category','Accounting']]);
 });
 it('keeps mixed filters and unknown categories noindex',async()=>{
   const mixed=await generateMetadata({searchParams:Promise.resolve({category:'accounting',q:'manager'})});
   const unknown=await generateMetadata({searchParams:Promise.resolve({category:'unknown'})});
   expect(mixed.robots).toEqual({index:false,follow:true});
   expect(unknown.robots).toEqual({index:false,follow:true});
   await JobResults({searchParams:{category:'unknown'}});
   expect(eq).toHaveBeenCalledWith('category','unknown');
 });
});

describe('visible category result counts', () => {
 async function resultMarkup(searchParams: Parameters<typeof JobResults>[0]['searchParams']) {
   const container = document.createElement('div');
   container.innerHTML = renderToStaticMarkup(await JobResults({ searchParams }));
   return container;
 }

 beforeEach(() => {
   result.data = [
     { id: 'job-one', title: 'First vacancy', company: { id: 'company-one', company_name: 'Example company' } },
     { id: 'job-two', title: 'Second vacancy', company: { id: 'company-two', company_name: 'Another company' } },
   ];
   result.count = 2;
 });

 it.each(['Retail & Trade', ' retail & trade ', 'RETAIL & TRADE', 'Tourism & Hospitality'])(
   'identifies the normalized category beside its actual count: %s', async category => {
     const markup = await resultMarkup({ category });
     expect(markup.querySelector('p')?.textContent).toBe(`2 ${knownJobCategory(category)} jobs found`);
     expect(eq).toHaveBeenCalledWith('category', knownJobCategory(category));
   },
 );

 it('uses the filtered query count and singular for mixed category searches', async () => {
   result.data = result.data.slice(0, 1);
   result.count = 1;
   const markup = await resultMarkup({ category: 'retail & trade', q: 'cashier', job_type: 'full_time' });
   expect(markup.querySelector('p')?.textContent).toBe('1 Retail & Trade job found');
   expect(eq).toHaveBeenCalledWith('category', 'Retail & Trade');
   expect(query.in).toHaveBeenCalledWith('job_type', ['full_time']);
 });

 it.each([undefined, '', 'Unknown category'])('preserves generic counts without a known category: %s', async category => {
   const markup = await resultMarkup({ category });
   expect(markup.querySelector('p')?.textContent).toBe('2 jobs found');
   if (category) expect(eq).toHaveBeenCalledWith('category', category);
 });

 it('preserves the genuine empty category state', async () => {
   result.data = [];
   result.count = 0;
   const markup = await resultMarkup({ category: 'retail & trade' });
   expect(markup.querySelector('h3')?.textContent).toBe('No retail & trade jobs right now');
   expect(markup.textContent).not.toContain('jobs found');
 });

 it('preserves a loading failure rather than displaying a count', async () => {
   result.error = { message: 'Test query failure' };
   const markup = await resultMarkup({ category: 'Retail & Trade' });
   expect(markup.textContent).toContain('Something went wrong loading jobs.');
   expect(markup.textContent).not.toContain('jobs found');
 });
});
