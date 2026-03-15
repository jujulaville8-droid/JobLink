"use client";

export default function DeleteListingButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={async () => {
        if (!confirm("Permanently delete this listing and all its applications? This cannot be undone.")) {
          return;
        }
        await action();
      }}
    >
      <button
        type="submit"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-red-600 transition-all duration-200 hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-md hover:shadow-red-600/20 hover:-translate-y-0.5 active:translate-y-0"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        Delete
      </button>
    </form>
  );
}
