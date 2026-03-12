"use client";
import React, { useState } from "react";
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
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
    active?: boolean;
  }[];
  className?: string;
  rightContent?: React.ReactNode;
}) => {
  const { scrollYProgress } = useScroll();

  const [visible, setVisible] = useState(false);

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
          opacity: 1,
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
          "fixed top-4 inset-x-0 mx-auto z-[5000] w-[92%] max-w-[720px]",
          "flex items-center justify-between",
          "h-14 px-5 rounded-2xl",
          "bg-white/80 backdrop-blur-xl border border-border/60",
          "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]",
          className
        )}
      >
        {/* Wordmark */}
        <Link href="/" className="font-display text-lg font-bold tracking-tight text-primary shrink-0">
          JobLink
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navItems.map((navItem, idx: number) => (
            <Link
              key={`link-${idx}`}
              href={navItem.link}
              className={cn(
                "relative px-3 py-1.5 text-[14px] font-medium rounded-lg transition-colors",
                navItem.active
                  ? "text-primary"
                  : "text-text-light hover:text-primary hover:bg-bg-alt"
              )}
            >
              <span className="block sm:hidden">{navItem.icon}</span>
              <span className="hidden sm:block">{navItem.name}</span>
              {navItem.active && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" />
              )}
            </Link>
          ))}
        </nav>

        {/* Right content */}
        <div className="shrink-0">
          {rightContent}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
