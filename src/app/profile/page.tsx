"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const user = useAuth();
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      const data = snap.data();

      const name =
        (data && (data.nickname || data.displayName)) ||
        user.displayName ||
        user.email ||
        "匿名ユーザー";

      setNickname(name);
      setPhotoURL(data?.photoURL || "");
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  // 🔽 プロフィール保存
  // 1) users/{uid} を更新
  // 2) shareProjects の members[] 内のニックネーム & アイコンを一括更新
  const handleSave = async () => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);

    // users/{uid} を更新（nickname と photoURL）
    await updateDoc(userRef, {
      nickname,
      displayName: nickname, // 互換のために残しておいてもOK
      photoURL,
    });

    // 自分が所属している共有PJを検索
    const shareProjectsRef = collection(db, "shareProjects");
    const q = query(
      shareProjectsRef,
      where("memberUids", "array-contains", user.uid)
    );
    const snap = await getDocs(q);

    const newAvatarUrl = photoURL;
    const newNickname = nickname;

    // 各共有PJの members[] 内の自分の情報を更新
    const updatePromises = snap.docs.map((docSnap) => {
      const data = docSnap.data() as any;

      const updatedMembers = (data.members ?? []).map((m: any) =>
        m.id === user.uid
          ? {
              ...m,
              nickname: newNickname,
              avatarUrl: newAvatarUrl,
            }
          : m
      );

      return updateDoc(docSnap.ref, {
        members: updatedMembers,
      });
    });

    await Promise.all(updatePromises);

    alert("プロフィールを保存しました！");
    router.push("/projects");
  };

  // 画像アップロード
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const storageRef = ref(storage, `avatars/${user.uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setPhotoURL(url);

    setUploading(false);
  };

  // 画像削除
  const handleDeleteImage = async () => {
    if (!user || !photoURL) return;

    const storageRef = ref(storage, `avatars/${user.uid}`);

    try {
      await deleteObject(storageRef);
      await updateDoc(doc(db, "users", user.uid), {
        photoURL: "",
      });
      setPhotoURL("");
      alert("画像を削除しました！");
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  };

  if (loading) {
    return <p className="p-20 text-center">読み込み中...</p>;
  }

  if (!user) {
    return <p className="text-center p-20">ログインが必要です</p>;
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-center">プロフィール編集</h1>

      {/* アイコン */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-200 shadow">
          {photoURL ? (
            <img src={photoURL} className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 font-bold text-4xl">
              {nickname.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <label className="cursor-pointer mt-3 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600">
          画像をアップロード
          <input type="file" onChange={handleUpload} className="hidden" />
        </label>

        {uploading && (
          <p className="text-xs text-gray-500 mt-2">アップロード中...</p>
        )}

        {photoURL && (
          <button
            onClick={handleDeleteImage}
            className="mt-2 text-sm text-red-500 underline"
          >
            画像を削除する
          </button>
        )}
      </div>

      {/* ニックネーム（ユーザが自由に変更可能） */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">ニックネーム</label>
        <input
          type="text"
          className="w-full border px-3 py-2 rounded-md"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          共有プロジェクト上の表示名として使われます。
        </p>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
      >
        保存
      </button>
    </main>
  );
}
