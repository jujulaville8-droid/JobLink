"use client";
import React, { useState, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const FloatingNav = ({
  navItems,
  className,
  rightContent,
  onVisibilityChange,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
    active?: boolean;
  }[];
  className?: string;
  rightContent?: React.ReactNode;
  onVisibilityChange?: (visible: boolean) => void;
}) => {
  const { scrollYProgress } = useScroll();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current === "number") {
      const direction = current - scrollYProgress.getPrevious()!;

      if (scrollYProgress.get() < 0.05) {
        setVisible(false);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 0,
          y: -100,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          "fixed top-4 inset-x-0 mx-auto z-[5000]",
          "flex items-center justify-center gap-5",
          "w-auto max-w-fit px-6 py-2.5 rounded-full",
          "bg-[--color-surface]/80 backdrop-blur-xl border border-border/60",
          "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)]",
          className
        )}
      >
        {/* Nav links */}
        {navItems.map((navItem, idx: number) => (
          <Link
            key={`link-${idx}`}
            href={navItem.link}
            className={cn(
              "relative items-center flex gap-1.5 text-[14px] font-medium transition-colors whitespace-nowrap",
              navItem.active
                ? "text-primary"
                : "text-text-light hover:text-primary"
            )}
          >
            <span className="block sm:hidden">{navItem.icon}</span>
            <span className="hidden sm:block">{navItem.name}</span>
          </Link>
        ))}

        {/* Right content */}
        {rightContent}
      </motion.div>
    </AnimatePresence>
  );
};
