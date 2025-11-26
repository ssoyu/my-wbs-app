"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Firestore関連
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

// ===============================
// 型定義
// ===============================

interface Task {
  id: string;
  title: string;
  done: boolean;
  deadline: string;
  completedAt?: string;
  assignee: string; // 個人PJでは常に「自分」で使う
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

// 🔁 毎週のルーティン（単語帳・ピアノ練習など）
interface Routine {
  id: string;
  title: string;
  targetHoursPerWeek: number;
  memo?: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  isPrivate: boolean;
  goals: Goal[];
  issues: Issue[];
  progress?: number;
  deadline?: string;

  // このプロジェクトに週あたりどれだけ時間を割くか（目安）
  allocatedHoursPerWeek?: number;

  // 🔁 このプロジェクト内のルーティン
  routines?: Routine[];
}

// ===============================
// コンポーネント
// ===============================
export default function ProjectDetail() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const user = useAuth(); // 🔑 ログインユーザー
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Task / Goal まわりの state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    deadline: "",
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

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", deadline: "" });

  // このPJに割り当てる時間の入力用 state（テキストボックス用）
  const [allocationInput, setAllocationInput] = useState<string>("0");

  // 🔁 Routine用の state
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [routineForm, setRoutineForm] = useState<{
    title: string;
    targetHoursPerWeek: string;
    memo: string;
  }>({
    title: "",
    targetHoursPerWeek: "1",
    memo: "",
  });

  // ===============================
  // ✅ Firestoreから案件を取得（users/{uid}/projects/{id}）
  // ===============================
  useEffect(() => {
    // 認証状態チェック中
    if (user === undefined) return;

    // 未ログインならプロジェクトは取れない
    if (!user) {
      setLoading(false);
      return;
    }
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const ref = doc(db, "users", user.uid, "projects", projectId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as Project;
          const normalized: Project = {
            id: snap.id,
            title: data.title || "",
            description: data.description || "",
            isPrivate: data.isPrivate ?? true,
            goals: data.goals ?? [],
            issues: data.issues ?? [],
            progress: data.progress ?? 0,
            deadline: data.deadline || "",
            allocatedHoursPerWeek: data.allocatedHoursPerWeek ?? 0,
            routines: data.routines ?? [],
          };
          setProject(normalized);
          setAllocationInput(String(normalized.allocatedHoursPerWeek ?? 0));
        } else {
          setProject(null);
        }
      } catch (error) {
        console.error("Firestore読み込みエラー:", error);
        setProject(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [user, projectId]);

  // ===============================
  // ✅ Firestoreへ保存（users/{uid}/projects/{id}）
  // ===============================
  const saveProject = async (updated: Project) => {
    if (!updated?.id) return;
    if (!user) {
      alert("ログインが切れています。再度ログインしてください。");
      return;
    }

    // ✅ Firestoreに送る前にundefinedを除去
    const cleanObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      } else if (obj && typeof obj === "object") {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value === undefined) continue;
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
      const ref = doc(db, "users", user.uid, "projects", updated.id);
      await updateDoc(ref, updatedWithProgress);
      setProject(updatedWithProgress as Project);
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
  const calculateProgress = (project: { goals: Goal[] }): number => {
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

  // 割り当て時間を保存するハンドラ
  const handleSaveAllocation = () => {
    if (!project) return;
    const hours = Number(allocationInput);
    const safeHours = isNaN(hours) || hours < 0 ? 0 : hours;

    const updated: Project = {
      ...project,
      allocatedHoursPerWeek: safeHours,
    };

    saveProject(updated);
  };

  // -------------------------------------
  // Goal追加
  // -------------------------------------
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

  const openGoalModal = () => {
    setEditingGoal(null);
    setNewGoal({ title: "", deadline: "" });
    setIsGoalModalOpen(true);
  };

  const saveGoal = () => {
    if (!project) return;
    if (!newGoal.title) {
      alert("タイトルは必須です。");
      return;
    }

    if (editingGoal) {
      const updatedGoals = project.goals.map((goal) =>
        goal.id === editingGoal.id
          ? { ...goal, title: newGoal.title, deadline: newGoal.deadline }
          : goal
      );
      saveProject({ ...project, goals: updatedGoals });
      setEditingGoal(null);
    } else {
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
    setNewTask({ title: "", deadline: "", completedAt: "" });
    setIsModalOpen(true);
  };

  // -------------------------------------
  // Task完了切替（完了日＝今日 or リセット）
  // -------------------------------------
  const toggleTask = (goalId: string, taskId: string) => {
    if (!project) return;

    const updatedGoals = project.goals.map((g) => {
      if (g.id !== goalId) return g;

      const updatedTasks = g.tasks.map((t) => {
        if (t.id !== taskId) return t;

        if (!t.done) {
          const today = new Date().toISOString().split("T")[0];
          return { ...t, done: true, completedAt: today };
        } else {
          return { ...t, done: false, completedAt: undefined };
        }
      });

      return { ...g, tasks: updatedTasks };
    });

    saveProject({ ...project, goals: updatedGoals });
  };

  // -------------------------------------
  // 🔁 Routine追加/編集/削除まわり
  // -------------------------------------
  const openNewRoutineModal = () => {
    setEditingRoutine(null);
    setRoutineForm({
      title: "",
      targetHoursPerWeek: "1",
      memo: "",
    });
    setIsRoutineModalOpen(true);
  };

  const openEditRoutineModal = (routine: Routine) => {
    setEditingRoutine(routine);
    setRoutineForm({
      title: routine.title,
      targetHoursPerWeek: String(routine.targetHoursPerWeek ?? 0),
      memo: routine.memo ?? "",
    });
    setIsRoutineModalOpen(true);
  };

  const saveRoutine = () => {
    if (!project) return;
    if (!routineForm.title.trim()) {
      alert("ルーティンのタイトルは必須です。");
      return;
    }

    const num = Number(routineForm.targetHoursPerWeek);
    const hours = isNaN(num) || num < 0 ? 0 : Math.round(num * 10) / 10; // 小数1桁くらいに丸める

    const existing = project.routines ?? [];
    let updatedRoutines: Routine[];

    if (editingRoutine) {
      updatedRoutines = existing.map((r) =>
        r.id === editingRoutine.id
          ? {
              ...r,
              title: routineForm.title.trim(),
              targetHoursPerWeek: hours,
              memo: routineForm.memo.trim() || undefined,
            }
          : r
      );
    } else {
      const newRoutine: Routine = {
        id: Date.now().toString(),
        title: routineForm.title.trim(),
        targetHoursPerWeek: hours,
        memo: routineForm.memo.trim() || undefined,
      };
      updatedRoutines = [...existing, newRoutine];
    }

    saveProject({ ...project, routines: updatedRoutines });
    setIsRoutineModalOpen(false);
    setEditingRoutine(null);
  };

  const deleteRoutine = (routineId: string) => {
    if (!project) return;
    if (!confirm("このルーティンを削除しますか？")) return;

    const existing = project.routines ?? [];
    const updatedRoutines = existing.filter((r) => r.id !== routineId);
    saveProject({ ...project, routines: updatedRoutines });
  };

  // ===============================
  // レンダリング分岐
  // ===============================
  // 認証状態確認中 or Firestore読み込み中
  if (user === undefined || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]">
        <p className="text-lg font-medium animate-pulse">読み込み中...</p>
      </main>
    );
  }

  // 未ログイン
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">ログインが必要です</h1>
          <p className="text-gray-600 text-sm mb-6">
            あなた専用の案件を表示するには、ログインしてください。
          </p>
          <button
            onClick={() => router.push("/login")}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            ログイン画面へ
          </button>
        </div>
      </main>
    );
  }

  // プロジェクトが存在しない
  if (!project) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">この案件はありません</h1>
          <p className="text-gray-600 text-sm mb-6">
            削除されたか、URL が間違っている可能性があります。
          </p>
          <button
            onClick={() => router.push("/projects")}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            プロジェクト一覧に戻る
          </button>
        </div>
      </main>
    );
  }

  // ここから下は project が必ず存在
  const routines = project.routines ?? [];
  const totalRoutineHours = routines.reduce(
    (sum, r) => sum + (r.targetHoursPerWeek || 0),
    0
  );

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
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 border-b border-gray-200 pb-4">
        {/* 左側：タイトル・説明 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span>📁</span>
            {project.title}
            <span className="text-sm text-gray-500">（個人）</span>
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
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow-sm text-sm transition"
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

      {/* このプロジェクトへの時間割り当て */}
      <section className="mb-6 bg-white/70 rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">
            このプロジェクトに割り当てる時間（週あたり）
          </h2>
          <p className="text-xs text-gray-500">
            「人生全体のキャパ」のうち、ここにどれだけ時間を使うかの目安です。
          </p>
          {project.allocatedHoursPerWeek !== undefined && (
            <p className="text-xs text-gray-500 mt-2">
              ルーティン合計:{" "}
              <span className="font-semibold">
                {totalRoutineHours.toFixed(1)} 時間 / 週
              </span>{" "}
              （このプロジェクトの割り当て{" "}
              {project.allocatedHoursPerWeek.toFixed(1)} 時間 / 週）
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            className="w-24 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            value={allocationInput}
            onChange={(e) => setAllocationInput(e.target.value)}
          />
          <span className="text-sm text-gray-600">時間 / 週</span>
          <button
            onClick={handleSaveAllocation}
            className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition"
          >
            保存
          </button>
        </div>
      </section>

      {/* 🔁 ルーティン（毎週やること） */}
      <section className="bg-white/70 rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800">
              🔁 ルーティン（毎週やること）
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              例：ブログなら週1執筆、ギターなら「基礎練30分」など。
            </p>
          </div>
          <button
            onClick={openNewRoutineModal}
            className="w-full sm:w-auto bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-3 py-2 rounded-full shadow-sm hover:opacity-90 text-sm whitespace-nowrap"
          >
            ＋ ルーティン追加
          </button>
        </div>

        {routines.length === 0 ? (
          <p className="text-gray-500 text-sm">
            まだルーティンが登録されていません。
            <br />
            「週に何をどれくらいやるか」をここに落とし込むと、行動に繋がりやすくなります。
          </p>
        ) : (
          <ul className="space-y-3">
            {routines.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              >
                {/* 左側：ルーティン名＋時間＋メモ */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 truncate">
                      {r.title}
                    </span>
                    <span className="text-xs text-gray-600 flex-shrink-0 whitespace-nowrap">
                      （{r.targetHoursPerWeek.toFixed(1)} 時間 / 週）
                    </span>
                  </div>
                  {r.memo && (
                    <p className="text-xs text-gray-500 mt-1 whitespace-pre-line break-words">
                      {r.memo}
                    </p>
                  )}
                </div>

                {/* 右側：操作ボタン（スマホでは下に来る） */}
                <div className="flex gap-2 text-xs self-end sm:self-auto">
                  <button
                    onClick={() => openEditRoutineModal(r)}
                    className="text-blue-500 hover:text-blue-700 whitespace-nowrap"
                  >
                    ✏️ 編集
                  </button>
                  <button
                    onClick={() => deleteRoutine(r.id)}
                    className="text-red-500 hover:text-red-700 whitespace-nowrap"
                  >
                    🗑 削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 🎯 Goals / Tasks */}
      <section className="bg-white/60 rounded-xl border border-gray-200 shadow-sm p-6 mb-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">🎯 中項目</h2>
          <button
            onClick={openGoalModal}
            className="w-full sm:w-auto bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-3 py-2 rounded-full shadow-sm hover:opacity-90 text-sm whitespace-nowrap"
          >
            ＋ 中項目追加
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
          <ul className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
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
                  className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden"
                >
                  {/* Goalヘッダー */}
                  <div className="flex justify-between items-start gap-3 px-4 py-3 border-b border-gray-200">
                    {/* 左側：タイトル＋期日＋プログレス */}
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-800 break-words">
                        {g.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        🗓 {g.deadline || "期日なし"}
                      </p>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF]"
                          style={{ width: `${goalProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {goalProgress}%（{doneTasks}/{totalTasks}）
                      </p>
                    </div>

                    {/* 右側：操作ボタン */}
                    <div className="flex gap-2 text-sm flex-shrink-0">
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
                  {/* タスク一覧 */}
                  <div className="w-full p-4 pl-6 space-y-2 border-l-4 border-[#4C9AFF]/40 bg-white">
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
                              className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-gray-50 px-3 py-2 rounded-md border ${
                                isOverdue
                                  ? "border-red-300 bg-red-50"
                                  : "border-gray-200"
                              }`}
                            >
                              {/* 左側：タスク情報 */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm break-words ${
                                    t.done
                                      ? "line-through text-gray-400"
                                      : isOverdue
                                      ? "text-red-600 font-semibold"
                                      : ""
                                  }`}
                                >
                                  {t.title}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500">
                                  <span>🗓 {t.deadline}</span>
                                  <span className="text-gray-600">
                                    👤 {t.assignee}
                                  </span>
                                </div>
                              </div>

                              {/* 右側：操作ボタン（スマホでは下に来る） */}
                              <div className="flex gap-2 text-xs self-end sm:self-auto">
                                <button
                                  onClick={() => {
                                    if (t.done) {
                                      toggleTask(g.id, t.id);
                                    } else {
                                      setCompletingTask({
                                        goalId: g.id,
                                        task: t,
                                      });
                                      setIsCompleteModalOpen(true);
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

      {/* ✅ タスク追加モーダル */}
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

              {editingTask && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    完了日
                  </label>
                  <input
                    type="date"
                    value={newTask.completedAt || ""}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        completedAt: e.target.value,
                      })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingTask(null);
                }}
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

                  const parentGoal = project.goals.find(
                    (g) => g.id === currentGoalId
                  );
                  if (!parentGoal) return;

                  const deadline = newTask.deadline || "期日なし";
                  const assignee = "自分"; // 個人PJなので固定

                  let updatedGoals;

                  if (editingTask) {
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
                                      newTask.completedAt || task.completedAt,
                                  }
                                : task
                            ),
                          }
                        : g
                    );
                  } else {
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
                                completedAt: "",
                              },
                            ],
                          }
                        : g
                    );
                  }

                  saveProject({ ...project, goals: updatedGoals });
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

      {/* ✅ タスク完了モーダル */}
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

      {/* ✅ ルーティン追加/編集モーダル */}
      {isRoutineModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              🔁 {editingRoutine ? "ルーティンを編集" : "ルーティンを追加"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={routineForm.title}
                  onChange={(e) =>
                    setRoutineForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="例：単語帳、ピアノ練習"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  目安時間（週あたり）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={routineForm.targetHoursPerWeek}
                    onChange={(e) =>
                      setRoutineForm((prev) => ({
                        ...prev,
                        targetHoursPerWeek: e.target.value,
                      }))
                    }
                    className="w-24 border rounded-md px-3 py-2"
                  />
                  <span className="text-sm text-gray-600">時間 / 週</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  メモ（任意）
                </label>
                <textarea
                  value={routineForm.memo}
                  onChange={(e) =>
                    setRoutineForm((prev) => ({
                      ...prev,
                      memo: e.target.value,
                    }))
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  rows={2}
                  placeholder="例：朝の通勤時間にやる、休日の午前中にまとめて、など"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsRoutineModalOpen(false);
                  setEditingRoutine(null);
                }}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={saveRoutine}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                {editingRoutine ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
