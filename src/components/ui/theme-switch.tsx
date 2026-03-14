"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ThemeSwitch = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [checked, setChecked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => setChecked(resolvedTheme === "dark"), [resolvedTheme]);

  const handleCheckedChange = useCallback(
    (isChecked: boolean) => {
      setChecked(isChecked);
      setTheme(isChecked ? "dark" : "light");
    },
    [setTheme],
  );

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        "h-9 w-20",
        className
      )}
      {...props}
    >
      <Switch
        checked={checked}
        onCheckedChange={handleCheckedChange}
        className={cn(
          "peer absolute inset-0 h-full w-full rounded-full bg-input/50 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "[&>span]:h-7 [&>span]:w-7 [&>span]:rounded-full [&>span]:bg-background [&>span]:shadow [&>span]:z-10",
          "data-[state=unchecked]:[&>span]:translate-x-1",
          "data-[state=checked]:[&>span]:translate-x-[44px]"
        )}
      />

      <span
        className={cn(
          "pointer-events-none absolute left-2 inset-y-0 z-0",
          "flex items-center justify-center"
        )}
      >
        <SunIcon
          size={16}
          className={cn(
            "transition-all duration-200 ease-out",
            checked ? "text-muted-foreground/70" : "text-foreground scale-110"
          )}
        />
      </span>

      <span
        className={cn(
          "pointer-events-none absolute right-2 inset-y-0 z-0",
          "flex items-center justify-center"
        )}
      >
        <MoonIcon
          size={16}
          className={cn(
            "transition-all duration-200 ease-out",
            checked ? "text-foreground scale-110" : "text-muted-foreground/70"
          )}
        />
      </span>
    </div>
  );
};

export default ThemeSwitch;
