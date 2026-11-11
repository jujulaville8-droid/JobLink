import type { JobType } from "@/lib/types";

/**
 * Employers who have explicitly allowed JobLink to list their jobs.
 *
 * Google for Jobs does not allow "job postings on behalf of an organization or
 * company without authorization", so a listing the JobLink team imported or
 * posted only gets JobPosting structured data once its employer has said yes.
 * Jobs employers post themselves don't need to be listed here.
 *
 * To record a verified approval:
 *   1. Confirm its scope from the employer or the site owner's attestation. A yes to one
 *      vacancy belongs in EMPLOYER_APPROVED_JOBS, never the company-wide map.
 *   2. Use that job's id and the company id from its "View company profile"
 *      link. Record the attestation date and a traceable evidence reference
 *      (not private email content). See docs/jobposting-approvals.md.
 *   3. Company-wide entries require explicit permission covering current and
 *      future jobs. Claiming a company account does not expand approval scope.
 *   4. Only add jobTypeOverrides as a stopgap when a listing's stored job type
 *      is wrong. Fixing the job type in admin is the real fix; remove the
 *      override once that's done.
 */
export interface EmployerApproval {
  /** Human reference only; matching is by company id. */
  companyName: string;
  /** Approval date supplied by the employer or owner attestation (YYYY-MM-DD). */
  approvedOn: string;
  /** Temporary job type corrections, keyed by job id. */
  jobTypeOverrides?: Record<string, JobType>;
}

export interface JobApproval extends Omit<EmployerApproval, "approvedOn"> {
  /** Bind permission to the original company as well as the vacancy id. */
  companyId: string;
  /** Date authorization was attested, not an inferred historical reply date. */
  attestedOn: string;
  /** Reference to the employer confirmation or owner attestation. */
  evidenceReference: string;
  /** Original employer date-only deadline, retained if expires_at is absent. */
  validThrough?: string;
  /** Omit optional employmentType markup until the employer confirms it. */
  employmentTypeUnconfirmed?: boolean;
}

// The original September 30 owner attestation covered only these vacancies;
// see docs/jobposting-approvals.md for provenance and later company-wide scope.
export const EMPLOYER_APPROVED_JOBS: Record<string, JobApproval> = {
  // Site owner requested Google Jobs allowlist on 2026-11-11 for this already-live admin-posted listing (created 2026-11-10).
  // Site-owner attestation only. Full Time is an unconfirmed placeholder; no public deadline.
  "59c908d2-3c33-4c3d-be61-2a37bce19823": {
    companyId: "766725b8-2f44-435c-b93b-4a4122f211f8",
    companyName: "Mamma Mia Restaurant & Sunset on the Shore",
    attestedOn: "2026-11-11",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/PENDING-ALLOWLIST",
    employmentTypeUnconfirmed: true,
  },
  // Tipsy Toast Cafe: site owner directed on 2026-11-09 that the employer gave
  // permission to list this Bartender / Barista vacancy. Vacancy-scoped only.
  // Full Time on the listing is an unconfirmed placeholder; no public deadline.
  "0939b9ec-bc7a-4d0b-a9ff-ac9e85026ec0": {
    companyId: "0b0f5276-c2ff-4626-9c2c-c4a0222bb46d",
    companyName: "Tipsy Toast Cafe",
    attestedOn: "2026-11-09",
    evidenceReference: "owner-direction:2026-11-09",
    employmentTypeUnconfirmed: true,
  },
  // Tipsy Toast Cafe: same 2026-11-09 permission, for this Chef / Cook vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "8226ba88-2ba5-46c6-be2f-acf4c429fa5d": {
    companyId: "0b0f5276-c2ff-4626-9c2c-c4a0222bb46d",
    companyName: "Tipsy Toast Cafe",
    attestedOn: "2026-11-09",
    evidenceReference: "owner-direction:2026-11-09",
    employmentTypeUnconfirmed: true,
  },
  // Tipsy Toast Cafe: same 2026-11-09 permission, for this Supervisor vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "e184e7ee-0499-4e4e-b324-a1f78580fa93": {
    companyId: "0b0f5276-c2ff-4626-9c2c-c4a0222bb46d",
    companyName: "Tipsy Toast Cafe",
    attestedOn: "2026-11-09",
    evidenceReference: "owner-direction:2026-11-09",
    employmentTypeUnconfirmed: true,
  },
  // Blends&Bitez: site owner directed on 2026-11-09 that the employer gave
  // permission to list this Prep Cook vacancy. Vacancy-scoped only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "defd0a66-f033-41ea-9cb0-119b06a74eac": {
    companyId: "db2a43e0-73d6-45a1-b15e-f29c1a444de2",
    companyName: "Blends&Bitez",
    attestedOn: "2026-11-09",
    evidenceReference: "owner-direction:2026-11-09",
    employmentTypeUnconfirmed: true,
  },
  // The Massage Goddess is not company-wide approved. The 2026-10-19 yes covers
  // only the Nail Technician vacancy. The site owner directed on 2026-11-09 that
  // this later vacancy should carry markup. Full Time is an unconfirmed
  // placeholder; no public deadline.
  "4708c01a-ccd2-42ee-ad4e-54c3cab98420": {
    companyId: "5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3",
    companyName: "The Massage Goddess",
    attestedOn: "2026-11-09",
    evidenceReference: "owner-direction:2026-11-09",
    employmentTypeUnconfirmed: true,
  },
  // CRISPA: employer yes by email to the JobLink inbox on 2026-10-19 (about
  // 1:29 PM ET) for this Sales Representative vacancy only. Folded from PR #97,
  // which conflicts with main. Full Time is an unconfirmed placeholder; no
  // public deadline.
  "90a1af95-5173-43ce-a5b7-4307814ce881": {
    companyId: "08c982be-1421-4657-8394-c168a1f07d61",
    companyName: "CRISPA Wholesale Distribution Company Ltd.",
    attestedOn: "2026-10-19",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/97",
    employmentTypeUnconfirmed: true,
  },
  // CRISPA: same 2026-10-19 email yes, for this Office Assistant vacancy only.
  // Folded from PR #97. Full Time is an unconfirmed placeholder; no public deadline.
  "ef5503e9-45a2-4121-92b7-aec94b440147": {
    companyId: "08c982be-1421-4657-8394-c168a1f07d61",
    companyName: "CRISPA Wholesale Distribution Company Ltd.",
    attestedOn: "2026-10-19",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/97",
    employmentTypeUnconfirmed: true,
  },
  // Hawksbill Resort: employer yes via email to JobLink on 2026-11-05 for Servers,
  // Bartenders and Beach Attendants only. This entry is the Beach Attendants vacancy.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "263be015-34e7-48aa-81ec-8e6ee8f5fc62": {
    companyId: "67d73b3c-085c-497d-b790-8144f8e2d786",
    companyName: "Hawksbill Resort",
    attestedOn: "2026-11-05",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Hawksbill Resort: employer yes via email to JobLink on 2026-11-05 for Servers,
  // Bartenders and Beach Attendants only. This entry is the Bartenders vacancy.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "39ffda6c-e9c3-4e43-94cd-3b1ba59ca2c6": {
    companyId: "67d73b3c-085c-497d-b790-8144f8e2d786",
    companyName: "Hawksbill Resort",
    attestedOn: "2026-11-05",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Hawksbill Resort: employer yes via email to JobLink on 2026-11-05 for Servers,
  // Bartenders and Beach Attendants only. This entry is the Servers vacancy.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "8260775d-9740-42ba-9f40-dfc87cf0bfbd": {
    companyId: "67d73b3c-085c-497d-b790-8144f8e2d786",
    companyName: "Hawksbill Resort",
    attestedOn: "2026-11-05",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Fries Guys & The Side Café: employer yes via email to JobLink on 2026-11-04 for
  // Cooks, Barista/Bartender and Customer Service Staff. This entry is Customer Service Staff.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "95db04ec-fd9e-44d2-881d-385e64c3580b": {
    companyId: "6299b0b2-c4be-4499-9d4c-435d28775729",
    companyName: "Fries Guys & The Side Café",
    attestedOn: "2026-11-04",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Fries Guys & The Side Café: employer yes via email to JobLink on 2026-11-04 for
  // Cooks, Barista/Bartender and Customer Service Staff. This entry is the Cooks vacancy.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "e5e07984-4043-4a8c-a065-a99c381e4e5f": {
    companyId: "6299b0b2-c4be-4499-9d4c-435d28775729",
    companyName: "Fries Guys & The Side Café",
    attestedOn: "2026-11-04",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Fries Guys & The Side Café: employer yes via email to JobLink on 2026-11-04 for
  // Cooks, Barista/Bartender and Customer Service Staff. This entry is the Barista/Bartender vacancy.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "fb165818-e344-46b5-a3cd-c7e64d196523": {
    companyId: "6299b0b2-c4be-4499-9d4c-435d28775729",
    companyName: "Fries Guys & The Side Café",
    attestedOn: "2026-11-04",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // Site owner requested Google Jobs allowlist on 2026-11-06 for this already-live admin-posted listing (created 2026-11-03).
  // Site-owner attestation only. Full Time is an unconfirmed placeholder; no public deadline.
  "e60b9e69-cfdb-4edb-b7b6-e21e22bb24f2": {
    companyId: "7b03f6f7-50d6-4391-b189-dd983c32f4b0",
    companyName: "Progressive Vision",
    attestedOn: "2026-11-06",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/122",
    employmentTypeUnconfirmed: true,
  },
  // COLIBRI: employer approval recorded 2026-10-28 (ET) for this Chef de Partie vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "03cdd5df-68aa-4463-a367-04ccd83753ea": {
    companyId: "eda48543-634b-4687-9947-3aa970d46e97",
    companyName: "COLIBRI",
    attestedOn: "2026-10-28",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // COLIBRI: employer approval recorded 2026-10-28 (ET) for this Receptionist vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "4f55fb36-11b3-4f25-92b5-cb0bec5072e5": {
    companyId: "eda48543-634b-4687-9947-3aa970d46e97",
    companyName: "COLIBRI",
    attestedOn: "2026-10-28",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // COLIBRI: employer approval recorded 2026-10-28 (ET) for this Waitstaff vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "94783ec0-1666-46c8-8269-2dda50f59de6": {
    companyId: "eda48543-634b-4687-9947-3aa970d46e97",
    companyName: "COLIBRI",
    attestedOn: "2026-10-28",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Crab Hole Liquors Antigua: employer approval recorded 2026-10-26 (ET) for this Cashier vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "0f309f2c-015e-4317-a127-0fb35602c5cd": {
    companyId: "4f1f3752-7453-40d1-bf45-853d1264cba5",
    companyName: "Crab Hole Liquors Antigua",
    attestedOn: "2026-10-26",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Crab Hole Liquors Antigua: employer approval recorded 2026-10-26 (ET) for this Shelfpacker vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "89d89568-533e-4578-bdc6-d7ecd32e9af6": {
    companyId: "4f1f3752-7453-40d1-bf45-853d1264cba5",
    companyName: "Crab Hole Liquors Antigua",
    attestedOn: "2026-10-26",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Crab Hole Liquors Antigua: employer approval recorded 2026-10-26 (ET) for this Retail Sales Associate vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "d1c6f9db-534b-44c6-85aa-5fd3042e4d92": {
    companyId: "4f1f3752-7453-40d1-bf45-853d1264cba5",
    companyName: "Crab Hole Liquors Antigua",
    attestedOn: "2026-10-26",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Crab Hole Liquors Antigua: employer approval recorded 2026-10-26 (ET) for this Merchandising Specialist vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "ea373994-ba6d-466a-8fc7-d7c636c1278a": {
    companyId: "4f1f3752-7453-40d1-bf45-853d1264cba5",
    companyName: "Crab Hole Liquors Antigua",
    attestedOn: "2026-10-26",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // CMW Enterprise: employer approval recorded 2026-10-28 (ET) for this Italian-Speaking Tour Guide vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "21b4965b-27a8-4a6c-a93a-c1bcf9ad08c5": {
    companyId: "68fada5b-040a-4c46-ba37-245c37f1bef9",
    companyName: "CMW Enterprise",
    attestedOn: "2026-10-28",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Salt & Sun Antigua: employer approval recorded 2026-10-23 (ET) for this Café Assistants vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "2322e19f-df88-4daa-aebf-73e6df279a7f": {
    companyId: "c22443ac-bdb9-4702-81dd-9783ec08dd23",
    companyName: "Salt & Sun Antigua",
    attestedOn: "2026-10-23",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Leianna's Bar Restaurant and Jazz Lounge: employer approval recorded 2026-10-24 (ET) for this Experienced Chef vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "2a9263d9-3dd7-4361-b4a8-9c0411f41cb7": {
    companyId: "86f178fc-7b3d-48cb-aa25-19bfd6d55d4b",
    companyName: "Leianna's Bar Restaurant and Jazz Lounge",
    attestedOn: "2026-10-24",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Leianna's Bar Restaurant and Jazz Lounge: employer approval recorded 2026-10-24 (ET) for this Experienced Bartender vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "2f7f41ac-cfc3-4503-8d74-abdbe83dc469": {
    companyId: "86f178fc-7b3d-48cb-aa25-19bfd6d55d4b",
    companyName: "Leianna's Bar Restaurant and Jazz Lounge",
    attestedOn: "2026-10-24",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Leianna's Bar Restaurant and Jazz Lounge: employer approval recorded 2026-10-24 (ET) for this Line Cook vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "6fa21ae1-82d9-4657-999c-3aaa794e82ce": {
    companyId: "86f178fc-7b3d-48cb-aa25-19bfd6d55d4b",
    companyName: "Leianna's Bar Restaurant and Jazz Lounge",
    attestedOn: "2026-10-24",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Hamam Spa: employer approval recorded 2026-10-21 (ET) for this Spa Attendant vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "67fb31e8-fa90-4238-ab9d-1d09007d30f3": {
    companyId: "8f39a6e7-bcc5-4dca-ac72-9d2a4222edd3",
    companyName: "Hamam Spa",
    attestedOn: "2026-10-21",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Dove Cove Comfort Suites: employer approval recorded 2026-10-21 (ET) for this Housekeeper vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "7018747d-7e04-4328-9d22-2b3ea59bcc67": {
    companyId: "97537be2-d7e4-479f-9d7e-7682ade82a59",
    companyName: "Dove Cove Comfort Suites",
    attestedOn: "2026-10-21",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Dove Cove Comfort Suites: employer approval recorded 2026-10-21 (ET) for this Handyman vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "74e0d726-fd41-4071-84fe-ac75b49f3342": {
    companyId: "97537be2-d7e4-479f-9d7e-7682ade82a59",
    companyName: "Dove Cove Comfort Suites",
    attestedOn: "2026-10-21",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // Premier Cru: employer approval recorded 2026-10-28 (ET) for this Sales Associate vacancy only.
  // Full Time is an unconfirmed placeholder; no public deadline.
  "fe95bdf0-1745-41b2-bd27-03b6025b3473": {
    companyId: "fab263c5-baf0-48db-88de-276172542634",
    companyName: "Premier Cru",
    attestedOn: "2026-10-28",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/120",
    employmentTypeUnconfirmed: true,
  },
  // The Massage Goddess replied yes on 2026-10-19 (ET) by email reply to the JobLink
  // inbox to posting this Nail Technician vacancy. Full Time is an unconfirmed placeholder.
  "d00f5ff5-29cf-4110-9828-a2f84e49245f": {
    companyId: "5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3",
    companyName: "The Massage Goddess",
    attestedOn: "2026-10-19",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/76",
    employmentTypeUnconfirmed: true,
  },
  // ELand Courier Services replied yes on 2026-10-17 (ET) by email reply to the JobLink
  // inbox to posting this Driver/Office Assistant vacancy, confirmed Full Time.
  "e81d3a56-c9fe-42dd-99ab-a35398398582": {
    companyId: "d3c66ca7-9066-4f4a-a87c-a307b9d63ab5",
    companyName: "ELand Courier Services",
    attestedOn: "2026-10-17",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/76",
  },
  // Julian Laville (site owner) obtained The Tailor's Daughter Inc.'s permission directly and
  // attested it on 2026-10-16 (ET) for this Part-Time Retail Sales Associate vacancy, posted
  // at his request. Part Time per the employer's own post.
  "cead1cc1-636b-438b-9c8a-bd39fd02c045": {
    companyId: "bda01a15-de79-41fc-b10e-5c4126115860",
    companyName: "The Tailor's Daughter Inc.",
    attestedOn: "2026-10-16",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/71",
  },
  // Super Service Center replied yes on 2026-10-16 (ET) by email reply to
  // jobs@joblinkantigua.com to posting this Tire Technician vacancy. Full Time is an
  // unconfirmed placeholder.
  "e080f894-4e7f-48b7-b39a-1a274f52fd97": {
    companyId: "4b3ecdcd-01cc-4b67-8756-dc0247a04473",
    companyName: "Super Service Center",
    attestedOn: "2026-10-16",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/70",
    employmentTypeUnconfirmed: true,
  },
  // North Sound Brewery (Antigua Distillery) HR replied yes on 2026-10-16 (ET) to posting
  // this Brewmaster vacancy. Full Time per the employer's public Dadli Jobs posting.
  "7bd1f5b0-4da5-4177-b4c5-3cacc65b904b": {
    companyId: "07533d6c-77cc-4e6e-bdde-14d4fd3923a9",
    companyName: "North Sound Brewery (Antigua Distillery)",
    attestedOn: "2026-10-16",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/67",
  },
  // Trappas Restaurant and Bar replied yes on 2026-10-15 (ET) to posting this Experienced
  // Chef (Nights) vacancy. Full Time is an unconfirmed placeholder.
  "c38baf47-a23c-4908-b2ed-c80163d6b06d": {
    companyId: "a528f079-6706-4e64-a351-eabcc47359f4",
    companyName: "Trappas Restaurant and Bar",
    attestedOn: "2026-10-15",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/65",
    employmentTypeUnconfirmed: true,
  },
  // Trappas Restaurant and Bar replied yes on 2026-10-15 (ET) to posting this Kitchen
  // Staff (Nights) vacancy. Full Time is an unconfirmed placeholder.
  "ab781b7c-5c68-404f-bb7c-479a8b58264f": {
    companyId: "a528f079-6706-4e64-a351-eabcc47359f4",
    companyName: "Trappas Restaurant and Bar",
    attestedOn: "2026-10-15",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/65",
    employmentTypeUnconfirmed: true,
  },
  // Seagull Inflatables replied yes on 2026-10-14 (ET) to posting this Operations
  // & Admin Coordinator vacancy and confirmed it is Full Time (seasonal).
  "7181a600-df8e-45dd-b8d1-a0e910c1f494": {
    companyId: "8b95a031-0ce5-4e2d-9087-fda18d2ccc7c",
    companyName: "Seagull Inflatables",
    attestedOn: "2026-10-14",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/55",
  },
  // Antigua's Donkey Sanctuary replied yes on 2026-10-14 (ET) to posting this Team
  // Member (Visitor Services & Gift Shop) vacancy. Full Time is an unconfirmed placeholder.
  "66737b60-cf1a-4fd0-980c-14f1c9412923": {
    companyId: "ea87a75a-dece-4fd6-afa7-64efbd51a88d",
    companyName: "Antigua's Donkey Sanctuary",
    attestedOn: "2026-10-14",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/55",
    employmentTypeUnconfirmed: true,
  },
  // Hermitage Bay HR sent this Chef de Partie vacancy on 2026-10-13 asking JobLink to
  // post it, and confirmed it is Full Time.
  "97fec756-f008-4409-8e77-155a334d6f43": {
    companyId: "22a1fd24-ef01-4b55-8043-1cdca65bc25c",
    companyName: "Hermitage Bay",
    attestedOn: "2026-10-13",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/45",
  },
  // Hermitage Bay HR sent this Jr. Sous Chef vacancy on 2026-10-13 asking JobLink to
  // post it, and confirmed it is Full Time.
  "ddcfe8d3-f258-4447-9161-08e224a1a81a": {
    companyId: "22a1fd24-ef01-4b55-8043-1cdca65bc25c",
    companyName: "Hermitage Bay",
    attestedOn: "2026-10-13",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/45",
  },
  // Street Blends replied yes on 2026-10-12 (ET) to posting this Barista Prep
  // Assistants vacancy. Full Time is an unconfirmed placeholder.
  "03aeffa0-f680-46b2-b5eb-ea3891d0ce44": {
    companyId: "6b354ee5-ff32-44b3-a5c8-29f73650b51a",
    companyName: "Street Blends",
    attestedOn: "2026-10-12",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/41",
    employmentTypeUnconfirmed: true,
  },
  // Hermitage Bay HR replied on 2026-10-12 asking JobLink to post their roles,
  // starting with this Line Cook vacancy. Full Time is an unconfirmed placeholder.
  "40b28447-7653-4646-bc21-b8f0653d9409": {
    companyId: "22a1fd24-ef01-4b55-8043-1cdca65bc25c",
    companyName: "Hermitage Bay",
    attestedOn: "2026-10-12",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/41",
    employmentTypeUnconfirmed: true,
  },
  // Mark Thomas replied yes on 2026-10-09 to publishing this Van Sales
  // Assistant/Operator vacancy (Oct 9 to Oct 30) and later confirmed Full Time.
  "d4fdb396-a0b0-427d-aae0-ed756274375e": {
    companyId: "42e58a5e-3f56-4f2b-b829-b9b335d45b81",
    companyName: "Food Brokerage Services Ltd.",
    attestedOn: "2026-10-09",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/38",
  },
  // Lishawn Wilson replied yes on 2026-10-08 (ET) to posting this Rage Room
  // Attendant vacancy. Full Time is an unconfirmed placeholder.
  "ade78a5c-e0f6-4f5f-8008-117d7a4b96ee": {
    companyId: "1b68107a-228a-4e97-b047-d4c14bd730ef",
    companyName: "Shhatterr Shack Rage Room",
    attestedOn: "2026-10-08",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/38",
    employmentTypeUnconfirmed: true,
  },
  "232f9e93-d28c-4e8b-bdb5-3c85093e61d6": {
    companyId: "e9703c50-bfef-41fb-99f1-5ba9387418c2",
    companyName: "Star Times Adventure Tours",
    attestedOn: "2026-10-06",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/25",
    // The approval record documents full_time as an unconfirmed placeholder.
    employmentTypeUnconfirmed: true,
  },
  "318d3b16-6aff-453c-b0d3-fc5f2d779783": {
    companyId: "1b11e815-e80b-4b35-affe-55c1d1fc16db",
    companyName: "MOfit Gym and Fitness Centre",
    attestedOn: "2026-09-30",
    evidenceReference: "owner-attestation:2026-09-30:Sentinel_cace3b51c42c81919512b87c905bc49a",
  },
  "bb1b011d-4e5c-4005-81b6-bc70c48acf4f": {
    companyId: "6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961",
    companyName: "Woodstock BoatBuilders",
    attestedOn: "2026-09-30",
    evidenceReference: "owner-attestation:2026-09-30:Sentinel_cace3b51c42c81919512b87c905bc49a",
    // Original description: "Apply before: 29 October 2026". No time was supplied.
    validThrough: "2026-10-29",
  },
};

// Company-wide permission is recorded from the site owner's explicit attestation.
// Existing vacancy metadata and Top Bun's type correction are retained.
export const EMPLOYER_APPROVED_COMPANIES: Record<string, EmployerApproval> = {
  "362300b7-c0c5-4c2e-a9f6-6fe79f187e71": {
    companyName: "Top Bun Antigua",
    approvedOn: "2026-09-25",
    jobTypeOverrides: {
      // "Cook (Part time, Saturday only)" is stored as full_time.
      "e03a2b8c-f69b-42bb-bc43-13a5d0917291": "part_time",
    },
  },
  "1b11e815-e80b-4b35-affe-55c1d1fc16db": {
    companyName: "MOfit Gym and Fitness Centre",
    approvedOn: "2026-09-30",
  },
  "6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961": {
    companyName: "Woodstock BoatBuilders",
    approvedOn: "2026-09-30",
  },
  // Owner-attested company-wide approval on 2026-10-05; see the approval ledger.
  "9fde7fc7-70b3-4354-9d11-d520f4ec09f9": {
    companyName: "Nobu Barbuda",
    approvedOn: "2026-10-05",
  },
};

export function getEmployerApproval(
  companyId: string | null | undefined,
  jobId?: string | null
): EmployerApproval | JobApproval | null {
  if (!companyId) return null;

  if (jobId && Object.hasOwn(EMPLOYER_APPROVED_JOBS, jobId)) {
    const approval = EMPLOYER_APPROVED_JOBS[jobId];
    if (approval.companyId === companyId) return approval;
  }

  return Object.hasOwn(EMPLOYER_APPROVED_COMPANIES, companyId)
    ? EMPLOYER_APPROVED_COMPANIES[companyId]
    : null;
}
