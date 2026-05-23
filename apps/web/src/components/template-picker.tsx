"use client";

import { MeetingTemplate, meetingTemplates } from "@mila/shared";
import { ChevronDown, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TemplatePickerProps {
  value: string;
  onChange: (templateId: string, template: MeetingTemplate) => void;
  disabled?: boolean;
}

export function TemplatePicker({ value, onChange, disabled }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active =
    meetingTemplates.find((template) => template.id === value) ??
    meetingTemplates.find((template) => template.id === "general") ??
    meetingTemplates[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Template
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0d131b] px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-2 truncate">
          <span aria-hidden className="text-base leading-none">
            {active.icon ?? <FileText size={14} />}
          </span>
          <span className="truncate text-left">{active.name}</span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-md border border-white/10 bg-[#121922] p-1 shadow-xl">
          {meetingTemplates.map((template) => {
            const selected = template.id === active.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onChange(template.id, template);
                  setOpen(false);
                }}
                className={
                  selected
                    ? "flex w-full items-start gap-3 rounded px-3 py-2 text-left text-sm transition bg-emerald-300/10 text-white"
                    : "flex w-full items-start gap-3 rounded px-3 py-2 text-left text-sm transition text-slate-300 hover:bg-white/[0.04] hover:text-white"
                }
              >
                <span aria-hidden className="mt-0.5 text-base leading-none">
                  {template.icon ?? <FileText size={14} />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{template.name}</span>
                  <span className="text-xs leading-5 text-slate-500">
                    {template.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
        {active.description}
      </p>
    </div>
  );
}
