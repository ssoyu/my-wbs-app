import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header"; // ⭐ 追加！

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "人生ダッシュボード",
  description: "人生のプロジェクトと進捗を見える化するアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        {/* ⭐ 全ページに共通で使うヘッダー */}
        <Header />

        {/* ⭐ ページの中身を中央寄せに */}
        <div className="mx-auto max-w-5xl px-4 pb-10 pt-4">{children}</div>
      </body>
    </html>
  );
}
