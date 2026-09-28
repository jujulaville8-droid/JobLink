import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EmployerEnquiryForm from '../src/components/EmployerEnquiryForm'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function fill() {
  fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Test cafe' } })
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Test owner' } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'owner@example.test' } })
  fireEvent.change(screen.getByLabelText('Who are you hiring?'), { target: { value: 'Cook' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Paste your advert/ }), { target: { value: 'We need a part-time cook on Saturdays.' } })
  fireEvent.click(screen.getByRole('checkbox'))
}
it('keeps details and the same request ID when retrying a network failure', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
  vi.stubGlobal('fetch', send)
  render(<EmployerEnquiryForm />)
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  fill()
  fireEvent.submit(screen.getByRole('button', { name: 'Send us your vacancy' }).closest('form')!)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Connection problem'))
  expect((screen.getByLabelText('Business name') as HTMLInputElement).value).toBe('Test cafe')
  fireEvent.submit(screen.getByRole('button', { name: 'Send us your vacancy' }).closest('form')!)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Request received'))
  expect(JSON.parse(send.mock.calls[0][1].body).id).toBe(JSON.parse(send.mock.calls[1][1].body).id)
  expect(JSON.parse(send.mock.calls[1][1].body).contact_consent).toBe(true)
  expect(screen.getByRole('status').textContent).toContain('not published yet')
})
