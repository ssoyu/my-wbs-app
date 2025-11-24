"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ✅ Firestore関連追加
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Member {
  id: string;
  name: string;
}

interface Issue {
  id: string;
  title: string;
  description: string;
  status: "未対応" | "対応中" | "完了";
  assignee: string;
  deadline: string;
  relatedGoal?: string;
}

interface Goal {
  id: string;
  title: string;
}

interface Project {
  id: string;
  title: string;
  isPrivate: boolean;
  members: Member[];
  goals: Goal[];
  issues: Issue[];
}

export default function IssuesPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: "",
    description: "",
    deadline: "",
    assignee: "",
    relatedGoal: "",
  });

  // 編集モーダル用
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // ================================
  // ✅ Firestore リアルタイム同期
  // ================================
  useEffect(() => {
    const ref = doc(db, "projects", projectId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          alert("この案件は存在しません。");
          router.push("/projects");
          return;
        }

        const data = snap.data() as Project;
        const normalized: Project = {
          id: snap.id,
          title: data.title || "",
          isPrivate: data.isPrivate ?? true,
          members: data.members ?? [],
          goals: data.goals ?? [],
          issues: data.issues ?? [],
        };
        setProject(normalized);
      },
      (error) => {
        console.error("Firestore同期エラー:", error);
      }
    );

    return () => unsubscribe();
  }, [projectId, router]);

  // -------------------------------------
  // Firestoreへ保存関数（完全版）
  // -------------------------------------
  const sanitizeData = (data: any): any => {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizeData(item));
    } else if (data && typeof data === "object") {
      const newObj: any = {};
      for (const [key, value] of Object.entries(data)) {
        // undefined → "" に置き換え
        newObj[key] = value === undefined ? "" : sanitizeData(value);
      }
      return newObj;
    }
    return data;
  };

  const saveProject = async (updated: Project) => {
    if (!updated?.id) return;

    const cleaned = sanitizeData(updated);

    try {
      const ref = doc(db, "projects", updated.id);
      await setDoc(ref, cleaned, { merge: true }); // ← ✅ updateDoc→setDoc
      setProject(cleaned);
      console.log("✅ Firestoreへ保存完了:", cleaned.title);
    } catch (e) {
      console.error("❌ Firestore更新エラー:", e);
      console.dir(cleaned);
      alert("Firestoreへの保存に失敗しました。");
    }
  };

  if (!project)
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]">
        <p className="text-lg font-medium animate-pulse">読み込み中...</p>
      </main>
    );

  // ================================
  // JSX 出力
  // ================================
  return (
    <main
      className="
    min-h-screen 
    bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]
    px-6 sm:px-10 lg:px-20 xl:px-28 py-10
    max-w-[1500px] mx-auto
  "
    >
      {/* Header */}
      <header className="flex justify-between items-center mb-10 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <span>📝</span>
          {project.title} の課題管理表
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/projects/${project.id}`)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md transition"
          >
            ← 案件詳細に戻る
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-4 py-2 rounded-full shadow-sm hover:opacity-90"
          >
            ＋ 課題追加
          </button>
        </div>
      </header>

      {/* 課題一覧 */}
      {!project.issues?.length ? (
        <p className="text-gray-500 text-center py-12">
          📋 課題はまだ登録されていません。
        </p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {project.issues.map((i) => (
            <div
              key={i.id}
              className="bg-white/80 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{i.title}</h3>
                  <p
                    className={`text-xs mt-1 ${
                      i.status === "完了"
                        ? "text-green-600"
                        : i.status === "対応中"
                        ? "text-yellow-600"
                        : "text-gray-500"
                    }`}
                  >
                    {i.status}
                  </p>
                </div>

                {/* ステータス変更 */}
                <select
                  value={i.status}
                  onChange={(e) => {
                    const updatedIssues = project.issues.map((iss) =>
                      iss.id === i.id
                        ? { ...iss, status: e.target.value as Issue["status"] }
                        : iss
                    );
                    saveProject({ ...project, issues: updatedIssues });
                  }}
                  className={`text-sm border rounded-md px-2 py-1 transition ${
                    i.status === "完了"
                      ? "bg-green-100 text-green-700"
                      : i.status === "対応中"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  <option value="未対応">未対応</option>
                  <option value="対応中">対応中</option>
                  <option value="完了">完了</option>
                </select>
              </div>

              <p className="text-sm text-gray-700 mb-3 whitespace-pre-line">
                {i.description || "（詳細なし）"}
              </p>

              <div className="text-xs text-gray-600 space-y-1">
                <p>👤 担当: {i.assignee}</p>
                <p>🗓 期日: {i.deadline}</p>
              </div>

              {i.relatedGoal && (
                <p className="text-xs text-blue-600 mt-2">
                  🎯 関連Goal:{" "}
                  {project.goals.find((g) => g.id === i.relatedGoal)?.title ||
                    "（削除済み）"}
                </p>
              )}

              <div className="flex justify-end mt-4 gap-3">
                <button
                  onClick={() => {
                    setEditingIssue(i); // 編集対象セット
                    setIsEditModalOpen(true); // モーダルを開く
                  }}
                  className="text-sm text-blue-500 hover:text-blue-700"
                >
                  ✏️
                </button>

                <button
                  onClick={() => {
                    if (confirm("この課題を削除しますか？")) {
                      const updated = project.issues.filter(
                        (x) => x.id !== i.id
                      );
                      saveProject({ ...project, issues: updated });
                    }
                  }}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ✅ 課題編集モーダル */}
      {isEditModalOpen && editingIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">✏️ 課題を編集</h2>

            <div className="space-y-3">
              {/* タイトル */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={editingIssue.title}
                  onChange={(e) =>
                    setEditingIssue({ ...editingIssue, title: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              {/* 詳細 */}
              <div>
                <label className="block text-sm font-medium mb-1">詳細</label>
                <textarea
                  value={editingIssue.description}
                  onChange={(e) =>
                    setEditingIssue({
                      ...editingIssue,
                      description: e.target.value,
                    })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  rows={3}
                />
              </div>

              {/* 期日 */}
              <div>
                <label className="block text-sm font-medium mb-1">期日</label>
                <input
                  type="date"
                  value={editingIssue.deadline}
                  onChange={(e) =>
                    setEditingIssue({
                      ...editingIssue,
                      deadline: e.target.value,
                    })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              {/* 担当者 */}
              {!project.isPrivate && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    担当者
                  </label>
                  <select
                    value={editingIssue.assignee}
                    onChange={(e) =>
                      setEditingIssue({
                        ...editingIssue,
                        assignee: e.target.value,
                      })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="">選択してください</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ボタン群 */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  const updatedIssues = project.issues.map((issue) =>
                    issue.id === editingIssue.id ? editingIssue : issue
                  );
                  saveProject({ ...project, issues: updatedIssues });
                  setIsEditModalOpen(false);
                }}
                className="px-4 py-2 bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white rounded-full hover:opacity-90"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 課題追加モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">📝 新しい課題を追加</h2>

            <div className="space-y-3">
              {/* タイトル */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newIssue.title}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, title: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              {/* 詳細 */}
              <div>
                <label className="block text-sm font-medium mb-1">詳細</label>
                <textarea
                  value={newIssue.description}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, description: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  rows={3}
                />
              </div>

              {/* 期日 */}
              <div>
                <label className="block text-sm font-medium mb-1">期日</label>
                <input
                  type="date"
                  value={newIssue.deadline}
                  onChange={(e) =>
                    setNewIssue({ ...newIssue, deadline: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              {/* 担当者 */}
              {!project.isPrivate && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    担当者
                  </label>
                  <select
                    value={newIssue.assignee}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, assignee: e.target.value })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="">選択してください</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 関連Goal */}
              {project.goals.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    関連Goal（任意）
                  </label>
                  <select
                    value={newIssue.relatedGoal}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, relatedGoal: e.target.value })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  >
                    <option value="">選択しない</option>
                    {project.goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (!newIssue.title) {
                    alert("タイトルは必須です。");
                    return;
                  }

                  const issue: Issue = {
                    id: Date.now().toString(),
                    title: newIssue.title,
                    description: newIssue.description,
                    status: "未対応",
                    assignee: project.isPrivate
                      ? "自分"
                      : newIssue.assignee || "未設定",
                    deadline: newIssue.deadline || "期日なし",
                    relatedGoal: newIssue.relatedGoal || "",
                  };

                  saveProject({
                    ...project,
                    issues: [...(project.issues ?? []), issue],
                  });

                  setIsModalOpen(false);
                  setNewIssue({
                    title: "",
                    description: "",
                    deadline: "",
                    assignee: "",
                    relatedGoal: "",
                  });
                }}
                className="px-4 py-2 bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white rounded-full hover:opacity-90"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
