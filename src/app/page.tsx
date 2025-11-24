"use client";

import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Home() {
  const testWrite = async () => {
    const docRef = await addDoc(collection(db, "projects"), {
      title: "テスト案件",
      createdAt: new Date().toISOString(),
    });
    console.log("📦 書き込み完了:", docRef.id);
  };

  const testRead = async () => {
    const snapshot = await getDocs(collection(db, "projects"));
    snapshot.forEach((doc) => {
      console.log("📄", doc.id, doc.data());
    });
  };

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Firebase接続テスト</h1>
      <div className="flex gap-4">
        <button
          onClick={testWrite}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          書き込みテスト
        </button>
        <button
          onClick={testRead}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          読み込みテスト
        </button>
      </div>
    </main>
  );
}
