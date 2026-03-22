import type { CvFull } from '@/lib/types'

export interface CvCompletionResult {
  percentage: number
  missing: string[]
}

const CRITERIA: { label: string; weight: number; check: (cv: CvFull) => boolean }[] = [
  {
    label: 'Job title',
    weight: 15,
    check: (cv) => !!cv.profile.job_title?.trim(),
  },
  {
    label: 'Professional summary',
    weight: 15,
    check: (cv) => !!cv.profile.summary?.trim(),
  },
  {
    label: 'Work experience',
    weight: 25,
    check: (cv) => cv.experiences.length > 0,
  },
  {
    label: 'Education',
    weight: 20,
    check: (cv) => cv.education.length > 0,
  },
  {
    label: 'At least 3 skills',
    weight: 15,
    check: (cv) => cv.skills.length >= 3,
  },
  {
    label: 'Award or certification',
    weight: 10,
    check: (cv) => cv.awards.length > 0 || cv.certifications.length > 0,
  },
]

export function calculateCvCompletion(cv: CvFull): CvCompletionResult {
  const missing: string[] = []
  let earned = 0

  for (const c of CRITERIA) {
    if (c.check(cv)) {
      earned += c.weight
    } else {
      missing.push(c.label)
    }
  }

  return { percentage: earned, missing }
}
