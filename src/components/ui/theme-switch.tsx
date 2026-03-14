"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ThemeSwitch = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLButtonElement>) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [visualDark, setVisualDark] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync visual state when theme changes externally
  useEffect(() => {
    setVisualDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  const handleToggle = useCallback(() => {
    // Flip the visual state immediately (triggers the slide animation)
    const nextDark = !visualDark;
    setVisualDark(nextDark);

    // Delay the actual theme change so the thumb finishes sliding first
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setTheme(nextDark ? "dark" : "light");
    }, 250);
  }, [visualDark, setTheme]);

  // Cleanup timer
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!mounted) return <div className={cn("h-8 w-14", className)} />;

  return (
    <button
      onClick={handleToggle}
      aria-label={visualDark ? "Switch to light mode" : "Switch to dark mode"}
      role="switch"
      aria-checked={visualDark}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        "border-border bg-bg-alt",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-[--color-surface] shadow-md ring-1 ring-black/5 dark:ring-white/10"
        style={{
          transform: `translateX(${visualDark ? 24 : 4}px)`,
          transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <Sun
          className="h-3.5 w-3.5 text-amber-500 absolute"
          style={{
            opacity: visualDark ? 0 : 1,
            transform: visualDark ? "rotate(-90deg) scale(0)" : "rotate(0deg) scale(1)",
            transition: "opacity 350ms ease, transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
        <Moon
          className="h-3.5 w-3.5 text-blue-300 absolute"
          style={{
            opacity: visualDark ? 1 : 0,
            transform: visualDark ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(0)",
            transition: "opacity 350ms ease, transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </span>
    </button>
  );
};

export default ThemeSwitch;
