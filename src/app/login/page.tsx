// src/app/login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

// 🔧 Firebaseエラーコード → 日本語メッセージ
function friendlyErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/missing-password":
      return "パスワードを入力してください。";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "メールアドレスまたはパスワードが違います。";
    case "auth/weak-password":
      return "パスワードは6文字以上にしてください。";
    case "auth/email-already-in-use":
      return "このメールアドレスはすでに登録されています。";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらく時間をおいてから再試行してください。";
    default:
      return "処理に失敗しました。もう一度お試しください。";
  }
}

export default function LoginPage() {
  const user = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ログイン済みなら /projects へ
  useEffect(() => {
    if (user) {
      router.replace("/projects");
    }
  }, [user, router]);

  // Google ログイン
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace("/projects");
    } catch (e) {
      console.error("Google login error:", e);
      alert("Googleログインに失敗しました");
    }
  };

  // メールアドレス + パスワードでログイン
  const handleEmailLogin = async () => {
    if (!email || !password) {
      alert("メールアドレスとパスワードを入力してください");
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/projects");
    } catch (e: any) {
      console.error("Email login error:", e);
      const msg = friendlyErrorMessage(e.code);
      alert(msg);
    }
  };

  // 新規登録
  const handleRegister = async () => {
    if (!email || !password) {
      alert("メールアドレスとパスワードを入力してください");
      return;
    }
    if (password.length < 6) {
      alert("パスワードは6文字以上にしてください");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace("/projects");
    } catch (e: any) {
      console.error("Register error:", e);
      const msg = friendlyErrorMessage(e.code);
      alert(msg);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white shadow-md rounded-xl p-8 w-full max-w-md text-center space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">人生ダッシュボード</h1>
          <p className="text-gray-600 text-sm">
            ログインして、あなた専用の管理画面を使いましょう。
          </p>
        </div>

        {/* メール / Password 入力 */}
        <div className="space-y-4 text-left">
          {/* メールアドレス */}
          <div>
            <label className="block text-sm font-medium mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-blue-100"
              placeholder="example@email.com"
              autoComplete="email"
            />
          </div>

          {/* パスワード */}
          <div>
            <label className="block text-sm font-medium mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-blue-100"
              placeholder="6文字以上"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleEmailLogin}
              className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 rounded-lg text-sm transition"
            >
              メールアドレスでログイン
            </button>
            <button
              onClick={handleRegister}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-sm transition"
            >
              新規アカウント作成
            </button>
          </div>
        </div>

        {/* 区切り */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          <span>または</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google ログイン */}
        <div>
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm transition"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    </main>
  );
}
