# Bounded dependency review — 2026-10-21

The baseline already pins Next 16.3.6, sharp 0.35.4 and source-map-js 1.2.1. This patch adds only pdfjs-dist 6.4.299 and its optional canvas dependencies. The local npm audit reported three high-severity package findings for the existing dependencies, no finding for PDF.js or its optional canvas packages. No broad unrelated upgrade was performed. This is a scope assessment, not a whole-application security certification.

## Next.js

The six reported advisories have reviewed affected ranges ending at 16.3.8. npm audit proposes 16.4.2, which is not the minimum fix for this set. Existing risks should be addressed in a targeted maintenance change.

- [Draft Mode cache leakage](https://github.com/vercel/next.js/security/advisories/GHSA-3w37-wq28-93x7): requires Cache Components/useCache plus Draft Mode; neither found.
- [Self-hosted Pages Router SSG/ISR cache poisoning](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676): no Pages Router in this app; advisory excludes Vercel deployments.
- [Cross-route SSG/ISR substitution](https://github.com/vercel/next.js/security/advisories/GHSA-mcj8-r9mp-w47p): requires a root catch-all page; none found.
- [Development MCP disclosure](https://github.com/vercel/next.js/security/advisories/GHSA-39w2-rjm5-chcv): development-server risk, not a production-only screening route.
- [Metadata image disclosure](https://github.com/vercel/next.js/security/advisories/GHSA-f87g-xv8r-7p7x): affected webpack metadata routes/excluded dynamic parameters not found.
- [Image optimization SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4): existing configuration restricts remote images to one fixed Supabase HTTPS host and company-logo path, without query strings. This reduces exposure but is not proof of immunity. Screening does not use image optimization or expand the allowlist.

## sharp

[Maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w): a librsvg memory vulnerability can permit code execution under particular glibc/Linux conditions. sharp 0.35.5 includes fixed librsvg 2.63.2. The existing admin logo path calls sharp.metadata before confirming actual image format, so the later SVG rejection is not proof of parser safety. The route is admin-authenticated; exploitability was not tested. Prioritize a separate targeted remediation. New PDF extraction does not call sharp or render images.

## source-map-js

[Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): malicious indexed-source-map offsets can synchronously block the event loop; fixed in 1.2.2. This existing build dependency is not used to parse applicant input, and no application-facing source-map parser was found.

## Parser/runtime boundary

PDF.js performs text extraction in a bounded, terminable Node worker. Document JavaScript, annotation execution, external resource fetching, eval, image/font rendering and OCR are not requested. The worker is not an OS/native-memory sandbox. Vercel/Node compatibility, traced assets, memory/load limits and malformed-PDF behavior must also be smoke-tested in the approved deployment. Local synthetic parser tests are not live-infrastructure validation.
