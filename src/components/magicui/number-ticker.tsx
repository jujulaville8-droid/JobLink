import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  decimalPlaces?: number
}

function formatTickerValue(amount: number, decimalPlaces: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(amount)
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  decimalPlaces = 0,
  className,
  ...props
}: NumberTickerProps) {
  // Crawlers read this text node. The count-up used to render startValue (0)
  // in the server HTML and only write the real number after JavaScript.
  const settled = direction === "down" ? startValue : value

  return (
    <span
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className
      )}
      {...props}
    >
      {formatTickerValue(settled, decimalPlaces)}
    </span>
  )
}
