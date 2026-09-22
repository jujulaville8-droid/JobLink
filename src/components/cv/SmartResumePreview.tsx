"use client";
import { useState } from "react";

export default function SmartResumePreview({ preview, purchased, awaitingPayment, createdAt, onSaved }: {
  preview: Record<string, unknown>; purchased: boolean; awaitingPayment: boolean; createdAt: string; onSaved: () => Promise<void>;
}) {
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const questions = Array.isArray(preview.questions) ? preview.questions as string[] : [];
  async function save() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/ai/resume", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "unlock", confirmed: reviewed, previewCreatedAt: createdAt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save. Please retry.");
      await onSaved();
      window.history.replaceState({}, "", "/profile/cv");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-border bg-white p-5 text-left space-y-4">
    <h2 className="font-display text-xl">Review your resume draft</h2>
    <p className="text-sm text-text-light">Check every claim before saving. Missing details have been left blank. Saving replaces your summary, experience, education, skills, languages, projects and volunteer work.</p>
    {Object.entries(preview).filter(([key]) => key !== "questions").map(([section, value]) => (
      <div key={section}><h3 className="font-semibold capitalize">{section}</h3>
        {typeof value === "string" ? <p className="text-sm whitespace-pre-wrap">{value}</p> : Array.isArray(value) && value.map((item, i) => (
          <p key={i} className="text-sm whitespace-pre-wrap border-b border-border py-2">{typeof item === "string" ? item : Object.entries(item).filter(([, v]) => v !== null && v !== "").map(([k, v]) => k.replaceAll("_", " ") + ": " + String(v)).join("\n")}</p>
        ))}
      </div>
    ))}
    {questions.length > 0 && <div><h3 className="font-semibold">Details to add in the editor</h3><ul className="list-disc pl-5 text-sm">{questions.map(q => <li key={q}>{q}</li>)}</ul></div>}
    {awaitingPayment ? <p role="status">Payment confirmation is pending. Please wait or refresh shortly; your draft is saved.</p> : purchased ? <>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the draft for accuracy and confirm replacing these sections of my existing resume.</label>
      <button className="btn-primary disabled:opacity-50" onClick={save} disabled={!reviewed || busy || !createdAt}>{busy ? "Saving…" : "Save reviewed draft"}</button>
    </> : <button className="btn-primary" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const res = await fetch("/api/stripe/smart-resume-checkout", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || "Checkout unavailable");
        window.location.href = data.url;
      } catch (err) { setError(err instanceof Error ? err.message : "Checkout unavailable"); setBusy(false); }
    }}>Unlock saving — EC$10</button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
