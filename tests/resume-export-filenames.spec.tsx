import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resumeFixture } from './fixtures/resume';
const mocks = vi.hoisted(() => ({ editor: vi.fn(), blob: vi.fn() }));
vi.mock('@/components/cv/studio/useResumeEditor', () => ({ useResumeEditor: mocks.editor }));
vi.mock('@/components/cv/studio/ResumeWritingOffer', () => ({ default: () => null }));
vi.mock('@react-pdf/renderer', () => ({ pdf: () => ({ toBlob: mocks.blob }) }));
vi.mock('@/lib/resume-pdf', () => ({ createResumeDocument: () => null }));
import ResumeStudio from '@/components/cv/studio/ResumeStudio';
let downloads: string[];
beforeEach(() => {
  downloads = [];
  mocks.editor.mockReturnValue({ cv: resumeFixture, preview: resumeFixture, selection: { section: 'profile' }, form: {}, loading: false, dirty: false, busy: false });
  mocks.blob.mockResolvedValue(new Blob(['%PDF-test']));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('about:blank');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { downloads.push(this.download); });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('uses the same personal filename for direct export and preview download', async () => {
  render(<ResumeStudio />);
  fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
  await waitFor(() => expect(downloads).toEqual(['Simone Francis Resume.pdf']));
  await waitFor(() => expect(screen.getByRole('button', { name: 'View PDF' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'View PDF' }));
  expect((await screen.findByText('download it here')).getAttribute('download')).toBe('Simone Francis Resume.pdf');
});
it('keeps export disabled for unsaved edits', () => {
  mocks.editor.mockReturnValue({ ...mocks.editor(), dirty: true });
  render(<ResumeStudio />);
  expect(screen.getByRole('button', { name: 'Export PDF' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'View PDF' }).hasAttribute('disabled')).toBe(true);
});
