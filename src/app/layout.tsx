import type { Metadata, Viewport } from "next";
import "./globals.css";

// Allow pinch-zoom (WCAG 1.4.4: Resize Text). Locking `userScalable: false`
// and `maximumScale: 1` was an accessibility regression for low-vision users
// — Safari and Android browsers respect both flags. We still set
// initialScale so the layout doesn't double-zoom on iOS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "CORE Log",
  description: "CORE Log - 日々の気づきを記録し、成長を加速させる",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-[#F5F0EB] text-[#1A1A2E]">
        {children}
      </body>
    </html>
  );
}
