"use client";
import React, { useEffect, useRef, useState } from "react";
import Checkbox from "@/components/form/input/Checkbox";

interface SpecializationMultiSelectFilterProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
}

export default function SpecializationMultiSelectFilter({
  options,
  selected,
  onChange,
  label = "Specialization",
}: SpecializationMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const clearAll = () => onChange([]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-64">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      >
        <span className="truncate text-left">
          {selected.length === 0
            ? "All specializations"
            : `${selected.length} selected`}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
            >
              {name}
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-label={`Remove ${name}`}
                className="rounded-full p-0.5 hover:bg-brand-500/20"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 1L9 9M9 1L1 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-theme-xs font-medium text-gray-500 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear all
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No specializations available.
            </div>
          ) : (
            <>
              {selected.length > 0 && (
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 dark:border-gray-800">
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {selected.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-theme-xs font-medium text-brand-500 hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
              {options.map((name) => (
                <label
                  key={name}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.03]"
                >
                  <Checkbox checked={selected.includes(name)} onChange={() => toggle(name)} />
                  <span className="truncate">{name}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
