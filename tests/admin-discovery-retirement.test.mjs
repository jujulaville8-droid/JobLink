import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

test('admin navigation no longer advertises discovery', () => {
  const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8')
  assert.ok(!navbar.includes('/admin/discovered'))
  assert.ok(navbar.includes('/admin/approvals'))
  assert.ok(navbar.includes('/admin/users'))
})

test('retired route only checks admin access and redirects; no discovery actions remain', () => {
  const directory = new URL('../src/app/(dashboard)/admin/discovered/', import.meta.url)
  const page = readFileSync(new URL('page.tsx', directory), 'utf8')
  assert.match(page, /await requireRole\('admin'\)/)
  assert.match(page, /redirect\('\/dashboard'\)/)
  assert.ok(!page.includes('discovered_businesses'))
  assert.ok(!page.includes('use server'))
  assert.equal(existsSync(new URL('RunDiscoveryButton.tsx', directory)), false)
})
