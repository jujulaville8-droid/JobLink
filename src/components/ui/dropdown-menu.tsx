"use client";

import { ChevronDown } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type DropdownMenuProps = {
  options: {
    label: string;
    onClick: () => void;
    Icon?: React.ReactNode;
    className?: string;
  }[];
  header?: React.ReactNode;
  dividerAfter?: number[];
  children: React.ReactNode;
};

const DropdownMenu = ({ options, header, dividerAfter = [], children }: DropdownMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="flex items-center gap-2 rounded-full border border-border bg-surface p-1 pr-3 hover:bg-bg-alt hover:border-primary/20 transition-all"
      >
        {children}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-50 w-56 mt-2.5 py-1.5 rounded-xl border border-border shadow-lg shadow-black/10 flex flex-col"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            {header && (
              <div className="px-4 py-2.5 border-b border-border mb-1">
                {header}
              </div>
            )}
            {options && options.length > 0 ? (
              options.map((option, index) => (
                <React.Fragment key={option.label}>
                  <button
                    onClick={() => {
                      option.onClick();
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text cursor-pointer hover:bg-bg-alt transition-colors ${option.className ?? ""}`}
                  >
                    {option.Icon}
                    {option.label}
                  </button>
                  {dividerAfter.includes(index) && (
                    <div className="my-1.5 border-t border-border" />
                  )}
                </React.Fragment>
              ))
            ) : (
              <div className="px-4 py-2 text-text-muted text-xs">No options</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { DropdownMenu };
