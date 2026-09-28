export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Keep the employer's exact words; never invent outcomes or hiring metrics. */
export function caseSnippet(feedback: string): string {
  if (feedback.length <= 280) return feedback
  const prefix = feedback.slice(0, 280)
  return prefix.slice(0, prefix.lastIndexOf(' ') > 180 ? prefix.lastIndexOf(' ') : 280) + '…'
}

export function insertProof(html: string, proof: string): string {
  if (!proof) return html
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => `${proof}</body>`) : html + proof
}
