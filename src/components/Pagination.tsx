"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function buildHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Show at most 5 page numbers centered around current
  const pages: number[] = [];
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);
  if (end - start < 4) {
    if (start === 1) end = Math.min(totalPages, start + 4);
    else start = Math.max(1, end - 4);
  }
  for (let i = start; i <= end; i++) pages.push(i);

  const baseBtn =
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors h-9 min-w-[36px] px-3";

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-8" aria-label="Pagination">
      {/* Previous */}
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className={`${baseBtn} border border-border bg-white text-text-light hover:text-primary hover:border-primary/30`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
      ) : (
        <span className={`${baseBtn} border border-border bg-white text-text-muted/40 cursor-not-allowed`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </span>
      )}

      {/* First page + ellipsis */}
      {start > 1 && (
        <>
          <Link href={buildHref(1)} className={`${baseBtn} border border-border bg-white text-text-light hover:text-primary hover:border-primary/30`}>
            1
          </Link>
          {start > 2 && <span className="text-text-muted px-1">...</span>}
        </>
      )}

      {/* Page numbers */}
      {pages.map((p) => (
        <Link
          key={p}
          href={buildHref(p)}
          className={`${baseBtn} ${
            p === currentPage
              ? "bg-primary text-white border border-primary shadow-sm"
              : "border border-border bg-white text-text-light hover:text-primary hover:border-primary/30"
          }`}
        >
          {p}
        </Link>
      ))}

      {/* Last page + ellipsis */}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-text-muted px-1">...</span>}
          <Link href={buildHref(totalPages)} className={`${baseBtn} border border-border bg-white text-text-light hover:text-primary hover:border-primary/30`}>
            {totalPages}
          </Link>
        </>
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className={`${baseBtn} border border-border bg-white text-text-light hover:text-primary hover:border-primary/30`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      ) : (
        <span className={`${baseBtn} border border-border bg-white text-text-muted/40 cursor-not-allowed`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      )}
    </nav>
  );
}
