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
      role="switch"
      aria-checked={isDark}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        "border-border bg-bg-alt",
        className
      )}
      {...props}
    >
      {/* Sliding thumb — uses inline transform for buttery smooth animation */}
      <span
        className="pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-[--color-surface] shadow-md ring-1 ring-black/5 dark:ring-white/10"
        style={{
          transform: `translateX(${isDark ? 24 : 4}px)`,
          transition: "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Sun
          className="h-3.5 w-3.5 text-amber-500 absolute"
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? "rotate(-90deg) scale(0)" : "rotate(0deg) scale(1)",
            transition: "opacity 300ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        <Moon
          className="h-3.5 w-3.5 text-blue-300 absolute"
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(0)",
            transition: "opacity 300ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </span>
    </button>
  );
};

export default ThemeSwitch;
