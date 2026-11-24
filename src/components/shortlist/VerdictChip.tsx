import { AlertTriangle, Check, Minus, X } from 'lucide-react';
import type { FitVerdictKind } from '@/lib/shortlist/ranking';

const STYLES: Record<Exclude<FitVerdictKind, 'unavailable'> | 'none', { label: string; className: string; Icon: typeof Check }> = {
  good_fit: { label: 'Good fit', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Check },
  not_enough_information: {
    label: 'Not enough information',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: AlertTriangle,
  },
  not_a_fit: { label: 'Not a fit', className: 'bg-red-50 text-red-700 border-red-200', Icon: X },
  none: { label: 'Not screened', className: 'bg-bg-alt text-text-light border-border', Icon: Minus },
};

export default function VerdictChip({ verdict, className = '' }: { verdict: FitVerdictKind | null | undefined; className?: string }) {
  const style = verdict && verdict !== 'unavailable' ? STYLES[verdict] : STYLES.none;
  const { Icon } = style;
  return (
    <span
      data-verdict={verdict ?? 'none'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${style.className} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {style.label}
    </span>
  );
}
