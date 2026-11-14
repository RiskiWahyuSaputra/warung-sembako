import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans: dirancang studio Indonesia untuk identitas Jakarta, angka tabularnya jelas untuk harga.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";

export const metadata: Metadata = {
  title: { default: storeName, template: `%s · ${storeName}` },
  description: "Kasir, stok, dan kasbon warung sembako",
};

export const viewport: Viewport = { themeColor: "#1d5638" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
