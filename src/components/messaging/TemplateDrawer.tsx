"use client";

import { useEffect, useState } from "react";
import type { MessageTemplate } from "@/lib/types";

interface TemplateDrawerProps {
  onSelect: (body: string) => void;
  onClose: () => void;
}

export default function TemplateDrawer({ onSelect, onClose }: TemplateDrawerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/messages/templates");
        if (res.ok) {
          setTemplates(await res.json());
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  return (
    <div className="absolute bottom-full left-0 right-0 bg-white border-t border-border shadow-lg rounded-t-xl max-h-64 overflow-y-auto z-10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-white">
        <h4 className="text-sm font-semibold text-text">Quick replies</h4>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-1/3 skeleton rounded mb-1" />
              <div className="h-3 w-2/3 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-text-muted">No templates available.</p>
        </div>
      ) : (
        <div className="p-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.body)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-bg-alt transition-colors group"
            >
              <p className="text-sm font-medium text-text group-hover:text-primary transition-colors">
                {t.label}
              </p>
              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{t.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
