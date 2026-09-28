import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TestimonialForm from '../src/components/TestimonialForm'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('leaves reuse permission unchecked and permits private feedback', async () => {
  const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
  vi.stubGlobal('fetch', send)
  render(<TestimonialForm id="example" initialFeedback="" initialRating={0} initialConsent={false} />)
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We found a cook through JobLinks.' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save feedback' }).closest('form')!)
  await waitFor(() => expect(send).toHaveBeenCalled())
  expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ feedback: 'We found a cook through JobLinks.', rating: 4, consent: false })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('feedback is saved'))
})

it('sends withdrawal and keeps feedback available when saving fails', async () => {
  const send = vi.fn().mockRejectedValue(new Error('Offline'))
  vi.stubGlobal('fetch', send)
  render(<TestimonialForm id="example" initialFeedback="Hiring went smoothly." initialRating={5} initialConsent={true} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.submit(screen.getByRole('button', { name: 'Save feedback' }).closest('form')!)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Unable to save'))
  expect(JSON.parse(send.mock.calls[0][1].body).consent).toBe(false)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Hiring went smoothly.')
})
