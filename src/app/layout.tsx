import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "CORE Log - リーダーシップ開発",
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
