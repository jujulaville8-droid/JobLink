"use client";

import { useState } from 'react';
import { CV_ACCEPT, CV_FALLBACK, CV_NETWORK_ERROR, validateCvFile } from '@/lib/cv-upload';

class CvUploadError extends Error {}

async function fetchJsonWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { res, data };
  } finally {
    clearTimeout(timeout);
  }
}

/** Abortable direct transfer: no file bytes pass through a Next request. */
export function transferCv(url: string, file: File, contentType: string, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new CvUploadError(CV_NETWORK_ERROR));
    xhr.onabort = () => reject(new CvUploadError('Upload cancelled. Choose your resume again to retry.'));
    xhr.ontimeout = () => reject(new CvUploadError('Your resume upload timed out. Try again on a stronger connection, or email it to support@joblinkantigua.com.'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new CvUploadError(xhr.status === 413
        ? 'Your resume is too large. Choose a file of 10 MB or less, or email it to support@joblinkantigua.com.'
        : xhr.status === 401 || xhr.status === 403
          ? 'Upload authorization expired or was refused. Sign in again and retry, or contact support@joblinkantigua.com.'
          : CV_NETWORK_ERROR));
    };
    xhr.send(file);
  });
}

export default function CvUpload({ onUploaded, onBusy, hasCv = false }: {
  // Return true only once the profile is saved; false indicates a failed save.
  onUploaded: (path: string) => void | Promise<boolean>; onBusy: (busy: boolean) => void; hasCv?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [persisting, setPersisting] = useState(false);
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // Allow retrying the same file after any failure.
    if (!file || busy) return;
    setError(''); setSuccess('');
    const valid = validateCvFile(file);
    if (valid.error) { setError(valid.error); return; }
    setBusy(true); onBusy(true); setProgress(0);
    try {
      const { res, data } = await fetchJsonWithTimeout('/api/cv-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
      });
      if (!res.ok) throw new CvUploadError(data?.error
        ? `${data.error} Please retry, or email support@joblinkantigua.com.` : CV_NETWORK_ERROR);
      if (!data?.signedUrl || !data?.path) throw new CvUploadError(CV_NETWORK_ERROR);
      await transferCv(data.signedUrl, file, valid.contentType, setProgress);
      setPersisting(true);
      try {
        const saved = await onUploaded(data.path);
        if (saved === false) throw new Error('Profile save failed');
        setSuccess(saved === true ? 'Resume uploaded and saved.' : 'Resume uploaded. Save your profile to finish.');
      } catch {
        setError('Your resume uploaded, but saving your profile failed. Use the Save button below to retry.');
      } finally {
        setPersisting(false);
      }
    } catch (error) {
      setError(error instanceof CvUploadError
        ? error.message : CV_NETWORK_ERROR);
    } finally { setBusy(false); onBusy(false); }
  }
  return <div className="space-y-2">
    <label className="block rounded-lg border-2 border-dashed border-border p-6 text-center">
      <span className="block text-sm font-medium">{hasCv ? 'Upload a new CV' : 'Upload your CV'}</span>
      <span className="block text-xs text-text-muted">PDF, DOC, DOCX, JPG, PNG, HEIC or HEIF up to 10 MB</span>
      <input aria-label="Upload your CV" type="file" accept={CV_ACCEPT} disabled={busy} onChange={upload} className="mt-3 max-w-full text-sm" />
    </label>
    <p className="text-xs text-text-muted">{CV_FALLBACK}</p>
    {busy && <p role="status">{persisting ? 'Saving resume… please keep this page open.' : `Uploading resume… ${progress}% — please keep this page open.`}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {success && <p role="status" className="text-sm text-green-700">{success}</p>}
  </div>;
}
