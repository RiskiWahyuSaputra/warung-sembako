// Ikon isi (solid, dua tingkat opasitas) yang digambar khusus untuk menu kasir warung.
// Sengaja bukan set ikon garis tipis generik: bentuk isi lebih mudah dikenali di layar kasir.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 22, height: 22, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, ...p });

export const IconKasir = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="11" width="18" height="10" rx="2.5" />
    <rect x="6" y="3" width="10" height="6" rx="1.5" opacity=".45" />
    <rect x="6" y="14" width="3" height="2" rx=".6" fill="#fff" opacity=".9" />
    <rect x="10.5" y="14" width="3" height="2" rx=".6" fill="#fff" opacity=".9" />
    <rect x="15" y="14" width="3" height="2" rx=".6" fill="#fff" opacity=".9" />
  </svg>
);

export const IconBarang = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2.5 3 7v10l9 4.5 9-4.5V7z" opacity=".45" />
    <path d="M12 11.5 3 7v10l9 4.5z" />
  </svg>
);

export const IconStok = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="14" width="18" height="7" rx="2" />
    <rect x="5" y="8.5" width="14" height="5" rx="1.8" opacity=".7" />
    <rect x="7" y="3" width="10" height="4.5" rx="1.5" opacity=".45" />
  </svg>
);

export const IconKasbon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="2.5" width="15" height="19" rx="2.5" opacity=".45" />
    <rect x="3" y="6" width="4" height="2" rx="1" />
    <rect x="3" y="11" width="4" height="2" rx="1" />
    <rect x="3" y="16" width="4" height="2" rx="1" />
    <rect x="10" y="7" width="7" height="2" rx="1" />
    <rect x="10" y="11" width="5" height="2" rx="1" />
  </svg>
);

export const IconTransaksi = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 2.5h14v19l-2.3-1.5-2.4 1.5-2.3-1.5-2.3 1.5-2.4-1.5L5 21.5z" opacity=".45" />
    <rect x="8" y="7" width="8" height="2" rx="1" />
    <rect x="8" y="11" width="8" height="2" rx="1" />
    <rect x="8" y="15" width="5" height="2" rx="1" />
  </svg>
);

export const IconLaporan = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="12" width="4.5" height="9" rx="1.5" opacity=".45" />
    <rect x="9.75" y="7" width="4.5" height="14" rx="1.5" />
    <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" opacity=".7" />
  </svg>
);

export const IconKeluar = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v20H6.5A2.5 2.5 0 0 1 4 19.5z" opacity=".45" />
    <path d="M15 7.5 20 12l-5 4.5V13.5H9v-3h6z" />
  </svg>
);

export const IconCari = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="6.5" opacity=".3" />
    <path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.8 4.8-1.5 1.5-4.8-4.8A7.5 7.5 0 1 1 10.5 3m0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6" />
  </svg>
);

export const IconKamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 4h7l1.5 2.5H20A2 2 0 0 1 22 8.5v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h3z" opacity=".45" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const IconTambah = (p: P) => (
  <svg {...base(p)}>
    <rect x="10.5" y="4" width="3" height="16" rx="1.5" />
    <rect x="4" y="10.5" width="16" height="3" rx="1.5" />
  </svg>
);

export const IconKurang = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="10.5" width="16" height="3" rx="1.5" />
  </svg>
);

export const IconHapus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 7h14l-1.2 13a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" opacity=".45" />
    <rect x="3" y="4" width="18" height="2.5" rx="1.2" />
    <rect x="9" y="2" width="6" height="2.5" rx="1" />
  </svg>
);

export const IconTunai = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" opacity=".45" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
);

export const IconQris = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 3h7v7H3zm2 2v3h3V5zM14 3h7v7h-7zm2 2v3h3V5zM3 14h7v7H3zm2 2v3h3v-3z" />
    <path d="M14 14h3v3h-3zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z" opacity=".5" />
  </svg>
);

export const IconOrang = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4.5" />
    <path d="M3.5 21a8.5 8.5 0 0 1 17 0z" opacity=".45" />
  </svg>
);
