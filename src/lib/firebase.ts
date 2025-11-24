// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage"; // ⭐ 追加

const firebaseConfig = {
  apiKey: "AIzaSyCQeQrC2QlT6gk3RYhbt8eLbzbgVIIRjkM",
  authDomain: "life-wbs.firebaseapp.com",
  projectId: "life-wbs",
  storageBucket: "life-wbs.appspot.com",
  messagingSenderId: "691482906661",
  appId: "1:691482906661:web:ff3916e080951d023a6fcc",
  measurementId: "G-JMEGMCNL8E",
};

// Fast Refresh対策：多重初期化を避ける
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app); // ⭐ 追加：プロフィール画像などを保存するため
