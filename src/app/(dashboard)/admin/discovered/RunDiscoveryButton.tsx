"use client"

import { useState } from "react"

const COMMAND = "npm run discover"

export default function RunDiscoveryButton() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(COMMAND).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors shadow-sm"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Run Discovery
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="bg-white rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-border">
              <h3 className="font-display text-lg font-semibold text-text">
                Run the discovery bot
              </h3>
              <p className="text-xs text-text-muted mt-1">
                The bot runs on your Mac using your Claude Code Max subscription (zero API cost).
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-sm text-text-light mb-2">
                  Open a terminal in the JobLink project folder and run:
                </p>
                <div className="flex items-center gap-2 bg-bg-alt border border-border rounded-lg px-3 py-2.5">
                  <code className="flex-1 font-mono text-sm text-text truncate">
                    {COMMAND}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-white hover:bg-primary-light"
                    }`}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3">
                <p className="text-xs text-amber-900 font-semibold mb-1">
                  Why not run it with one click?
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  The bot uses your Claude Code Max subscription to avoid API charges. That only works when Claude Code is installed on the machine running the command — which is your Mac, not Vercel. After the command finishes (~5 min), refresh this page to see the new leads.
                </p>
              </div>

              <div className="bg-bg-alt rounded-lg px-4 py-3">
                <p className="text-xs text-text-muted leading-relaxed">
                  <span className="font-semibold text-text">What happens:</span> Claude Code searches job boards, careers pages, and Google for Antigua businesses currently hiring. Each result is saved to this queue with an evidence quote and confidence score for you to review.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-white border border-border text-text-light rounded-lg text-sm font-medium hover:border-primary/40 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
