import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SupportButton from '../src/components/SupportButton'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function openAndFill() {
  fireEvent.click(screen.getByRole('button', { name: 'Support' }))
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex Example' } })
  fireEvent.change(screen.getByLabelText('Reply email'), { target: { value: 'alex@example.test' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'I need help signing in to my account.' } })
  fireEvent.click(screen.getByRole('checkbox'))
}
function submit() { fireEvent.submit(screen.getByRole('button', { name: 'Send message' }).closest('form')!) }

it('opens only on request and explains that support replies by email', () => {
  render(<SupportButton />)
  expect(screen.queryByRole('dialog')).toBeNull()
  const bubble = screen.getByRole('button', { name: 'Support' })
  expect(bubble.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(bubble)
  expect(screen.getByRole('dialog', { name: 'JobLinks support' }).textContent).toMatch(/reply.*email/i)
})

it('loops Tab and Shift+Tab within the support controls', () => {
  render(<SupportButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Support' }))
  const first = screen.getByRole('button', { name: 'Close support' })
  const last = screen.getByRole('button', { name: 'Send message' })
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' })
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(last)
})

it('keeps Safari keyboard navigation on the consent and action controls', () => {
  render(<SupportButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Support' }))
  const message = screen.getByLabelText('Message')
  const consent = screen.getByRole('checkbox')
  const privacy = screen.getByRole('link', { name: /Privacy policy/ })
  const send = screen.getByRole('button', { name: 'Send message' })
  message.focus()
  expect(fireEvent.keyDown(message, { key: 'Tab' })).toBe(false)
  expect(document.activeElement).toBe(consent)
  fireEvent.keyDown(consent, { key: 'Tab' })
  expect(document.activeElement).toBe(privacy)
  fireEvent.keyDown(privacy, { key: 'Tab' })
  expect(document.activeElement).toBe(send)
  fireEvent.keyDown(send, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(privacy)
})

it('keeps the draft and retry identity through failure and closing/reopening', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async (_url, init) => Response.json({ success: true, reference: JSON.parse(init.body).id }))
  vi.stubGlobal('fetch', send)
  render(<SupportButton />)
  openAndFill(); submit()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/couldn.t confirm/i))
  fireEvent.click(screen.getByRole('button', { name: 'Close support' }))
  fireEvent.click(screen.getByRole('button', { name: 'Support' }))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('I need help signing in to my account.')
  submit()
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/accepted/i))
  expect(send.mock.calls[0][1].body).toBe(send.mock.calls[1][1].body)
  expect(screen.getByRole('status').textContent).toMatch(/does not confirm inbox delivery/i)
})
it('prevents simultaneous submissions and requires consent', async () => {
  let resolve!: (value: Response) => void
  const send = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  vi.stubGlobal('fetch', send)
  render(<SupportButton />); openAndFill()
  fireEvent.click(screen.getByRole('checkbox')); submit()
  expect(send).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox')); submit()
  fireEvent.submit(screen.getByRole('button', { name: /Sending/ }).closest('form')!)
  expect(send).toHaveBeenCalledOnce()
  expect((screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement).disabled).toBe(true)
  resolve(Response.json({ success: true, reference: JSON.parse(send.mock.calls[0][1].body).id }))
  await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
})
it.each([
  () => Response.json({ error: 'Please try again later.' }, { status: 429 }),
  () => Response.json({ success: false }),
  () => new Response('<html>error</html>', { status: 503 }),
])('keeps the form for rejected or malformed receipts', async response => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
  render(<SupportButton />); openAndFill(); submit()
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Alex Example')
  expect(screen.queryByRole('status')).toBeNull()
})
