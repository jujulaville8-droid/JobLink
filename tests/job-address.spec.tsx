import { describe, expect, it } from 'vitest';
import { jobAddressRegion } from '@/lib/seo/job-address';

describe('jobAddressRegion', () => {
  it.each([
    ["Redcliffe Quay, St. John's, Antigua", 'Saint John'],
    ["Dry Hill, St. John's", 'Saint John'],
    ["Friars Hill Rd., St. John's, Antigua", 'Saint John'],
    ["Newgate Street, St. John's, Antigua", 'Saint John'],
    ["St. John's", 'Saint John'],
    ["St. John's, Antigua", 'Saint John'],
    ['Upland Development, Cruise Port', 'Saint John'],
    ['Upland Development, Cruise Port, Antigua', 'Saint John'],
    ['Coolidge', 'Saint George'],
    ['Coolidge, Antigua', 'Saint George'],
    ['Paynters Estate', 'Saint George'],
    ['Paynters Estate, Antigua', 'Saint George'],
    ['English Harbour', 'Saint Paul'],
    ['ENGLISH HARBOUR', 'Saint Paul'],
    ['English Harbour, Antigua', 'Saint Paul'],
    ['Falmouth Harbour, Antigua', 'Saint Paul'],
    ["Cobbs Cross (Falmouth Harbour) and Nelson's Dockyard", 'Saint Paul'],
    ['Bethesda, Antigua', 'Saint Paul'],
    ['Pares Village', 'Saint Peter'],
    ['Pares Village, Antigua', 'Saint Peter'],
    ["Crabb's Peninsula", 'Saint Peter'],
    ["Crabb's Peninsula, Antigua", 'Saint Peter'],
    ['Parham', 'Saint Peter'],
    ['Hermitage Bay, Jennings, Antigua', 'Saint Mary'],
    ['Jolly Harbour', 'Saint Mary'],
    ['Barbuda', 'Barbuda'],
    ['Barbuda, Antigua & Barbuda', 'Barbuda'],
    ['Codrington, Barbuda', 'Barbuda'],
    ['Piggotts', 'Saint George'],
    ['Piggotts Ville', 'Saint John'],
  ])('reads %j as %s', (location, region) => {
    expect(jobAddressRegion(location)).toBe(region);
  });

  it.each([
    null,
    undefined,
    '',
    'Antigua',
    'Antigua and Barbuda',
    'Antigua & Barbuda',
    'Old Parham Road, Antigua',
    'Parham Road',
    'Vista, Antigua',
    'Remote',
    'Remote, Antigua',
    "St. John's and English Harbour",
  ])('does not invent a region for %j', location => {
    expect(jobAddressRegion(location)).toBeUndefined();
  });
});
