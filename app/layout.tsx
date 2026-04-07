import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Central Dashboard",
  description: "OpenClaw 기업 인스턴스 중앙 관제 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white text-nearblack antialiased">{children}</body>
    </html>
  );
}
