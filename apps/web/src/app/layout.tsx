import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lingovector v0.3",
  description: "AI English tutor for Korean high school students",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
