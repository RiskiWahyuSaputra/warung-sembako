"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Status data: memuat, gagal, atau kosong. Semua halaman data memakai ini. */
export function Loading({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-line border-t-primary" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-[#f1b5b8] bg-danger-soft p-4 text-danger">
      <p className="font-semibold">Gagal: {message}</p>
      {onRetry && (
        <button type="button" className="btn btn-danger mt-3" onClick={onRetry}>
          Coba muat ulang
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center px-4 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-canvas text-muted">{icon}</div>}
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

const SIZES = { md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;

/**
 * Dialog native: fokus terkunci di dalam, tertutup dengan Escape.
 * Di HP tampil sebagai lembar dari bawah (bottom sheet), di layar lebar di tengah.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  size?: keyof typeof SIZES;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className={`mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/45 sm:m-auto sm:w-[calc(100%-2rem)] sm:rounded-2xl ${SIZES[size ?? (wide ? "lg" : "md")]}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id="modal-title" className="text-lg font-extrabold">
              {title}
            </h2>
            <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={onClose}>
              Tutup
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Kotak inisial berwarna kategori, pengganti foto barang/avatar. */
export function InitialTile({ text, bg, fg, size = "md" }: { text: string; bg: string; fg: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "size-14 text-lg rounded-xl" : size === "sm" ? "size-9 text-xs rounded-lg" : "size-11 text-sm rounded-xl";
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center font-extrabold ${cls}`} style={{ background: bg, color: fg }}>
      {text}
    </span>
  );
}
