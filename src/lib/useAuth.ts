// src/lib/useAuth.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * 認証状態を監視するカスタムフック
 * - 戻り値:
 *   - undefined: 認証状態を確認中
 *   - null: 未ログイン
 *   - User: ログイン済み
 * ログイン時に Firestore 側に users/{uid} のプロフィールも自動作成する
 */
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Firestore にユーザープロフィールを作成（なければ）
          const userRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(userRef);

          if (!snap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.email?.split("@")[0] ?? "ユーザー",
              photoURL: firebaseUser.photoURL ?? "",
              createdAt: serverTimestamp(),
            });
          }
        } catch (e) {
          console.error("ユーザープロフィール作成に失敗:", e);
        }

        setUser(firebaseUser);
      } else {
        setUser(null);
      }
    });

    return () => unsub();
  }, []);

  return user;
}
