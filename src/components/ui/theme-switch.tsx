"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ThemeSwitch = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLButtonElement>) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className={cn("h-8 w-14", className)} />;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        isDark
          ? "bg-[#1e293b] border border-[#334155]"
          : "bg-[#e2e8f0] border border-[#cbd5e1]",
        className
      )}
      {...props}
    >
      {/* Sliding thumb */}
      <span
        className={cn(
          "pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-all duration-300 ease-in-out",
          isDark
            ? "translate-x-7 bg-[#1e293b] ring-1 ring-[#475569]"
            : "translate-x-1 bg-white ring-1 ring-black/5"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-blue-300" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-500" />
        )}
      </span>

      {/* Background icons (subtle, behind the thumb) */}
      <span className="pointer-events-none absolute left-[7px] flex items-center justify-center">
        <Sun
          className={cn(
            "h-3 w-3 transition-opacity duration-300",
            isDark ? "opacity-30 text-slate-500" : "opacity-0"
          )}
        />
      </span>
      <span className="pointer-events-none absolute right-[7px] flex items-center justify-center">
        <Moon
          className={cn(
            "h-3 w-3 transition-opacity duration-300",
            isDark ? "opacity-0" : "opacity-30 text-slate-400"
          )}
        />
      </span>
    </button>
  );
};

export default ThemeSwitch;
