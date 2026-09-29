"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import { projectHref, type Project } from "@/lib/projects";

const item =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-3 hover:text-text";

/** Row actions for one campaign. The example campaign can only be opened or duplicated. */
export function ProjectMenu({
  project,
  onRename,
  onDuplicate,
  onDelete,
  busy = false,
}: {
  project: Project;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={`Actions for ${project.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-text disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border-strong bg-surface-2 p-1.5 shadow-2xl"
        >
          <button role="menuitem" className={item} onClick={run(() => router.push(projectHref(project)))}>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> Open
          </button>
          {project.is_demo ? null : (
            <button role="menuitem" className={item} onClick={run(onRename)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Rename
            </button>
          )}
          <button role="menuitem" className={item} onClick={run(onDuplicate)}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Duplicate
          </button>
          {project.is_demo ? null : (
            <button
              role="menuitem"
              className={`${item} text-danger hover:bg-danger/10 hover:text-danger`}
              onClick={run(onDelete)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
