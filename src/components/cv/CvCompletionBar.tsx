"use client";

interface Props {
  percentage: number;
  missing: string[];
}

export default function CvCompletionBar({ percentage, missing }: Props) {
  if (percentage >= 100) return null;

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text">Resume Completion</span>
        <span className="text-sm font-bold text-primary">{percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-bg-alt overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missing.map((item) => (
            <span
              key={item}
              className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/40 px-2 py-0.5 rounded-full"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
