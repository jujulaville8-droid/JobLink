/**
 * Whole-clause admission guard for public job text, rechecked at the paid
 * boundary. This bounded English-text heuristic is NOT a PII-redaction guarantee.
 * Never strip a rejected fragment and admit the remainder as a requirement.
 * Only independently classified professional clauses are eligible.
 */
export const MAX_PUBLISHED_JOB_CLAUSE_CHARS = 300
// Match the core snapshot/assessment bound. Never discard a tail of job clauses.
export const MAX_PUBLISHED_JOB_CRITERIA = 20
export const MAX_PUBLISHED_JOB_CONTEXT_CHARS = 4000
const contact = /(?:https?:\/\/|www\.|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\b[a-z0-9-]+\.(?:com|org|net|co|io)\b|(?:\+?\d[\s().-]*){7,}|\b(?:e-?mail|telephone|phone|whatsapp)\s*[:=]|\b(?:street address|postal address|contact details|contact information)\b)/i
const sensitive = /\b(?:age(?:d)?|birth(?:day|place)?|date of birth|gender|male|female|men|women|boys|girls|pregnan\w*|matern\w*|marital|married|single parent|religio\w*|christian|muslim|hindu|jewish|race|racial|ethnic\w*|nationality|nationals?|citizen\w*|citizenship|ancestry|sexual|orientation|transgender|disabil\w*|disabled|handicap\w*|medical|medication|diagnos\w*|health condition|healthy|mental health|hiv|aids|cancer|wheelchair|able[- ]bodied|deaf|blind|passport|social security|ssn|taxpayer|national id|bank account|credit score|criminal|conviction|work permit|immigration|residen\w*)\b/i
const eligibilityOrLocation = /\b(?:legally (?:able|eligible|authori[sz]ed)|right to work|eligible to work|authori[sz]ation to work|located in|live in|living in|based in|must be from|native speaker|mother tongue|born in)\b/i
const physicalCondition = /\b(?:lift|carry|lifting|carrying)\b.{0,40}\b(?:lb|lbs|pounds?|kg|kilograms?)\b|\b(?:physically fit|physical fitness|good health|medical clearance|drug test)\b/i
const conditionPhrase = /\b(?:good|excellent) physical condition\b/i
// This whole-record technical duty describes an object, not a person's capacity.
// Do not rescue equipment text from a mixed human-capacity requirement.
const equipmentConditionDuty = /^(?:maintain|keep|inspect|check|assess) (?:the )?(?:equipment|machinery|tools|vehicles) (?:(?:is|are) )?in (?:good|excellent) physical condition[.!]?$/i
const individualData = /\b(?:my|his|her|their) (?:name|address|age|doctor|diagnosis|password|account|phone)|\b(?:password|secret|api key|access token|recovery code)\b|\b[A-Z]{1,3}\d{6,}\b/i
const instructions = /\b(?:system prompt|developer message|chatgpt|openai|language model|rubric|screening score|return json|output json|award \d|rank applicants|reject applicants)\b|\b(?:ignore|disregard|override|forget)\b.{0,60}\b(?:instructions?|rules?|prompt|criteria|above|previous)\b|(?:\[\/?(?:system|assistant|user)\]|```|<|>)/i
const personalTraits = /^(?:(?:must be|be|a|an)\s+)?(?:friendly(?: and professional)?|reliable(?: and punctual)?|punctual|honest|trustworthy|positive(?:,? enthusiastic)? attitude|enthusiastic(?: about .+)?|team player|hard[- ]working|good personality|strong work ethic)[.!]?$/i
const ageShorthand = /\b\d{1,3}\s+(?:or\s+(?:older|younger)|years?\s+(?:old|of age))\b/i
const explicitAgePlus = /\b(?:must|should|need to)\s+be\s+(?:at least\s+)?\d{1,3}\s*\+/i
// A '+' age rule may be mixed with job work. Explicit years-of-experience text
// is distinct; do not turn an ordinary tenure requirement into an age rule.
const agePlusShorthand = /\b\d{1,3}\s*\+(?!\s*years?\s+(?:in|as|with)\b|\s*years?(?:\s+(?!old\b|of age\b)[\w-]+){0,5}\s+experience\b)/i
const pureAgeEligibility = /^(?:(?:applicants?|candidates?)\s+)?(?:(?:must|should|need to)\s+be\s+|(?:age|aged|minimum age)\s*:?\s*)?(?:at least\s+)?\d{1,3}(?:\s+or\s+(?:older|younger)|\s+years?\s+(?:old|of age)(?:\s+or\s+(?:older|younger))?|\s*\+)[.!]?$/i
/** Only a complete standalone age rule can be intentionally excluded. Mixed
 * professional requirements remain a material omission, never fragment rescue. */
export function isPureAgeEligibilityClause(value: unknown): boolean {
  return typeof value === 'string' && value.length <= MAX_PUBLISHED_JOB_CLAUSE_CHARS &&
    value === value.trim() && pureAgeEligibility.test(value)
}
export function isSafePublishedJobClause(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PUBLISHED_JOB_CLAUSE_CHARS &&
    value === value.trim() && !/[^\x20-\x7e\u2010-\u2015\u2018\u2019\u201c\u201d]/.test(value) &&
    !contact.test(value) && !sensitive.test(value) && !eligibilityOrLocation.test(value) &&
    !physicalCondition.test(value) && (!conditionPhrase.test(value) || equipmentConditionDuty.test(value)) &&
    !individualData.test(value) && !instructions.test(value) && !personalTraits.test(value) &&
    !ageShorthand.test(value) && !explicitAgePlus.test(value) && !agePlusShorthand.test(value) && !isPureAgeEligibilityClause(value)
}
export const validatePublishedCriterionText = isSafePublishedJobClause
