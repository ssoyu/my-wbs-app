// src/components/Header.tsx
"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

export default function Header() {
  const user = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // ⭐ 表示名用 state
  const [displayName, setDisplayName] = useState("");
  const [tempName, setTempName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const isActive = (path: string) =>
    pathname === path ? "text-sky-600 font-semibold" : "text-gray-600";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMenuOpen(false);
      router.replace("/login");
    } catch (e) {
      console.error("Logout error:", e);
      alert("ログアウトに失敗しました");
    }
  };

  // ログインID（従来表示していた値）
  const rawEmail = user?.email ?? "";
  const loginId = rawEmail.endsWith("@fake.local")
    ? rawEmail.replace("@fake.local", "")
    : rawEmail || "ゲスト";

  const initial = loginId ? loginId[0]?.toUpperCase() : "?";
  const avatarUrl = user?.photoURL || "";

  // ⭐ 初期表示名を決定（localStorage > user.displayName > loginId）
  useEffect(() => {
    if (!user) {
      setDisplayName("");
      return;
    }

    let baseName =
      user.displayName && user.displayName.trim().length > 0
        ? user.displayName
        : loginId;

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("appDisplayName");
      if (stored && stored.trim().length > 0) {
        baseName = stored;
      }
    }

    setDisplayName(baseName);
  }, [user, loginId]);

  // ⭐ 表示名保存
  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    if (!trimmed) {
      alert("表示名を入力してください。");
      return;
    }

    setDisplayName(trimmed);

    // localStorage に保存（共有PJメンバー名でも使う）
    if (typeof window !== "undefined") {
      localStorage.setItem("appDisplayName", trimmed);
    }

    // Firebase ユーザーの displayName も更新しておく
    if (user) {
      try {
        await updateProfile(user, { displayName: trimmed });
      } catch (e) {
        console.error("displayName 更新エラー:", e);
      }
    }

    setIsEditingName(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
        {/* 左：ロゴ */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => router.push("/projects")}
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-sky-400 flex items-center justify-center text-white text-lg shadow">
            🌿
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">
              人生ダッシュボード
            </div>
            <div className="text-[11px] text-slate-500">
              Life Progress & Projects
            </div>
          </div>
        </div>

        {/* 中央：ナビ */}
        <nav className="hidden sm:flex items-center gap-4 text-sm">
          <Link href="/projects" className={isActive("/projects")}>
            プロジェクト
          </Link>
          <Link href="/calendar" className={isActive("/calendar")}>
            カレンダー
          </Link>
        </nav>

        {/* 右：ログイン状態 */}
        <div className="flex items-center gap-3">
          {user === undefined && (
            <span className="text-xs text-gray-500">読み込み中...</span>
          )}

          {user === null && (
            <Link
              href="/login"
              className="text-xs sm:text-sm px-3 py-1.5 rounded-full border border-sky-500 text-sky-600 hover:bg-sky-50 transition"
            >
              ログイン
            </Link>
          )}

          {user && (
            <div className="relative">
              {/* アイコンボタン */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2"
              >
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[11px] text-slate-400">ログイン中</span>
                  {/* ⭐ ここは displayName を表示 */}
                  <span className="text-xs font-medium text-slate-700 max-w-[140px] truncate">
                    {displayName || loginId}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden shadow-sm border border-slate-200">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-slate-700">
                      {initial}
                    </span>
                  )}
                </div>
              </button>

              {/* ドロップダウンメニュー */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg text-sm overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="text-[11px] text-slate-400">
                      表示名（共有PJなどに表示）
                    </div>
                    <div className="text-xs font-medium text-slate-700 truncate">
                      {displayName || loginId}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      ログインID: {loginId}
                    </div>
                  </div>

                  {/* ⭐ 表示名編集エリア（メニュー内で完結） */}
                  <div className="px-3 py-2 border-b border-slate-100">
                    {isEditingName ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                          placeholder="例：さとう（SIer）"
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setIsEditingName(false)}
                            className="px-2 py-1 text-[11px] bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={handleSaveName}
                            className="px-2 py-1 text-[11px] bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white rounded-md hover:opacity-90"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTempName(displayName || loginId);
                          setIsEditingName(true);
                        }}
                        className="w-full text-left text-xs text-sky-600 hover:text-sky-700 hover:bg-slate-50 rounded-md px-2 py-1"
                      >
                        表示名を変更
                      </button>
                    )}
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 hover:bg-slate-50"
                  >
                    プロフィールを編集
                  </Link>
                  <Link
                    href="/projects"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 hover:bg-slate-50"
                  >
                    プロジェクト一覧
                  </Link>
                  <Link
                    href="/calendar"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 hover:bg-slate-50"
                  >
                    カレンダー
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-red-500 hover:bg-red-50"
                  >
                    ログアウト
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
