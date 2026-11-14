"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Status data: memuat, gagal, atau kosong. Semua halaman data memakai ini. */
export function Loading({ label = "Memuat data…" }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-ink-soft">
      {label}
    </p>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-brick bg-brick-tint p-4 text-brick">
      <p className="font-semibold">Gagal: {message}</p>
      {onRetry && (
        <button type="button" className="btn btn-danger mt-3" onClick={onRetry}>
          Coba muat ulang
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="perforated rounded-lg border-2 px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

/** Dialog native: fokus terkunci di dalam, tertutup dengan Escape. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
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
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-line bg-card p-0 text-ink shadow-xl backdrop:bg-ink/50`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="modal-title" className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={onClose}>
              Tutup
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
