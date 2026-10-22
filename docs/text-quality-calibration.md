# Text quality calibration: text-quality-2026-10

## Scope and intended interpretation

This changes only the quality prompt's dimension-specific anchors and new-report
labeling. It does not change role-fit anchors or the shared deterministic formula:
round((clarity + organization + specificity) * 10 / 12). Ordinary usable text
fits level 2; consistently strong text level 3; exceptional precision and
consistency level 4. Thus [2,2,2] is 5/10, [3,2,2] is 6/10, [3,3,3] is 8/10,
and [4,4,3] is 9/10. These are document ratings, not candidate rankings.

This is not a subtraction, fixed score cap, target distribution, or adjustment
for one person's résumé. The same highest anchors are attainable by concise
routine-work, volunteer and classroom examples without metrics, seniority,
prestige, prescribed headings, bullets or polished visual design. Specificity
means explaining the stated activity, not having more impressive achievements.
Clarity concerns meaning, not dialect conformity. Unknown extraction or omitted
scope must remain unknown rather than becoming an observed weakness.

Only supplied professional text is assessed. No visual inspection is added;
clipped dates or visual spacing cannot be detected or scored. New emails say
“Résumé text quality” and explicitly exclude visual layout. The role-fit title,
score and wording are unchanged. Quality rationales can identify concrete
presentation defects without making statements about the person's ability.

## Persistence and historical behavior

New reports carry scope.qualityRubricVersion = text-quality-2026-10. The absent
field means the historical shared ladder, not the new anchors. Saved reports
are not rescored, relabeled or backfilled. Existing arithmetic, unknown gates,
independent quality/job-context gates, and historical pre-independent scope
behavior are retained. Unsupported future rubric IDs fail closed. This
metadata fits the existing JSON report; no SQL migration is needed.

## Offline benchmark and its limits

The synthetic cases in tests/fixtures/text-quality-calibration.ts are editorial
expectations, not model outputs. Each records source text, expected dimension
anchors, a score range and a human-readable reason per dimension. Cases cover
vague filler, ordinary usable text, clear but thin descriptions, strong routine
work, exceptional routine work, entry-level coursework, volunteering and
mixed role associations. Paired editorial examples improve context and role associations;
identity-only input changes are checked through the real projection. Prestige-only
variants hold the expected quality levels constant.

Tests validate source admissibility, schema, arithmetic, all 125 quality level
combinations and every one-step improvement, role-fit independence, historical
rendering, metadata validation and scope guards. They do not prove semantic
entailment or that Sol will assign the expected levels. The existing synthetic
email's manually assigned 3/3/3 still gives 8; it is not a model calibration result.

No paid API calls or real applicant documents were used. Before describing this
as empirically calibrated, separately authorize a bounded Sol evaluation using
these synthetic inputs, blinded editorial review and the existing shared budget
cap/no-retry mechanism. Compare actual dimension rationales and levels against
the documented anchors, investigate disagreements (especially entry-level,
routine-work and prestige variants), and report observations honestly rather
than forcing exact target scores. Live model behavior remains untested here.

## Operational invariants

No changes to model/provider, consent, identity/contact exclusions, application
flow, one-email delivery, budget reservations, shared $5 cap, retries, role-fit
rubric, environment configuration, database schema or deployment are included.
This is a local patch for independent review, not a release authorization.

## Request-size impact

The instruction string grows from 6,034 to 10,060 characters (UTF-8 bytes:
6,054 to 10,080), an increase of 4,026 bytes. The examples remain local fixtures,
not few-shot provider input. Exact Sol token count and cost were not requested.
The existing count-before-reservation uses the same instruction/input/schema
fields as generation, so the extra input is counted within the unchanged
budget and input ceilings; the 64KB request guard is unchanged.
