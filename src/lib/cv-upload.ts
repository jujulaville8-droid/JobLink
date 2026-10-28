/** Shared browser/server policy for the private seeker CV bucket. */
export const MAX_CV_BYTES = 10 * 1024 * 1024
export const CV_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif',
} as const
export type CvExtension = keyof typeof CV_TYPES
export const CV_ACCEPT = [...Object.keys(CV_TYPES).map(ext => `.${ext}`), ...Object.values(CV_TYPES)].join(',')
export const CV_FALLBACK = 'Having trouble? Email your resume to support@joblinkantigua.com.'
export const CV_NETWORK_ERROR = 'Resume upload failed. Check your internet connection and try again, or email your resume to support@joblinkantigua.com.'

export function cvExtension(name: string): CvExtension | null {
  const ext = name.trim().replace(/ \(\d+\)$/, '').split('.').pop()?.toLowerCase() || ''
  return Object.prototype.hasOwnProperty.call(CV_TYPES, ext) ? ext as CvExtension : null
}

export function validateCvFile(file: { name: string; size: number; type?: string }) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return { error: 'This file is empty or unreadable. Choose another resume file.' } as const
  if (file.size > MAX_CV_BYTES) return { error: 'Your resume is too large. Choose a file of 10 MB or less, or email it to support@joblinkantigua.com.' } as const
  // Phone document providers often supply empty, generic, or incorrect MIME types.
  // An allowed extension takes precedence; recognized MIME is the fallback for unknown extensions.
  const extension = cvExtension(file.name) || (Object.keys(CV_TYPES) as CvExtension[]).find(ext => CV_TYPES[ext] === file.type?.toLowerCase())
  if (!extension) return { error: 'Unsupported resume format. Choose PDF, DOC, DOCX, JPG, PNG, HEIC or HEIF.' } as const
  return { extension, contentType: CV_TYPES[extension] } as const
}

/** Only a flat, owned object path may be recorded or read on behalf of a seeker. */
export function ownedCvPath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string') return false
  const parts = path.split('/')
  return parts.length === 2 && parts[0] === userId &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(parts[1]) && !parts[1].includes('..') && !!cvExtension(parts[1])
}
