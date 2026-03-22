"use client";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function getYears(): string[] {
  const current = new Date().getFullYear();
  const years: string[] = [];
  for (let y = current; y >= current - 50; y--) {
    years.push(String(y));
  }
  return years;
}

interface Props {
  value: string; // "YYYY-MM" or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export default function MonthYearPicker({ value, onChange, disabled, required }: Props) {
  const [year, month] = value ? value.split("-") : ["", ""];
  const years = getYears();

  function handleChange(part: "month" | "year", val: string) {
    const newMonth = part === "month" ? val : month;
    const newYear = part === "year" ? val : year;

    if (newMonth && newYear) {
      onChange(`${newYear}-${newMonth}`);
    } else if (!newMonth && !newYear) {
      onChange("");
    } else {
      // Keep partial state so user can pick one at a time
      onChange(newYear && newMonth ? `${newYear}-${newMonth}` : newYear ? `${newYear}-01` : `${new Date().getFullYear()}-${newMonth}`);
    }
  }

  const selectClass = `rounded-lg border border-border px-2.5 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;

  return (
    <div className="flex gap-2">
      <select
        value={month}
        onChange={(e) => handleChange("month", e.target.value)}
        disabled={disabled}
        required={required}
        className={`${selectClass} flex-1`}
      >
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => handleChange("year", e.target.value)}
        disabled={disabled}
        required={required}
        className={`${selectClass} w-24`}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
