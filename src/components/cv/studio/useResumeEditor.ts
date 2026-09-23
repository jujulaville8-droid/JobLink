'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CvFull } from '@/lib/types';
import { profileFields, resumeSectionDefinitions, validateResumeEntry, type EditorSection, type EntryDraft, type RecordSection } from '@/lib/resume-sections';

export type Selection = { section: EditorSection; id: string };
type Drafts = Record<string, { selection: Selection; entry: EntryDraft }>;
type History = { past: Drafts[]; present: Drafts; future: Drafts[] };
const emptyHistory = (): History => ({ past: [], present: {}, future: [] });
const keyOf = (selection: Selection) => `${selection.section}:${selection.id}`;
const storageKey = (cv: CvFull) => `joblinks:resume-draft:${cv.profile.user_id}`;

function recoverDrafts(cv: CvFull): Drafts {
  try {
    const text = sessionStorage.getItem(storageKey(cv));
    if (!text || text.length > 1000000) return {};
    const saved = JSON.parse(text);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const drafts: Drafts = {};
    for (const value of Object.values(saved).slice(0, 100)) {
      const candidate = value as { selection?: Selection; entry?: EntryDraft } | null;
      const selection = candidate?.selection;
      if (!selection || typeof selection.id !== 'string' || !candidate?.entry) continue;
      const fields = selection.section === 'profile' ? profileFields : resumeSectionDefinitions.find(s => s.key === selection.section)?.fields;
      if (!fields) continue;
      const entry = savedForm(cv, selection);
      for (const field of fields) {
        const content = candidate.entry[field.key];
        if (typeof content === 'string' && content.length <= 10000 || typeof content === 'boolean') entry[field.key] = content;
      }
      drafts[keyOf(selection)] = { selection, entry };
    }
    return drafts;
  } catch { return {}; }
}

function savedForm(cv: CvFull, selection: Selection): EntryDraft {
  const row = selection.section === 'profile' ? cv.profile : cv[selection.section].find(r => r.id === selection.id);
  const fields = selection.section === 'profile' ? profileFields : resumeSectionDefinitions.find(s => s.key === selection.section)!.fields;
  const values = row as unknown as EntryDraft | undefined;
  return Object.fromEntries(fields.map(f => [f.key, f.type === 'checkbox' ? values?.[f.key] === true : f.type === 'month' ? String(values?.[f.key] ?? '').slice(0, 7) : values?.[f.key] ?? '']));
}

export function withDrafts(cv: CvFull, drafts: Drafts): CvFull {
  const result = { ...cv };
  for (const { selection, entry } of Object.values(drafts)) {
    if (selection.section === 'profile') result.profile = { ...result.profile, ...entry };
    else {
      const rows = result[selection.section];
      const existing = rows.find(r => r.id === selection.id);
      const replacement = { ...existing, ...entry, id: selection.id, cv_profile_id: cv.profile.id, sort_order: existing?.sort_order ?? rows.length };
      Object.assign(result, { [selection.section]: existing ? rows.map(r => r.id === selection.id ? replacement : r) : [...rows, replacement] });
    }
  }
  return result;
}

async function request(body: unknown, method = 'PUT') {
  const response = await fetch('/api/cv/studio', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Your changes could not be saved. Your draft is still here.');
  return result;
}

export function useResumeEditor() {
  const [cv, setCv] = useState<CvFull | null>(null);
  const [history, setHistory] = useState<History>(emptyHistory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const lock = useRef(false);
  const loadController = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<Selection>({ section: 'profile', id: 'profile' });

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    try {
      const response = await fetch('/api/cv/studio', { signal: controller.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your resume.');
      if (!result.profile || !result.contact || resumeSectionDefinitions.some(s => !Array.isArray(result[s.key]))) throw new Error('Could not load your complete resume. Please try again.');
      if (!controller.signal.aborted) {
        const drafts = recoverDrafts(result);
        setCv(result); setHistory({ past: [], present: drafts, future: [] });
        if (Object.keys(drafts).length) setDraftNotice('Restored your unsaved edits from this tab. Review and save them when you’re ready.');
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load your resume. Please try again.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  // Loading state is initialized above; these setters run only after external I/O.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);

  const dirty = Object.keys(history.present).length > 0;
  useEffect(() => {
    if (!cv) return;
    try {
      if (dirty) sessionStorage.setItem(storageKey(cv), JSON.stringify(history.present));
      else sessionStorage.removeItem(storageKey(cv));
    } catch {
      // Browser storage can be disabled or full. The unsaved-changes departure
      // prompt remains active; never claim that these drafts have been saved.
    }
  }, [cv, dirty, history.present]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigation = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (!link || link.getAttribute('href')?.startsWith('#') || link.getAttribute('target') === '_blank') return;
      if (!window.confirm('You have unsaved resume changes. Leave without saving?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigation, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigation, true); };
  }, [dirty, busy]);

  function change(entry: EntryDraft) {
    if (!cv || lock.current) return;
    const key = keyOf(selection);
    setHistory(h => {
      const next = { ...h.present, [key]: { selection, entry } };
      const exists = selection.section === 'profile' || cv[selection.section].some(r => r.id === selection.id);
      if (exists && JSON.stringify(entry) === JSON.stringify(savedForm(cv, selection))) delete next[key];
      return { past: [...h.past.slice(-49), h.present], present: next, future: [] };
    });
  }
  function add(section: RecordSection) {
    if (!cv || lock.current) return;
    const next = { section, id: crypto.randomUUID() };
    setSelection(next);
    setHistory(h => ({ past: [...h.past.slice(-49), h.present], present: { ...h.present, [keyOf(next)]: { selection: next, entry: savedForm(cv, next) } }, future: [] }));
    setError('');
  }
  function select(section: EditorSection, id?: string) {
    if (lock.current) return;
    const firstDraft = Object.values(history.present).find(d => d.selection.section === section)?.selection.id;
    setSelection({ section, id: id ?? (section === 'profile' ? 'profile' : cv?.[section][0]?.id ?? firstDraft ?? '') });
    setError('');
  }
  function forgetDraft(target: Selection) {
    setHistory(h => { const next = { ...h.present }; delete next[keyOf(target)]; return { past: [], present: next, future: [] }; });
  }
  async function save() {
    if (!cv || lock.current) return;
    const draft = history.present[keyOf(selection)];
    if (!draft) return;
    try {
      const values = validateResumeEntry(selection.section, draft.entry);
      lock.current = true; setBusy(true); setError('');
      const existing = selection.section === 'profile' ? null : cv[selection.section].find(r => r.id === selection.id);
      const sortOrder = existing?.sort_order ?? (selection.section === 'profile' ? 0 : Math.max(-1, ...cv[selection.section].map(r => r.sort_order)) + 1);
      const result = await request({ section: selection.section, id: selection.id, entry: values, sort_order: sortOrder });
      if (!result.entry?.id || (selection.section !== 'profile' && result.entry.id !== selection.id)) throw new Error('The server did not confirm this save. Your draft is still here.');
      setCv(current => {
        if (!current) return current;
        if (selection.section === 'profile') return { ...current, profile: result.entry };
        return { ...current, profile: { ...current.profile, id: result.entry.cv_profile_id }, [selection.section]: existing ? current[selection.section].map(r => r.id === selection.id ? result.entry : r) : [...current[selection.section], result.entry] };
      });
      forgetDraft(selection);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed. Your draft is still here. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove() {
    if (!cv || selection.section === 'profile' || lock.current) return;
    if (!window.confirm('Remove this entry from your resume? This cannot be undone after it is saved.')) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const section = selection.section;
      const existing = cv[section].some(r => r.id === selection.id);
      if (existing) await request({ section, id: selection.id }, 'DELETE');
      const remaining = cv[section].filter(r => r.id !== selection.id);
      setCv({ ...cv, [section]: remaining }); forgetDraft(selection);
      const nextDraft = Object.values(history.present).find(d => d.selection.section === section && d.selection.id !== selection.id);
      setSelection({ section, id: remaining[0]?.id ?? nextDraft?.selection.id ?? '' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not remove this entry. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return {
    cv, preview: cv ? withDrafts(cv, history.present) : null, loading, error, busy, dirty, selection, draftNotice,
    load: () => { setLoading(true); setError(''); void load(); }, change, add, select, save, remove,
    currentDirty: !!history.present[keyOf(selection)],
    form: cv ? history.present[keyOf(selection)]?.entry ?? savedForm(cv, selection) : {},
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    undo: () => { if (!lock.current) setHistory(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h); },
    redo: () => { if (!lock.current) setHistory(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h); },
  };
}
