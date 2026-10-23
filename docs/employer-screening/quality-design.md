# Local resume-document quality observations

## Scope and contract

This is a deterministic, employer-facing document-presentation assessment. It is not candidate quality, hiring suitability, skill proficiency, credential verification or a job-match score. Never use it for automatic ranking, rejection or a blended match total.

`assessResumeDocumentQuality({ sourceSha256, localPages }, expectedSourceSha256)` returns an assessed report or `{ status: 'unavailable' }`. The capture caller must supply transient pages from the same bounded parser invocation that parsed the attached PDF bytes and computed the expected hash. A matching caller-supplied hash is not independently proof that arbitrary pages came from those bytes.

`resumeDocumentQualitySchema` validates the persisted report shape and recomputes all totals. `validateResumeDocumentQuality(report, expectedSourceSha256)` additionally enforces capture identity. Neither validator reconstructs the original PDF. Evidence authenticity is established by the trusted local assessment and immutable capture boundary, not by accepting a submitted report from an applicant.

No network, model, filesystem, logging, time-dependent scoring or provider request occurs in the evaluator. The imported reviewed proposition predicate is local; job requirements and job-match weights do not enter the calculation. No raw pages, applicant names, company names, free-form prose or contact details are included in the report.

## Fixed rubric

Each dimension has 25 possible points. The unit of observation is a provided, locally recognized entry; additional bullet points do not increase its weight.

1. **Text organization:** an explicit reviewed professional section heading is visible. This is a text cue only, not visual layout, font choice or correct reading order.
2. **Provided-entry identification:** a recognizable professional role, project or credential is associated with explicitly delimited organization/issuer context. Mere nonempty `Role: X` and `Employer: X` labels do not qualify.
3. **Task/evidence presentation:** an entry contains a concrete action-and-work-object statement or reviewed professional evidence claim. A task label, skill keyword list, filler or arbitrary nonempty prose does not qualify. Review uses finite whole-proposition membership and bounded action/object grammar, not language fluency or prose polish.
4. **Professional entry context:** the concrete statement is linked to an identified entry and organization/issuer context. Valid source spans alone earn no points; the relationship must be locally observable.

Supported, explicitly needing attention and unknown observations remain distinct. The only negative observation currently supported is an exact, field-specific unfilled template marker such as `Role: [Enter role]` or `Task: [Insert task]`. Blank fields, unfamiliar wording, missing sections, absent employment history, missing dates, omitted contact data, missing metrics, non-observable layout and extraction limitations are unknown, not faults.

Within each dimension, supported weight = 25 × supported observations / all observations. Observable weight = 25 × non-unknown observations / all observations. Unknown weight is the remainder. Values are rounded to two decimal places; totals are sums of dimension weights. There is no rescaling to make partial coverage look complete.

The compact employer email shows supported presentation credit out of 10 against the fixed whole 100-point rubric, alongside bounded grounded notes. It never divides by the observed subtotal to inflate partial coverage: 50 supported / 50 observable / 50 unknown appears as 5/10 supported with an explicit partial-assessment caption, not 10/10. All-unknown/unavailable appears as not assessed. This concise supported-credit display is not an assertion that unknown checks failed. Detailed assessed/unassessed point totals remain private. The internal structured report retains all numeric fields. If a detailed approved caller renders these numbers, it must render the supported and observable denominator together with unknown weight and coverage. For example, `50 / 50 observable document-presentation points; 50 unknown; 50% coverage` is a partial assessment, not `100/100`. An all-unknown report must be described as unassessable, not a zero-quality resume. A fully observable report is still this narrow rubric, not a claim of excellent writing, completeness, factual accuracy or candidate merit.

## Supported source layouts and evidence

- Whole reviewed professional headings, including exact literal letter-spaced variants emitted by JobLink's own PDF template, such as `E X P E R I E N C E`.
- Role/project/credential and context separated by a literal spaced pipe. A comma header is accepted only when the left-hand title is recognized.
- A recognized standalone title followed immediately by a bounded non-sentence context line, as produced by JobLink's builder. Dates may follow, but are not required or assessed.
- Meaningful professional fields with exact supported labels.
- Concrete task statements on plain lines or conventional bullet lines. Bounded reviewed action/object prefixes can identify a complete local statement before additional modifiers; arbitrary trailing material is not quoted or forwarded.

All page numbers are one-based. Spans are zero-based UTF-16 offsets into the exact decoded parser page text. Text is not rewritten or joined across pages. Unrecognized professional lines break the current entry association and create unresolved coverage; later tasks cannot silently attach to an earlier recognized role. Optional excerpts are exact source slices limited to safe reviewed headings, field labels, unfilled template markers or reviewed professional action/object prefixes. Organization names and other unrestricted values remain offset-only evidence. Render an offset-only reference honestly; do not invent a quote to fill it.

The test suite includes an actual `renderBuilderResume → extractPdfResume → assessResumeDocumentQuality` path. It does not replace the builder's PDF content with an artificial labeled template. Ordinary hospitality, administration and trades fixtures retain their original headers and long task statements.

## Bounds and safeguards

Input limits match the bounded PDF parser: 20 pages, 30,000 characters/page and 120,000 total characters. Additional limits apply to 10,000 lines, 40 recognized sections, 80 entries, 400 fields, 2,000 characters/field and 80 findings/dimension. Oversized or malformed input is unavailable, never truncated into a different assessment.

Persisted report validation has node, depth, string, array, enum, point-consistency, unique-per-finding span, quote-length and safe-excerpt checks. Unknown properties and input accessors are rejected. Reports never echo arbitrary supplied feedback. `resumeQualityFeedback(code)` returns fixed messages.

Explicit model-directed control text makes assessment unavailable; it is never executed. Negative, hypothetical or instruction-like task context prevents positive task observations. This is conservative rejection, not a claim of general prompt-injection or PII detection. No URLs are opened and no credential claim is externally verified.

## Limitations and fairness

- The finite role/task vocabulary is deliberately limited. Unsupported careers, languages, paraphrases and layouts remain unknown. Coverage must remain visible; differences in recognizability must not become a proxy for candidate merit.
- The evaluator cannot establish full resume completeness, prose quality, design quality, truthful employment, attribution in arbitrary narrative, credential validity or meaningful achievements from arbitrary text.
- A concrete applicant-reported statement is not verified professional competence. Dates, gaps, chronology, organization prestige, contact disclosure, age, protected traits, spelling, grammar and native-language polish do not contribute to points.
- Multiple-column, scanned, OCR-only, cross-page continuation and ambiguous structure are not reconstructed. Empty/unreadable input is unavailable. In a partly readable PDF, supported observations describe only readable text; they are not a claim about unseen image content.
- Missing work history is not a negative result. A short/new-career resume may show skills, project or volunteer evidence without paid employment. Unsupported fields remain unresolved rather than receiving deductions.
- The rubric version must change when supported rules or weights materially change. This module must remain independently available when a job rubric or model response is unavailable.
