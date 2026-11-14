"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Pemindai barcode lewat kamera (kamera belakang HP diutamakan).
 * Scanner USB/Bluetooth tidak butuh komponen ini: alat itu "mengetik" kode + Enter
 * ke kolom pencarian, yang sudah ditangani di halaman kasir dan form barang.
 */
export function BarcodeScanner({
  onDetected,
  continuous = false,
}: {
  onDetected: (code: string) => void;
  /** true: terus memindai (kasir). false: berhenti setelah satu kode (isi form). */
  continuous?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbackRef = useRef(onDetected);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let stopped = false;
    let last = { code: "", at: 0 };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("Kamera hanya bisa dipakai lewat HTTPS atau localhost.");
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText();
            const now = Date.now();
            // Kode yang sama dalam 1,5 detik dianggap satu kali scan.
            if (code === last.code && now - last.at < 1500) return;
            last = { code, at: now };
            setLastCode(code);
            navigator.vibrate?.(60);
            callbackRef.current(code);
            if (!continuous) {
              stopped = true;
              controls?.stop();
            }
          },
        );
        if (stopped) controls.stop();
        else setStatus("scanning");
      } catch (e) {
        setStatus("error");
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser lalu buka lagi."
            : name === "NotFoundError"
              ? "Kamera tidak ditemukan di perangkat ini."
              : "Kamera tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera lalu coba lagi.",
        );
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [continuous]);

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-ink">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline width={640} height={480} />
        {status === "scanning" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-danger" />
        )}
      </div>
      <p role="status" className="mt-2 text-sm text-muted">
        {status === "starting" && "Membuka kamera…"}
        {status === "scanning" &&
          (lastCode ? `Terbaca: ${lastCode}` : "Arahkan barcode ke garis merah, jarak sekitar 15 cm.")}
      </p>
      {status === "error" && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
