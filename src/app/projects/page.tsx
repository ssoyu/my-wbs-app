"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Project {
  id: string;
  title: string;
  description: string;
  isPrivate: boolean;
  goals: any[];
  progress: number;
  deadline?: string;
  createdAt?: any;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProject, setNewProject] = useState<Project>({
    id: "",
    title: "",
    description: "",
    isPrivate: true,
    goals: [],
    progress: 0,
    deadline: "",
  });

  const loadProjects = async () => {
    setIsLoading(true);

    const snapshot = await getDocs(collection(db, "projects"));
    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Project[];

    // ✅ createdAt が undefined でも安全にソート
    setProjects(
      data.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      })
    );

    setIsLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const openModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setNewProject(project);
    } else {
      setEditingProject(null);
      setNewProject({
        id: "",
        title: "",
        description: "",
        isPrivate: true,
        goals: [],
        progress: 0,
        deadline: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const saveProject = async () => {
    if (!newProject.title.trim()) {
      alert("案件タイトルは必須です。");
      return;
    }

    try {
      if (editingProject) {
        const ref = doc(db, "projects", editingProject.id);
        await updateDoc(ref, {
          title: newProject.title,
          description: newProject.description,
          isPrivate: newProject.isPrivate,
          deadline: newProject.deadline,
        });
      } else {
        await addDoc(collection(db, "projects"), {
          title: newProject.title,
          description: newProject.description,
          isPrivate: newProject.isPrivate,
          goals: [],
          progress: 0,
          deadline: newProject.deadline,
          createdAt: serverTimestamp(),
        });
      }
      setIsModalOpen(false);
      await loadProjects();
    } catch (e) {
      console.error("Firestore保存中にエラー:", e);
      alert("保存に失敗しました。");
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      await loadProjects();
    } catch (e) {
      console.error("削除に失敗:", e);
      alert("削除に失敗しました。");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B] p-6 md:p-10">
      {/* ヘッダー */}
      <header className="flex flex-col md:flex-row justify-between md:items-center mb-10 gap-4 md:gap-0 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🌿</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            人生ダッシュボード
          </h1>
        </div>

        <div className="flex gap-3 flex-wrap justify-end">
          <Link
            href="/calendar"
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg shadow-sm transition"
          >
            📅 カレンダー
          </Link>
        </div>
      </header>

      {/* Hero セクション */}
      <section className="relative mb-12 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DFFCF2] via-[#E7F7FF] to-[#F8FAFC] blur-3xl opacity-70" />
        <div className="relative z-10 py-20 px-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4 leading-snug">
            あなたの<span className="text-[#4CD4B0]">人生</span>を、
            <br className="md:hidden" />
            見える化しよう。
          </h1>
          <p className="text-gray-600 text-base md:text-lg mb-6">
            小さなプロジェクトの積み重ねが、あなたの未来を形づくります。
          </p>
          <button
            onClick={() => openModal()}
            className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white font-medium px-6 py-3 rounded-full shadow-md hover:opacity-90 transition"
          >
            ＋ プロジェクトを追加
          </button>
        </div>
      </section>

      {/* 案件一覧 */}
      {isLoading ? (
        // 🔄 スケルトン
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-5"
            >
              <div className="h-5 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-3 bg-gray-100 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-2"></div>
              <div className="h-2 bg-gray-200 rounded w-full mt-3"></div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="text-gray-500 text-center mt-10">
          まだプロジェクトが登録されていません。
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-lg font-semibold">{p.title}</h2>
                  <div className="flex gap-3">
                    <button
                      onClick={() => openModal(p)}
                      className="text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-full p-1 transition"
                      title="編集"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full p-1 transition"
                      title="削除"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {p.description}
                  </p>
                )}
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>{p.isPrivate ? "🔒 個人" : "👥 共有"}</span>
                  {p.deadline && <span>📅 {p.deadline}</span>}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      p.progress >= 80
                        ? "bg-[#4CD4B0]"
                        : p.progress >= 50
                        ? "bg-[#4C9AFF]"
                        : "bg-[#FFD76F]"
                    }`}
                    style={{ width: `${p.progress || 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  進捗率: {p.progress || 0}%
                </p>
              </div>

              <Link
                href={`/projects/${p.id}`}
                className="mt-4 inline-block text-[#4C9AFF] hover:text-[#2C7DF0] text-sm font-medium transition"
              >
                詳細を見る →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ✅ モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {editingProject ? "プロジェクトを編集" : "新しいプロジェクト"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-lg transition"
              >
                ✕
              </button>
            </div>
            {/* 入力フォーム */}
            {/* 入力フォーム */}
            <div className="space-y-4">
              {/* タイトル */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newProject.title}
                  onChange={(e) =>
                    setNewProject({ ...newProject, title: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring focus:ring-blue-100"
                  placeholder="例：新しいプロジェクト"
                />
              </div>

              {/* 説明 */}
              <div>
                <label className="block text-sm font-medium mb-1">説明</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring focus:ring-blue-100"
                  rows={2}
                  placeholder="プロジェクトの概要を入力"
                />
              </div>

              {/* 共有／個人 */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  公開範囲
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="isPrivate"
                      checked={newProject.isPrivate}
                      onChange={() =>
                        setNewProject({ ...newProject, isPrivate: true })
                      }
                    />
                    🔒 個人
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="isPrivate"
                      checked={!newProject.isPrivate}
                      onChange={() =>
                        setNewProject({ ...newProject, isPrivate: false })
                      }
                    />
                    👥 共有
                  </label>
                </div>
              </div>

              {/* 期限 */}
              <div>
                <label className="block text-sm font-medium mb-1">期限</label>
                <input
                  type="date"
                  value={newProject.deadline || ""}
                  onChange={(e) =>
                    setNewProject({ ...newProject, deadline: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={saveProject}
                className="px-4 py-2 bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white rounded-md hover:opacity-90 transition"
              >
                {editingProject ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
