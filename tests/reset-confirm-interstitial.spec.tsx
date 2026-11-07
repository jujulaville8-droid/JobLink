import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'
import ResetConfirmPage, { metadata } from '@/app/auth/reset-confirm/page'
import * as verifyRoute from '@/app/auth/reset-confirm/verify/route'

const api = vi.hoisted(() => ({ createClient: vi.fn(), verifyOtp: vi.fn(), getUser: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: api.createClient }))

const origin = 'https://joblinkantigua.com'
const tokenHash = 'single-use-recovery-token'

function submit(params: Record<string, string>, headers?: HeadersInit) {
  const request = new NextRequest(`${origin}/auth/reset-confirm/verify`, {
    method: 'POST',
    body: new URLSearchParams(params),
  })
  // Happy DOM strips browser-forbidden headers in the Request constructor.
  // Set them afterward to model the headers received by the server.
  new Headers(headers).forEach((value, name) => request.headers.set(name, value))
  return verifyRoute.POST(request)
}

beforeEach(() => {
  api.createClient.mockResolvedValue({ auth: { verifyOtp: api.verifyOtp, getUser: api.getUser } })
  api.verifyOtp.mockResolvedValue({ error: null })
  api.getUser.mockResolvedValue({ data: { user: null }, error: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('reset confirmation interstitial', () => {
  it('renders a POST form without creating a client or redeeming the token', async () => {
    const { container } = render(await ResetConfirmPage({
      searchParams: Promise.resolve({ token_hash: tokenHash, type: 'recovery' }),
    }))

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Continue to set a new password' })
    expect(button.getAttribute('type')).toBe('submit')
    const form = container.querySelector('form')!
    expect(button.closest('form')).toBe(form)
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/auth/reset-confirm/verify')
    expect(form.querySelector<HTMLInputElement>('input[name="token_hash"]')?.value).toBe(tokenHash)
    expect(form.querySelector<HTMLInputElement>('input[name="token_hash"]')?.type).toBe('hidden')
    expect(form.querySelector<HTMLInputElement>('input[name="type"]')?.value).toBe('recovery')
    expect(form.querySelector<HTMLInputElement>('input[name="type"]')?.type).toBe('hidden')
    expect(metadata.referrer).toBe('no-referrer')
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(api.createClient).not.toHaveBeenCalled()
    expect(api.verifyOtp).not.toHaveBeenCalled()
  })

  it('disables the button and prevents repeat submissions', async () => {
    const { container } = render(await ResetConfirmPage({
      searchParams: Promise.resolve({ token_hash: tokenHash, type: 'recovery' }),
    }))
    const form = container.querySelector('form')!
    expect(fireEvent.submit(form)).toBe(true)
    expect((screen.getByRole('button', { name: 'Continuing...' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fireEvent.submit(form)).toBe(false)
  })

  it.each([
    {},
    { type: 'recovery' },
    { token_hash: '', type: 'recovery' },
    { token_hash: tokenHash },
    { token_hash: tokenHash, type: 'signup' },
    { token_hash: [tokenHash, 'another-token'], type: 'recovery' },
    { token_hash: tokenHash, type: ['recovery', 'signup'] },
  ])('renders the invalid link state for %j', async (params) => {
    const { container } = render(await ResetConfirmPage({ searchParams: Promise.resolve(params) }))
    expect(screen.getByRole('heading', { name: 'Invalid reset link' })).toBeTruthy()
    expect(screen.getByText('This reset link is invalid. Please request a new one.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request a new reset link' }).getAttribute('href')).toBe('/forgot-password')
    expect(container.querySelector('form')).toBeNull()
    expect(api.createClient).not.toHaveBeenCalled()
    expect(api.verifyOtp).not.toHaveBeenCalled()
  })
})

describe('POST reset verification', () => {
  it.each<Record<string, string>>([
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { origin: 'https://attacker.example' },
    { origin: `${origin}:444` },
    { origin: 'null' },
    { origin: 'malformed' },
    { 'sec-fetch-site': 'same-origin', origin: 'https://attacker.example' },
  ])('rejects unsafe submission headers %j before creating a client', async headers => {
    const response = await submit({ token_hash: tokenHash, type: 'recovery' }, headers)
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/forgot-password')
    expect(location.searchParams.get('error')).toBe('Invalid reset link. Please request a new one.')
    expect(api.createClient).not.toHaveBeenCalled()
  })

  it.each<Record<string, string>>([
    { 'sec-fetch-site': 'same-origin', origin },
    { 'sec-fetch-site': 'none' },
    { origin },
  ])('allows safe submission headers %j', async headers => {
    const response = await submit({ token_hash: tokenHash, type: 'recovery' }, headers)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${origin}/reset-password`)
    expect(api.verifyOtp).toHaveBeenCalledOnce()
    expect(api.getUser).not.toHaveBeenCalled()
  })

  it.each([
    { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token_hash: tokenHash, type: 'recovery' }) },
    {},
  ])('rejects a non-form body without throwing: %j', async init => {
    const response = await verifyRoute.POST(new NextRequest(`${origin}/auth/reset-confirm/verify`, {
      method: 'POST', ...init,
    }))
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/forgot-password')
    expect(location.searchParams.get('error')).toBe('Invalid reset link. Please request a new one.')
    expect(api.createClient).not.toHaveBeenCalled()
  })

  it('continues to reset-password when verification fails but a session user exists', async () => {
    api.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid', status: 403 } })
    api.getUser.mockResolvedValue({ data: { user: { id: 'existing-user' } }, error: null })
    const response = await submit({ token_hash: tokenHash, type: 'recovery' })
    expect(api.getUser).toHaveBeenCalledOnce()
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${origin}/reset-password`)
  })

  it('only exports a POST handler', () => {
    expect(Object.keys(verifyRoute)).toEqual(['POST'])
  })

  it('redeems the token once and redirects with 303 to reset-password', async () => {
    const response = await submit({ token_hash: tokenHash, type: 'recovery' })
    expect(api.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: tokenHash, type: 'recovery' })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${origin}/reset-password`)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(tokenHash)
  })

  it('redirects with 303 and the expired link message when verification fails', async () => {
    api.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid', status: 403 } })
    const response = await submit({ token_hash: tokenHash, type: 'recovery' })
    const location = new URL(response.headers.get('location')!)
    expect(response.status).toBe(303)
    expect(location.pathname).toBe('/forgot-password')
    expect(location.searchParams.get('error')).toBe('This reset link is invalid or has expired. Please request a new one.')
    expect(api.getUser).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledWith('[reset-confirm] Token verification failed', {
      message: 'Token has expired or is invalid', status: 403,
    })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(tokenHash)
  })

  it.each<Record<string, string>>([
    { type: 'recovery' },
    { token_hash: '', type: 'recovery' },
    { token_hash: tokenHash },
    { token_hash: tokenHash, type: 'signup' },
  ])('rejects invalid form fields %j without verifying', async (params) => {
    const response = await submit(params)
    const location = new URL(response.headers.get('location')!)
    expect(response.status).toBe(303)
    expect(location.pathname).toBe('/forgot-password')
    expect(location.searchParams.get('error')).toBe('Invalid reset link. Please request a new one.')
    expect(api.createClient).not.toHaveBeenCalled()
    expect(api.verifyOtp).not.toHaveBeenCalled()
  })
})
