import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lingovector v0.3",
  description: "한국 고등학생을 위한 영어 사고력 튜터",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
