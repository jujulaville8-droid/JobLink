import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import SeekerDetailsFields from '@/components/profile/SeekerDetailsFields'
import SeekerDetailsSummary from '@/components/profile/SeekerDetailsSummary'
import { EMPTY_SEEKER_DETAILS, EMPTY_SENSITIVE_DETAILS } from '@/lib/seeker-details'

afterEach(cleanup)

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

it('reads the sensitive-details table only from the seeker profile, its API, and the admin application detail', () => {
  const readers = files('src').filter(path => /from\(['"]seeker_sensitive_details['"]\)/.test(readFileSync(path, 'utf8'))).sort()
  expect(readers).toEqual([
    'src/app/(dashboard)/profile/page.tsx',
    'src/app/api/admin/applications/[applicationId]/route.ts',
    'src/app/api/profile/route.ts',
  ])
})

it('labels the sensitive fields as optional, voluntary and admin-only', () => {
  const onSensitive = vi.fn()
  render(<SeekerDetailsFields details={EMPTY_SEEKER_DETAILS} sensitive={EMPTY_SENSITIVE_DETAILS} onDetailsChange={vi.fn()} onSensitiveChange={onSensitive} />)
  expect(screen.getByLabelText(/Marital status \(optional, voluntary, only visible to JobLinks admin\)/)).toBeTruthy()
  expect(screen.getByLabelText(/Number of children \(optional, voluntary, only visible to JobLinks admin\)/)).toBeTruthy()
  expect(screen.getByText(/Only visible to JobLinks admin/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/Marital status/), { target: { value: 'married' } })
  expect(onSensitive).toHaveBeenCalledWith({ marital_status: 'married', children_count: null })
})

it('employer-style summaries without sensitive props never render personal details', () => {
  const { container } = render(<SeekerDetailsSummary details={{ ...EMPTY_SEEKER_DETAILS, currently_employed: true }} />)
  expect(container.textContent).toContain('Currently employed')
  expect(container.textContent).not.toMatch(/marital|children|personal details/i)
})
