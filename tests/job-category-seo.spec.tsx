import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INDUSTRIES } from '@/lib/types';
import { knownJobCategory, jobCategoryFilter } from '@/lib/job-category';
const { eq, query } = vi.hoisted(() => {
  const eq = vi.fn();
  const query: Record<string, unknown> = {};
  for (const method of ['select','or','order','range','ilike','in']) query[method] = vi.fn(() => query);
  query.eq = eq.mockImplementation(() => query);
  query.then = (resolve:(value:unknown)=>unknown) => Promise.resolve(resolve({data:[],count:1,error:null}));
  return {eq,query};
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
beforeEach(()=>eq.mockClear());
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
