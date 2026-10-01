"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, Loader2, Plus, Trash2, Upload as UploadIcon } from "lucide-react";
import {
  MAX_FILES,
  MAX_MB,
  checkFile,
  deleteUpload,
  fileUrl,
  formatSize,
  isImage,
  listUploads,
  uploadFile,
  type Upload,
  type UploadKind,
} from "@/lib/uploads";

const message = (e: unknown) => (e instanceof Error ? e.message : "That upload didn't work. Please try again.");

/**
 * Logo and reference files for a campaign. Files are private, so previews come from the
 * API rather than a public link.
 */
export function BrandAssets({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [files, setFiles] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listUploads(projectId).then(
      (list) => !cancelled && setFiles(list),
      () => !cancelled && setFiles([]),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const logo = files?.find((f) => f.kind === "logo") ?? null;
  const references = files?.filter((f) => f.kind === "reference") ?? [];

  async function add(list: FileList | null, kind: UploadKind) {
    if (!list?.length) return;
    setError("");
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const problem = checkFile(file);
        if (problem) {
          setError(`${file.name}: ${problem}`);
          continue;
        }
        const saved = await uploadFile(projectId, file, kind);
        // A new logo replaces the old one on the server, so drop it here too.
        setFiles((current) => [...(current ?? []).filter((f) => !(kind === "logo" && f.kind === "logo")), saved]);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(upload: Upload) {
    setError("");
    setBusy(true);
    try {
      await deleteUpload(projectId, upload.id);
      setFiles((current) => (current ?? []).filter((f) => f.id !== upload.id));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!readOnly) add(e.dataTransfer.files, "reference");
  }

  const full = references.length >= MAX_FILES - (logo ? 1 : 0);

  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Brand assets</p>
      <h2 className="mt-2 font-display text-xl font-bold">Bring your brand in</h2>
      <p className="mt-2 text-sm text-muted">Add a logo or reference files. You can do this later.</p>

      {files === null ? (
        <div className="mt-5 h-28 animate-pulse rounded-2xl bg-surface-2" role="status" aria-label="Loading files" />
      ) : (
        <>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Logo</p>
            {logo ? (
              <FileRow upload={logo} projectId={projectId} readOnly={readOnly} busy={busy} onRemove={remove} />
            ) : readOnly ? (
              <p className="text-sm text-subtle">No logo added.</p>
            ) : (
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-3 text-sm text-muted hover:border-[#33529a] hover:text-text disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a logo
              </button>
            )}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Reference files</p>
            {references.length > 0 ? (
              <ul className="mb-3 space-y-2">
                {references.map((f) => (
                  <li key={f.id}>
                    <FileRow upload={f} projectId={projectId} readOnly={readOnly} busy={busy} onRemove={remove} />
                  </li>
                ))}
              </ul>
            ) : null}

            {readOnly ? (
              references.length === 0 ? <p className="text-sm text-subtle">No reference files.</p> : null
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={
                  "grid place-items-center rounded-2xl border border-dashed px-4 py-5 text-center transition-colors " +
                  (dragging ? "border-cyan bg-surface-2" : "border-border-strong")
                }
              >
                {busy ? (
                  <span className="flex items-center gap-2 text-sm text-subtle">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uploading…
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => refInput.current?.click()}
                      disabled={full}
                      className="flex items-center gap-2 text-sm font-semibold text-cyan hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      <UploadIcon className="h-4 w-4" aria-hidden="true" />
                      {full ? `Limit of ${MAX_FILES} files reached` : "Upload files"}
                    </button>
                    {full ? null : <p className="mt-1 text-xs text-subtle">or drop them here</p>}
                  </>
                )}
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-subtle">PNG, JPEG, WebP or PDF, up to {MAX_MB} MB each.</p>

          {error ? (
            <p className="mt-3 text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Choose a logo file"
            onChange={(e) => {
              add(e.target.files, "logo");
              e.target.value = "";
            }}
          />
          <input
            ref={refInput}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="sr-only"
            aria-label="Choose reference files"
            onChange={(e) => {
              add(e.target.files, "reference");
              e.target.value = "";
            }}
          />
        </>
      )}
    </section>
  );
}

function FileRow({
  upload,
  projectId,
  readOnly,
  busy,
  onRemove,
}: {
  upload: Upload;
  projectId: string;
  readOnly: boolean;
  busy: boolean;
  onRemove: (upload: Upload) => void;
}) {
  const href = fileUrl(projectId, upload.id);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-strong bg-surface-2 p-2.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-3"
        aria-label={`Open ${upload.original_filename}`}
      >
        {isImage(upload.content_type) ? (
          // eslint-disable-next-line @next/next/no-img-element -- private file served by our API, not a static asset
          <img src={href} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-4 w-4 text-cyan" aria-hidden="true" />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{upload.original_filename}</p>
        <p className="text-xs text-subtle">{formatSize(upload.size_bytes)}</p>
      </div>
      {readOnly ? null : (
        <button
          type="button"
          onClick={() => onRemove(upload)}
          disabled={busy}
          aria-label={`Remove ${upload.original_filename}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
