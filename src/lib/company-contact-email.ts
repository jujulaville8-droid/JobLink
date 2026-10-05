export type CompanyContactEmailResult =
  | { valid: true; email: string | null }
  | { valid: false }

/** Admin-created accounts have no employer inbox and must never receive CVs. */
export function isAdminCompanyPlaceholderEmail(email: string): boolean {
  return /^admin-company-[^@]*@joblinkantigua\.com$/i.test(email.trim())
}

/** A single plain mailbox address; null or blank explicitly clears the contact. */
export function parseCompanyContactEmail(value: unknown): CompanyContactEmailResult {
  if (value === null) return { valid: true, email: null }
  if (typeof value !== 'string') return { valid: false }
  const email = value.trim().toLowerCase()
  if (!email) return { valid: true, email: null }
  if (email.length > 254 || isAdminCompanyPlaceholderEmail(email)) return { valid: false }

  const parts = email.split('@')
  if (parts.length !== 2) return { valid: false }
  const [local, domain] = parts
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { valid: false }
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return { valid: false }
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return { valid: false }
  }
  return { valid: true, email }
}
