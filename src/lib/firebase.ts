// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyCQeQrC2QlT6gk3RYhbt8eLbzbgVIIRjkM",
//   authDomain: "life-wbs.firebaseapp.com",
//   projectId: "life-wbs",
//   storageBucket: "life-wbs.firebasestorage.app",
//   messagingSenderId: "691482906661",
//   appId: "1:691482906661:web:ff3916e080951d023a6fcc",
//   measurementId: "G-JMEGMCNL8E",
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCQeQrC2QlT6gk3RYhbt8eLbzbgVIIRjkM",
  authDomain: "life-wbs.firebaseapp.com",
  projectId: "life-wbs",
  storageBucket: "life-wbs.appspot.com", // ✅ 修正ポイント！
  messagingSenderId: "691482906661",
  appId: "1:691482906661:web:ff3916e080951d023a6fcc",
  measurementId: "G-JMEGMCNL8E",
};

// ✅ Fast Refresh対策：多重初期化を避ける
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Firestoreインスタンスをエクスポート
export const db = getFirestore(app);
