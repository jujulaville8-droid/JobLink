'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDownToLine, Undo2, Redo2, Check, FileText, UserRound, BriefcaseBusiness, GraduationCap, Sparkles, Plus, Trash2, Eye, PencilLine, LoaderCircle, ChevronRight } from 'lucide-react';
import { profileFields, resumeSectionDefinitions, type EditorSection } from '@/lib/resume-sections';
import { useResumeEditor } from './useResumeEditor';
import ResumePreview from './ResumePreview';
import styles from './studio.module.css';

export default function ResumeStudio() {
  const editor = useResumeEditor();
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [contactOpen, setContactOpen] = useState(false);
  const [extras, setExtras] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const exportLock = useRef(false);
  const pdfDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pdfUrl) pdfDialog.current?.showModal(); return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }; }, [pdfUrl]);
  const { cv, preview, selection, form } = editor;
  const definition = resumeSectionDefinitions.find(s => s.key === selection.section);
  const fields = selection.section === 'profile' ? profileFields : definition!.fields;

  async function exportPdf(previewOnly = false) {
    if (!cv || editor.dirty || editor.busy || exportLock.current) return;
    exportLock.current = true; setExporting(true); setExportError('');
    try {
      const [{ pdf }, { createResumeDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/lib/resume-pdf')]);
      const blob = await pdf(createResumeDocument(cv)).toBlob();
      const url = URL.createObjectURL(blob);
      if (previewOnly) setPdfUrl(url);
      else {
        const link = document.createElement('a'); link.href = url;
        link.download = `${[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join('-').replace(/[^\p{L}\p{N}-]/gu, '') || 'My'}-Resume.pdf`;
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch { setExportError('Your PDF could not be created. Please try again. Your saved resume is safe.'); }
    finally { exportLock.current = false; setExporting(false); }
  }
  function navigate(section: EditorSection) { setContactOpen(false); editor.select(section); setMobileView('edit'); }
  const iconFor = (key: string) => key === 'experiences' ? BriefcaseBusiness : key === 'education' ? GraduationCap : key === 'skills' ? Sparkles : FileText;

  if (editor.loading) return <div className={styles.loading} role="status"><LoaderCircle className={styles.spinner} /><h1>Opening your workspace</h1><p>Getting your resume ready to edit.</p></div>;
  if (!cv || !preview) return <div className={styles.loading}><FileText /><h1>Your resume workspace</h1><p role="alert">{editor.error}</p><button className={styles.primary} onClick={() => void editor.load()}>Try again</button><a href="/profile">Back to profile</a></div>;

  const records = selection.section === 'profile' ? [] : preview[selection.section];
  const hasEditor = selection.section === 'profile' || !!selection.id;
  const wordCount = String(form.summary ?? form.description ?? '').trim().split(/\s+/).filter(Boolean).length;
  return <div className={styles.studio}>
    <header className={styles.toolbar}>
      <a href="/dashboard" className={styles.brand}>JobLinks<span>Resume Builder</span></a>
      <div className={styles.documentName}><FileText size={17} /><span>{cv.profile.job_title || 'My resume'}</span></div>
      <div className={styles.toolbarActions}>
        <span role="status" className={styles.saveStatus}>{editor.busy ? <LoaderCircle size={15} className={styles.spinner} /> : editor.dirty ? <span className={styles.unsavedDot} /> : <Check size={15} />}{editor.busy ? 'Saving…' : editor.dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className={styles.historyButtons}>
          <button aria-label="Undo edit" title="Undo unsaved edit" disabled={!editor.canUndo || editor.busy} onClick={editor.undo}><Undo2 size={18} /></button>
          <button aria-label="Redo edit" title="Redo unsaved edit" disabled={!editor.canRedo || editor.busy} onClick={editor.redo}><Redo2 size={18} /></button>
        </div>
        <button className={styles.primary} disabled={editor.dirty || editor.busy || exporting} onClick={() => void exportPdf()} title={editor.dirty ? 'Save your changes before exporting' : 'Download your resume'}>{exporting ? <LoaderCircle size={17} className={styles.spinner} /> : <ArrowDownToLine size={17} />}<span>{exporting ? 'Preparing…' : 'Export PDF'}</span></button>
      </div>
    </header>
    <div className={styles.subbar}>
      <a href="/dashboard"><ArrowLeft size={15} />Back to dashboard</a>
      <span className={styles.workspaceLabel}>Your resume, thoughtfully put together.</span>
      <div className={styles.mobileSwitch} aria-label="Workspace view">
        <button aria-pressed={mobileView === 'edit'} onClick={() => setMobileView('edit')}><PencilLine size={15} />Edit</button>
        <button aria-pressed={mobileView === 'preview'} onClick={() => setMobileView('preview')}><Eye size={15} />Preview</button>
      </div>
    </div>
    {(editor.error || exportError) && <div className={styles.error} role="alert">{editor.error || exportError}</div>}
    {editor.draftNotice && editor.dirty && <p className={styles.draftNotice}>{editor.draftNotice}</p>}
    <div className={styles.workspace} data-view={mobileView}>
      <nav className={styles.sections} aria-label="Resume sections">
        <p className={styles.navLabel}>Your resume</p>
        <button className={styles.sectionButton} aria-current={contactOpen ? 'step' : undefined} onClick={() => { setContactOpen(true); setMobileView('edit'); }}><UserRound size={19} /><span>Personal details</span>{cv.contact.first_name && <Check size={14} />}</button>
        <button className={styles.sectionButton} aria-current={!contactOpen && selection.section === 'profile' ? 'step' : undefined} onClick={() => navigate('profile')}><FileText size={19} /><span>Summary</span>{cv.profile.summary && <Check size={14} />}</button>
        {resumeSectionDefinitions.filter((s, i) => i < 3 || extras || preview[s.key].length > 0).map(s => {
          const Icon = iconFor(s.key);
          return <button key={s.key} className={styles.sectionButton} aria-current={!contactOpen && selection.section === s.key ? 'step' : undefined} onClick={() => navigate(s.key)}><Icon size={19} /><span>{s.title}</span>{preview[s.key].length > 0 && <span className={styles.sectionCount}>{preview[s.key].length}</span>}</button>;
        })}
        <button className={styles.addSection} aria-expanded={extras} onClick={() => setExtras(!extras)}><Plus size={19} />{extras ? 'Fewer sections' : 'Add a section'}</button>
        <div className={styles.navNote}><span className={styles.noteIcon}><FileText size={20} /></span><p>A resume that feels like you.</p><span>Keep it relevant. Keep it honest. Make every word count.</span></div>
      </nav>

      <section className={styles.editor} aria-label="Resume editor">
        {contactOpen ? <>
          <h1>Personal details</h1><p className={styles.intro}>These details come from your JobLinks profile, so you only need to keep them up to date in one place.</p>
          <dl className={styles.contactList}>{[['Name', [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ')], ['Email', cv.contact.email], ['Phone', cv.contact.phone], ['Location', cv.contact.location]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not added yet'}</dd></div>)}</dl>
          <a className={styles.secondary} href="/profile">Edit personal details<ChevronRight size={16} /></a>
        </> : <>
          <div className={styles.editorHeading}><span className={styles.editorEyebrow}>Make your next move</span><h1>{selection.section === 'profile' ? 'Your professional story' : definition!.title}</h1><p className={styles.intro}>{selection.section === 'profile' ? 'Introduce yourself with a clear title and a short, confident summary.' : definition!.hint}</p></div>
          {selection.section !== 'profile' && <div className={styles.recordTabs} aria-label={`${definition!.title} entries`}>
            {records.map((record, index) => <button key={record.id} disabled={editor.busy} aria-pressed={selection.id === record.id} onClick={() => editor.select(selection.section, record.id)}>{String(('job_title' in record && record.job_title) || ('name' in record && record.name) || ('title' in record && record.title) || ('institution' in record && record.institution) || ('organization' in record && record.organization) || `New ${definition!.singular}`)}<span>{String(index + 1).padStart(2, '0')}</span></button>)}
            <button className={styles.addRecord} disabled={editor.busy} onClick={() => editor.add(definition!.key)}><Plus size={15} />Add {definition!.singular}</button>
          </div>}
          {hasEditor ? <form onSubmit={event => { event.preventDefault(); void editor.save(); }}>
            <fieldset className={styles.fields} disabled={editor.busy}>
              {fields.map(field => <label key={field.key} className={field.type === 'checkbox' ? styles.checkbox : field.type === 'month' ? styles.dateField : styles.field}>
                {field.type === 'checkbox' ? <><input type="checkbox" checked={form[field.key] === true} onChange={event => editor.change({ ...form, [field.key]: event.target.checked })} /><span>{field.label}</span></> : <>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  {field.type === 'textarea' ? <textarea value={String(form[field.key] ?? '')} rows={selection.section === 'profile' ? 7 : 6} maxLength={10000} placeholder={selection.section === 'profile' ? 'What do you do well, and what will you bring to your next role?' : 'Describe what you did and the difference it made. Put each achievement on a new line.'} onChange={event => editor.change({ ...form, [field.key]: event.target.value })} /> : <input type={field.type ?? 'text'} required={field.required} disabled={field.key === 'end_date' && form.is_current === true} maxLength={500} value={String(form[field.key] ?? '')} onChange={event => editor.change({ ...form, [field.key]: event.target.value })} />}
                </>}
              </label>)}
            </fieldset>
            {fields.some(f => f.type === 'textarea') && <p className={styles.wordCount}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</p>}
            <div className={styles.writingTip}><Sparkles size={19} /><div><strong>{selection.section === 'profile' ? 'Be specific. Be yourself.' : 'Show your impact'}</strong><p>{selection.section === 'profile' ? 'Mention your strengths, relevant experience, and the kind of work you want. Two or three sentences is a good starting point.' : selection.section === 'references' ? 'Ask permission before sharing someone’s details.' : 'Use a clear action and a real example. Add an outcome where you can, without inventing numbers or achievements.'}</p></div></div>
            <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={!editor.currentDirty || editor.busy}>{editor.busy ? <LoaderCircle size={16} className={styles.spinner} /> : <Check size={16} />}Save changes</button>{selection.section !== 'profile' && <button type="button" className={styles.delete} disabled={editor.busy} onClick={() => void editor.remove()}><Trash2 size={16} />Remove entry</button>}</div>
            <p className={styles.saveHint}>Save each entry when you’re ready. Your preview updates as you type.</p>
          </form> : <div className={styles.emptyEditor}><FileText size={32} /><h2>Add your first {definition!.singular}</h2><p>You don’t need to fill every section. Include what supports your next role.</p><button className={styles.primary} onClick={() => editor.add(definition!.key)}><Plus size={16} />Add {definition!.singular}</button></div>}
        </>}
      </section>

      <section className={styles.preview} role="region" aria-label="Live resume preview">
        <div className={styles.previewToolbar}><span><Eye size={16} />Live preview</span><button disabled={editor.dirty || editor.busy || exporting} onClick={() => void exportPdf(true)}><FileText size={15} />View PDF</button></div>
        <div className={styles.paperStage}><ResumePreview cv={preview} active={contactOpen ? 'contact' : selection.section} /></div>
        <p className={styles.previewNote}>{editor.dirty ? 'Save your changes to view or download the PDF.' : 'Content preview · View PDF to check exact page breaks.'}</p>
      </section>
    </div>
    <dialog ref={pdfDialog} className={styles.pdfDialog} onClose={() => setPdfUrl('')}>
      <div className={styles.pdfDialogHeader}><strong>Your resume PDF</strong><button onClick={() => pdfDialog.current?.close()}>Close preview</button></div>
      {pdfUrl && <><iframe title="Resume PDF preview" src={pdfUrl} /><p>If your browser cannot display the PDF, <a href={pdfUrl} download="Resume.pdf">download it here</a>.</p></>}
    </dialog>
  </div>;
}
