"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ✅ Firestore関連を追加
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ===============================
// 型定義（変更なし）
// ===============================
interface Member {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  done: boolean;
  deadline: string;
  completedAt?: string;
  assignee: string;
}

interface Goal {
  id: string;
  title: string;
  deadline: string;
  tasks: Task[];
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

interface Project {
  id: string;
  title: string;
  description: string;
  isPrivate: boolean;
  members: Member[];
  goals: Goal[];
  issues: Issue[];
  progress?: number;
  deadline?: string;
}

// ===============================
// コンポーネント
// ===============================
export default function ProjectDetail() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);

  // 既存のState群（変更なし）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    deadline: "",
    assignee: "",
    completedAt: "",
  });

  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<{
    goalId: string;
    task: Task;
  } | null>(null);
  const [completeData, setCompleteData] = useState({
    completedAt: "",
    note: "",
  });

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: "",
    description: "",
    deadline: "",
    assignee: "",
  });

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", deadline: "" });

  // ===============================
  // ✅ Firestoreから案件を取得
  // ===============================
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const ref = doc(db, "projects", projectId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as Project;
          const normalized: Project = {
            id: snap.id,
            title: data.title || "",
            description: data.description || "",
            isPrivate: data.isPrivate ?? true,
            members: data.members ?? [],
            goals: data.goals ?? [],
            issues: data.issues ?? [],
            progress: data.progress ?? 0,
            deadline: data.deadline || "",
          };
          setProject(normalized);
        } else {
          alert("この案件は存在しません。");
          router.push("/projects");
        }
      } catch (error) {
        console.error("Firestore読み込みエラー:", error);
        alert("データの読み込みに失敗しました。");
      }
    };

    fetchProject();
  }, [projectId, router]);

  // ===============================
  // ✅ Firestoreへ保存（localStorage完全削除）
  // ===============================
  const saveProject = async (updated: Project) => {
    if (!updated?.id) return;

    // ✅ Firestoreに送る前にundefinedを除去
    const cleanObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      } else if (obj && typeof obj === "object") {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value === undefined) continue; // 🔥 undefinedを削除
          result[key] = cleanObject(value);
        }
        return result;
      }
      return obj;
    };

    const cleaned = cleanObject(updated);

    const updatedWithProgress = {
      ...cleaned,
      progress: calculateProgress(cleaned),
    };

    try {
      const ref = doc(db, "projects", updated.id);
      await updateDoc(ref, updatedWithProgress);
      setProject(updatedWithProgress);
      console.log("✅ Firestoreへ保存完了:", updated.title);
    } catch (e) {
      console.error("❌ Firestore更新エラー:", e);
      console.dir(updatedWithProgress);
      alert("Firestoreへの保存に失敗しました。");
    }
  };

  // =====================================
  // 進捗率を自動計算する関数（Taskのみ）
  // =====================================
  const calculateProgress = (project: Project): number => {
    let total = 0;
    let done = 0;

    for (const goal of project.goals) {
      for (const task of goal.tasks) {
        total++;
        if (task.done) done++;
      }
    }

    return total === 0 ? 0 : Math.round((done / total) * 100);
  };

  // -------------------------------------
  // Goal追加
  // -------------------------------------
  // 追加 state
  // const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  // const [newGoal, setNewGoal] = useState({ title: "", deadline: "" });

  // 編集モード時、モーダルに既存データを反映
  useEffect(() => {
    if (editingGoal) {
      setNewGoal({
        title: editingGoal.title,
        deadline: editingGoal.deadline,
      });
    } else {
      setNewGoal({ title: "", deadline: "" });
    }
  }, [editingGoal]);

  // Goal追加開始（モーダルを開く）
  const openGoalModal = () => {
    setEditingGoal(null); // ← ★ これを追加！
    setNewGoal({ title: "", deadline: "" });
    setIsGoalModalOpen(true);
  };

  // Goal保存
  const saveGoal = () => {
    if (!project) return;
    if (!newGoal.title) {
      alert("タイトルは必須です。");
      return;
    }

    if (editingGoal) {
      // 編集モード
      const updatedGoals = project.goals.map((goal) =>
        goal.id === editingGoal.id
          ? { ...goal, title: newGoal.title, deadline: newGoal.deadline }
          : goal
      );
      saveProject({ ...project, goals: updatedGoals });
      setEditingGoal(null);
    } else {
      // 新規追加
      const newItem: Goal = {
        id: Date.now().toString(),
        title: newGoal.title,
        deadline: newGoal.deadline || "期日なし",
        tasks: [],
      };
      saveProject({ ...project, goals: [...project.goals, newItem] });
    }

    setIsGoalModalOpen(false);
  };

  // -------------------------------------
  // Task追加
  // -------------------------------------
  const addTask = (goalId: string) => {
    setCurrentGoalId(goalId);
    setNewTask({ title: "", deadline: "", assignee: "", completedAt: "" });
    setIsModalOpen(true);
  };

  // -------------------------------------
  // Task完了切替
  // -------------------------------------
  // -------------------------------------
  // Task完了切替（完了日＝今日）
  // -------------------------------------
  const toggleTask = (goalId: string, taskId: string) => {
    if (!project) return;

    const updatedGoals = project.goals.map((g) => {
      if (g.id !== goalId) return g;

      const updatedTasks = g.tasks.map((t) => {
        if (t.id !== taskId) return t;

        if (!t.done) {
          // ✅ 完了にする → 今日を自動セット
          const today = new Date().toISOString().split("T")[0];
          return { ...t, done: true, completedAt: today };
        } else {
          // ✅ 未完了に戻す
          return { ...t, done: false, completedAt: undefined };
        }
      });

      return { ...g, tasks: updatedTasks };
    });

    saveProject({ ...project, goals: updatedGoals });
  };

  if (!project)
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]">
        <p className="text-lg font-medium animate-pulse">読み込み中...</p>
      </main>
    );

  // -------------------------------------
  // JSX出力
  // -------------------------------------
  return (
    <main
      className="
    min-h-screen 
    bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]
    px-4 sm:px-8 lg:px-16 xl:px-24
    py-8
    max-w-[1400px] mx-auto
  "
    >
      {/* ヘッダー */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-10 border-b border-gray-200 pb-4">
        {/* 左側：タイトル・説明 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span>📁</span>
            {project.title}
            <span className="text-sm text-gray-500">
              {project.isPrivate ? "（個人）" : "（共有）"}
            </span>
          </h1>
          {project.description && (
            <p className="text-sm text-gray-600 mt-1">{project.description}</p>
          )}
        </div>

        {/* 右側：操作ボタン群 */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* 📋 課題管理表 */}
          <button
            onClick={() => router.push(`/projects/${project.id}/issues`)}
            className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-4 py-2 rounded-full shadow-sm hover:opacity-90 text-sm transition"
          >
            📋 課題管理表
          </button>

          {/* ← 一覧へ戻る */}
          <button
            onClick={() => router.push("/projects")}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm transition"
          >
            ← 一覧へ戻る
          </button>
        </div>
      </header>

      {/* ✅ メンバー管理セクション */}
      <section className="bg-white/70 rounded-xl shadow-sm border border-gray-100 p-5 mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            👥 メンバー
          </h2>

          {!project.isPrivate && (
            <button
              onClick={() => {
                const name = prompt("新しいメンバー名を入力してください");
                if (!name) return;
                const newMember: Member = { id: Date.now().toString(), name };
                saveProject({
                  ...project,
                  members: [...(project.members ?? []), newMember],
                });
              }}
              className="text-sm bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-3 py-1 rounded-full hover:opacity-90"
            >
              ＋ メンバー追加
            </button>
          )}
        </div>

        {project.members.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {project.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:shadow-md transition"
              >
                <span className="text-sm font-medium text-gray-800">
                  {m.name}
                </span>
                {!project.isPrivate && (
                  <button
                    onClick={() => {
                      if (confirm(`${m.name} さんを削除しますか？`)) {
                        saveProject({
                          ...project,
                          members: project.members.filter((x) => x.id !== m.id),
                        });
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            まだメンバーが登録されていません。
          </p>
        )}
      </section>
      {/* ===============================
     Goals セクション（改良版）
   =============================== */}
      {/* 🎯 中項目（Goals） */}
      <section className="bg-white/60 rounded-xl border border-gray-200 shadow-sm p-6 mb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            🎯 中項目（Goals）
          </h2>
          <button
            onClick={openGoalModal}
            className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-4 py-2 rounded-full shadow-sm hover:opacity-90"
          >
            ＋ Goal追加
          </button>
        </div>

        {/* 全体進捗 */}
        <div className="mb-8">
          <h3 className="text-base font-semibold mb-1 text-gray-700">
            📊 全体進捗率
          </h3>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-300 bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF]"
              style={{ width: `${project.progress || 0}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {project.progress || 0}% 完了
          </p>
        </div>

        {/* Goalリスト */}
        {project.goals.length === 0 ? (
          <p className="text-gray-500">まだGoalが登録されていません。</p>
        ) : (
          <ul
            className="
      grid gap-4 
      sm:grid-cols-1   /* スマホでは1列 */
      md:grid-cols-2   /* 中画面以上では2列 */
    "
          >
            {project.goals.map((g) => {
              const totalTasks = g.tasks.length;
              const doneTasks = g.tasks.filter((t) => t.done).length;
              const goalProgress = totalTasks
                ? Math.round((doneTasks / totalTasks) * 100)
                : 0;

              const sortedTasks = [...g.tasks].sort((a, b) => {
                if (a.deadline === "期日なし") return 1;
                if (b.deadline === "期日なし") return -1;
                return (
                  new Date(a.deadline).getTime() -
                  new Date(b.deadline).getTime()
                );
              });

              return (
                <li
                  key={g.id}
                  className="bg-gray-50 rounded-lg border border-gray-200"
                >
                  {/* Goalヘッダー */}
                  <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {g.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        🗓 {g.deadline || "期日なし"}
                      </p>
                      <div className="mt-2 w-48 bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF]"
                          style={{ width: `${goalProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {goalProgress}%（{doneTasks}/{totalTasks}）
                      </p>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <button
                        onClick={() => addTask(g.id)}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        ＋ Task
                      </button>
                      <button
                        onClick={() => {
                          setEditingGoal(g);
                          setIsGoalModalOpen(true);
                        }}
                        className="text-gray-500 hover:text-blue-500"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("このGoalを削除しますか？")) {
                            const updatedGoals = project.goals.filter(
                              (goal) => goal.id !== g.id
                            );
                            saveProject({ ...project, goals: updatedGoals });
                          }
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* タスク一覧 */}
                  <div className="p-4 pl-6 space-y-2 border-l-4 border-[#4C9AFF]/40 bg-white">
                    {sortedTasks.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        まだタスクが登録されていません。
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sortedTasks.map((t) => {
                          const isOverdue =
                            t.deadline !== "期日なし" &&
                            new Date(t.deadline).getTime() <
                              new Date().setHours(0, 0, 0, 0) &&
                            !t.done;

                          return (
                            <li
                              key={t.id}
                              className={`flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md border ${
                                isOverdue
                                  ? "border-red-300 bg-red-50"
                                  : "border-gray-200"
                              }`}
                            >
                              <div>
                                <span
                                  className={`${
                                    t.done
                                      ? "line-through text-gray-400"
                                      : isOverdue
                                      ? "text-red-600 font-semibold"
                                      : ""
                                  }`}
                                >
                                  {t.title}
                                </span>
                                <span className="ml-2 text-xs text-gray-500">
                                  🗓 {t.deadline}
                                </span>
                                <span className="ml-2 text-xs text-gray-600">
                                  👤 {t.assignee}
                                </span>
                              </div>
                              <div className="flex gap-2 text-xs">
                                <button
                                  onClick={() => {
                                    if (t.done) {
                                      toggleTask(g.id, t.id);
                                    } else {
                                      setCompletingTask({
                                        goalId: g.id,
                                        task: t,
                                      });
                                      setIsCompleteModalOpen(true); // ← 🔥これを追加！
                                    }
                                  }}
                                  className={`${
                                    t.done
                                      ? "text-gray-500 hover:text-gray-700"
                                      : "text-blue-500 hover:text-blue-700"
                                  }`}
                                >
                                  {t.done ? "戻す" : "完了"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingTask(t);
                                    setCurrentGoalId(g.id);
                                    setIsModalOpen(true);
                                  }}
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("このタスクを削除しますか？")) {
                                      const updatedGoals = project.goals.map(
                                        (goal) =>
                                          goal.id === g.id
                                            ? {
                                                ...goal,
                                                tasks: goal.tasks.filter(
                                                  (task) => task.id !== t.id
                                                ),
                                              }
                                            : goal
                                      );
                                      saveProject({
                                        ...project,
                                        goals: updatedGoals,
                                      });
                                    }
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  🗑
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ✅ Goal追加モーダル */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            {/* <h2 className="text-lg font-semibold mb-4">
              🎯 中項目（Goal）を追加
            </h2> */}
            <h2 className="text-lg font-semibold mb-4">
              🎯 {editingGoal ? "中項目（Goal）を編集" : "中項目（Goal）を追加"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) =>
                    setNewGoal({ ...newGoal, title: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="例：設計フェーズ完了"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">期日</label>
                <input
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) =>
                    setNewGoal({ ...newGoal, deadline: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={saveGoal}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                {editingGoal ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ タスク追加モーダル（正しい位置） */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              📝 {editingTask ? "タスクを編集" : "新しいタスクを追加"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="例：資料作成"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">期日</label>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={(e) =>
                    setNewTask({ ...newTask, deadline: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>

              {!project?.isPrivate && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    担当者
                  </label>
                  <select
                    value={newTask.assignee}
                    onChange={(e) =>
                      setNewTask({ ...newTask, assignee: e.target.value })
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

              {/* ✅ 完了日（編集モード時のみ表示） */}
              {editingTask && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    完了日
                  </label>
                  <input
                    type="date"
                    value={newTask.completedAt || ""}
                    onChange={(e) =>
                      setNewTask({ ...newTask, completedAt: e.target.value })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (!newTask.title) {
                    alert("タイトルは必須です。");
                    return;
                  }

                  const parentGoal = project?.goals.find(
                    (g) => g.id === currentGoalId
                  );
                  if (!parentGoal) return;

                  const deadline = newTask.deadline || "期日なし";
                  const assignee = project?.isPrivate
                    ? "自分"
                    : newTask.assignee || "未設定";

                  let updatedGoals;

                  if (editingTask) {
                    // ✏️ 編集モード
                    updatedGoals = project.goals.map((g) =>
                      g.id === parentGoal.id
                        ? {
                            ...g,
                            tasks: g.tasks.map((task) =>
                              task.id === editingTask.id
                                ? {
                                    ...task,
                                    title: newTask.title,
                                    deadline,
                                    assignee,
                                    completedAt:
                                      newTask.completedAt || task.completedAt, // ← 追加
                                  }
                                : task
                            ),
                          }
                        : g
                    );
                  } else {
                    // ＋ 新規追加モード
                    updatedGoals = project.goals.map((g) =>
                      g.id === parentGoal.id
                        ? {
                            ...g,
                            tasks: [
                              ...g.tasks,
                              {
                                id: Date.now().toString(),
                                title: newTask.title,
                                done: false,
                                deadline,
                                assignee,
                                completedAt: "", // ← 初期値
                              },
                            ],
                          }
                        : g
                    );
                  }

                  saveProject({ ...project, goals: updatedGoals });

                  // モーダルを閉じてリセット
                  setIsModalOpen(false);
                  setEditingTask(null);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                {editingTask ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ✅ タスク完了モーダル（備考なしバージョン） */}
      {isCompleteModalOpen && completingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">✅ タスク完了を登録</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">完了日</label>
                <input
                  type="date"
                  value={completeData.completedAt}
                  onChange={(e) =>
                    setCompleteData({
                      ...completeData,
                      completedAt: e.target.value,
                    })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (!completeData.completedAt) {
                    alert("完了日は必須です。");
                    return;
                  }

                  const { goalId, task } = completingTask;

                  const updatedGoals = project.goals.map((goal) =>
                    goal.id === goalId
                      ? {
                          ...goal,
                          tasks: goal.tasks.map((t) =>
                            t.id === task.id
                              ? {
                                  ...t,
                                  done: true,
                                  completedAt: completeData.completedAt,
                                }
                              : t
                          ),
                        }
                      : goal
                  );

                  saveProject({ ...project, goals: updatedGoals });
                  setIsCompleteModalOpen(false);
                  setCompletingTask(null);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
