/** Synthetic editorial benchmark, NOT provider outputs or measured model accuracy.
 * Levels are reviewable expectations for a future authorized model evaluation.
 * No real résumé, identity or contact data is included.
 */
export type QualityCalibrationCase = {
  id: string
  text: [string, string]
  levels: [number, number, number]
  expectedScoreRange: [number, number]
  rationale: [string, string, string]
}
export const QUALITY_CALIBRATION_CASES: QualityCalibrationCase[] = [
  { id: 'vague-aspirational',
    text: ['Office assistant. Seeking an opportunity to excel and deliver excellence. Responsible for things and various duties in a busy environment. Helping where needed and doing general work.', 'Skills: administration, spreadsheets and record keeping. Seeking growth and development while contributing to success. Various activities and tasks as needed.'],
    levels: [1, 2, 1], expectedScoreRange: [2, 4],
    rationale: ['Repetitive aspirations obscure the actual work.', 'Work and skills can be located, but activities have weak associations.', 'Generic duties and skill labels give little activity context.'] },
  { id: 'ordinary-usable',
    text: ['Office assistant and reception assistant. Processed invoices and maintained records. Helped with stock reports, general office duties and other administrative tasks when needed.', 'Skills: spreadsheet records and filing. Used spreadsheets for office work and helped with documents. Assisted colleagues with administrative matters and general support.'],
    levels: [2, 2, 2], expectedScoreRange: [5, 6],
    rationale: ['Meaning is understandable but several phrases are vague.', 'Two roles are named, but some supporting tasks are not associated with either role.', 'Some concrete duties appear, but methods and responsibility context are thin.'] },
  { id: 'clear-but-thin',
    text: ['Office assistant and stock assistant. Processed supplier invoices, filed receipts and prepared stock reports. Assisted with general office work and maintained administrative records.', 'Skills: spreadsheets, filing and document handling. Used spreadsheets for reports. Helped with stock records and other administrative tasks.'],
    levels: [3, 2, 2], expectedScoreRange: [5, 6],
    rationale: ['Most task statements are direct and readily understandable.', 'The two named roles are recoverable, but the supporting tasks are not clearly allocated.', 'Tasks are named, but how the records and reports were handled remains thin.'] },
  { id: 'strong-routine-work',
    text: ['Office assistant. Checked supplier invoices against delivery records, recorded discrepancies in a spreadsheet and sent unresolved items to the stock team.', 'Spreadsheet practice: used filters to group unresolved invoices and entered corrections after the stock team confirmed the delivery quantities. Filed the invoice with its matching delivery record. Also helped update other records.'],
    levels: [3, 4, 3], expectedScoreRange: [7, 8],
    rationale: ['Direct task wording dominates; other records remains a minor imprecise phrase.', 'The role and supporting invoice procedure have consistently unambiguous associations.', 'Most actions and methods are concrete, but the other records claim lacks context.'] },
  { id: 'exceptional-routine-work',
    text: ['Stockroom assistant. Compared delivered items with the delivery note, separated mismatches for supervisor review and entered accepted quantities in the stock register.', 'Stock register procedure: recorded the item reference and shelf location, then used the register to find items requested by the counter team. Kept unresolved delivery entries separate until the supervisor confirmed corrections.'],
    levels: [4, 4, 4], expectedScoreRange: [9, 10],
    rationale: ['Precise economical statements explain each activity without filler.', 'The supporting procedure is unambiguously linked to the stockroom role.', 'Actions, records and escalation boundaries consistently contextualize the claims.'] },
  { id: 'exceptional-entry-level',
    text: ['Bookkeeping course project. Entered sample purchase invoices into a spreadsheet, matched each entry to its source document and flagged duplicated invoice references.', 'Project checking method: compared the spreadsheet totals with the supplied sample ledger, traced differences to individual entries and recorded each correction beside the source reference. This was classroom practice, not employment.'],
    levels: [4, 4, 4], expectedScoreRange: [9, 10],
    rationale: ['Concise precise statements distinguish practice from employment.', 'The checking method clearly belongs to the identified course project.', 'Tasks and checking methods support the claims without experience or metrics requirements.'] },
  { id: 'outstanding-volunteer',
    text: ['Community pantry volunteer. Matched each packed food parcel to its collection list, labelled the parcel with its collection reference and placed it in the corresponding pickup group.', 'Collection procedure: checked each reference against the list before handing over the parcel. Recorded uncollected parcels for the coordinator and helped with general preparation.'],
    levels: [4, 4, 3], expectedScoreRange: [9, 10],
    rationale: ['Wording is precise, economical and easy to understand.', 'Collection steps are consistently associated with the pantry activity.', 'Most claims have concrete context; general preparation remains a minor thin statement.'] },
  { id: 'mixed-role-associations',
    text: ['Office assistant and shop assistant. Checked invoices against delivery notes and entered accepted quantities in the register. Handled counter enquiries and recorded unresolved orders.', 'Used a spreadsheet to flag invoice discrepancies. Explained product options. Prepared weekly records for a supervisor. The text does not associate these activities with either named role.'],
    levels: [3, 1, 3], expectedScoreRange: [5, 6],
    rationale: ['Individual task sentences are direct and clear.', 'The two roles are named but their task associations are unresolved.', 'Activities contain useful task and method context despite the structural problem.'] },
  { id: 'supported-skills-improved',
    text: ['Office assistant. Checked supplier invoices against delivery notes, logged mismatches for the stock team and filed confirmed corrections beside the matching invoice.', 'Spreadsheet use: grouped open mismatches with filters and recorded the stock team’s response beside each invoice reference. Used the list to follow up outstanding corrections. Also helped with general filing.'],
    levels: [3, 4, 3], expectedScoreRange: [7, 8],
    rationale: ['Direct task wording dominates; general filing is a minor vague phrase.', 'Every statement is clearly associated with the single invoice-handling role.', 'Methods support the spreadsheet claims, but general filing remains thin on context.'] },
]
