"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";

// ===============================
// 型定義
// ===============================

interface Member {
  id: string; // uid
  nickname?: string; // ニックネーム（ヘッダーの表示名）
  name?: string; // 旧データ互換用
  avatarUrl?: string; // アイコンURL
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

  // 共有PJ用メタ情報
  ownerUid?: string;
  memberUids?: string[];
  memberEmails?: string[];
}

// ===============================
// コンポーネント
// ===============================
export default function SharedProjectDetail() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const user = useAuth(); // 🔑 ログインユーザー

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // 表示名（ヘッダーで選んでいるやつ = ニックネームに反映）
  const [currentDisplayName, setCurrentDisplayName] = useState("");

  // タスク/Goal関連
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

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", deadline: "" });

  // 共有PJ参加まわり
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isMember, setIsMember] = useState(false);

  // 共有リンク表示用
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // オーナー退出専用モーダル
  const [isOwnerLeaveModalOpen, setIsOwnerLeaveModalOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");

  // ===============================
  // ユーティリティ: Member の表示名を取得
  // ===============================
  const getMemberLabel = (m: Member) => m.nickname || m.name || "名無し";

  // ===============================
  // ヘッダーで設定した表示名を localStorage から取得
  // ===============================
  useEffect(() => {
    if (!user) return;

    try {
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem("appDisplayName")
          : null;

      const fallback = user.displayName || user.email || "匿名ユーザー";

      setCurrentDisplayName(stored || fallback);
    } catch (e) {
      console.error("表示名の取得に失敗しました:", e);
    }
  }, [user]);

  // ===============================
  // 共有PJ読み込み
  // ===============================
  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const ref = doc(db, "shareProjects", projectId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as Project;
          const normalized: Project = {
            id: snap.id,
            title: data.title || "",
            description: data.description || "",
            isPrivate: data.isPrivate ?? false,
            members: data.members ?? [],
            goals: data.goals ?? [],
            issues: data.issues ?? [],
            progress: data.progress ?? 0,
            deadline: data.deadline || "",
            ownerUid: data.ownerUid,
            memberUids: data.memberUids ?? [],
            memberEmails: data.memberEmails ?? [],
          };
          setProject(normalized);
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
  }, [projectId]);

  // ===============================
  // 表示名が変わったら、共有PJの自分の Member.nickname を同期
  // ===============================
  useEffect(() => {
    if (!project || !user || !currentDisplayName) return;

    const updatedMembers = (project.members ?? []).map((m) =>
      m.id === user.uid
        ? {
            ...m,
            nickname: currentDisplayName,
            // 旧データ互換用に name も更新しておく
            name: currentDisplayName,
          }
        : m
    );

    // 差分がないならスキップ
    if (JSON.stringify(updatedMembers) === JSON.stringify(project.members)) {
      return;
    }

    saveProject({ ...project, members: updatedMembers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDisplayName]);

  // 共有リンクを現在URLから生成
  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  // ログインユーザーがメンバーかどうか
  useEffect(() => {
    if (!project || !user) return;

    const alreadyMember = (project.members ?? []).some(
      (m) => m.id === user.uid
    );

    setIsMember(alreadyMember);

    if (!alreadyMember) {
      setIsJoinModalOpen(true);
    }
  }, [project, user]);

  const isOwner = useMemo(() => {
    if (!user || !project) return false;
    return project.ownerUid === user.uid;
  }, [user, project]);

  const otherMembers = useMemo(() => {
    if (!project || !user) return [];
    return (project.members ?? []).filter((m) => m.id !== user.uid);
  }, [project, user]);

  const canEdit = !!user && isMember;

  // ===============================
  // Firestoreへ保存（shareProjects/{id}）
  // ===============================
  const saveProject = async (updated: Project) => {
    if (!updated?.id) return;

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

    let cleaned = cleanObject(updated) as Project;

    // セーフティ: ownerUid がいるなら memberUids に必ず含める
    if (cleaned.ownerUid) {
      const current = cleaned.memberUids ?? [];
      if (!current.includes(cleaned.ownerUid)) {
        cleaned = {
          ...cleaned,
          memberUids: [...current, cleaned.ownerUid],
        };
      }
    }

    const updatedWithProgress: Project = {
      ...cleaned,
      progress: calculateProgress(cleaned),
    };

    try {
      const ref = doc(db, "shareProjects", updated.id);
      await updateDoc(ref, updatedWithProgress as any);
      setProject(updatedWithProgress);
      console.log("✅ shareProjects へ保存完了:", updated.title);
    } catch (e) {
      console.error("❌ shareProjects 更新エラー:", e);
      console.dir(updatedWithProgress);
      alert("共有プロジェクトの保存に失敗しました。");
    }
  };

  // 進捗率計算
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

  // Goal編集時、モーダルに反映
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

  const addTask = (goalId: string) => {
    setCurrentGoalId(goalId);
    setNewTask({ title: "", deadline: "", assignee: "", completedAt: "" });
    setIsModalOpen(true);
  };

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

  // ===============================
  // 共有PJから抜ける（入口）
  // ===============================
  const handleLeaveClick = async () => {
    if (!user || !project) return;

    // 非オーナー → そのまま抜ける処理
    if (!isOwner) {
      const ok = window.confirm(
        "この共有プロジェクトから抜けますか？\n\n・メンバー一覧からあなたが削除されます\n・あなたのプロジェクト一覧から、この共有PJのショートカットも削除されます"
      );
      if (!ok) return;
      await leaveAsMember(user.uid);
      return;
    }

    // オーナーの場合
    const remaining = otherMembers;
    // 自分だけの共有PJ → PJごと削除
    if (remaining.length === 0) {
      const ok = window.confirm(
        "あなたはこの共有プロジェクトの唯一のメンバーです。\n\nこの共有プロジェクトを完全に削除しますか？\n（あなたのダッシュボードからも削除されます）"
      );
      if (!ok) return;
      await deleteProjectAsOwner(user.uid);
      return;
    }

    // 他メンバーがいる → 新オーナー選択モーダルを表示
    setNewOwnerId(remaining[0].id); // デフォルトで先頭を選択
    setIsOwnerLeaveModalOpen(true);
  };

  // 非オーナーとして抜ける処理
  const leaveAsMember = async (uid: string) => {
    if (!user || !project) return;

    try {
      const updatedMembers = (project.members ?? []).filter(
        (m) => m.id !== uid
      );
      const updatedMemberUids = (project.memberUids ?? []).filter(
        (id) => id !== uid
      );
      const updatedMemberEmails = (project.memberEmails ?? []).filter(
        (email) => email !== (user.email || "")
      );

      const updatedProject: Project = {
        ...project,
        members: updatedMembers,
        memberUids: updatedMemberUids,
        memberEmails: updatedMemberEmails,
      };
      await saveProject(updatedProject);

      // 自分のショートカット削除
      const userProjectsRef = collection(db, "users", uid, "projects");
      const qSnap = await getDocs(
        query(userProjectsRef, where("sharedProjectId", "==", project.id))
      );
      const deletePromises = qSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      setIsMember(false);
      router.push("/projects");
    } catch (e) {
      console.error("共有PJからの退出時にエラー:", e);
      alert("共有プロジェクトからの退出に失敗しました。");
    }
  };

  // 自分だけの共有PJだった場合、PJごと削除
  const deleteProjectAsOwner = async (uid: string) => {
    if (!project) return;

    try {
      // shareProjects のドキュメント削除
      await deleteDoc(doc(db, "shareProjects", project.id));

      // 自分のショートカット削除（他メンバーいないので自分だけでOK）
      const userProjectsRef = collection(db, "users", uid, "projects");
      const qSnap = await getDocs(
        query(userProjectsRef, where("sharedProjectId", "==", project.id))
      );
      const deletePromises = qSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      router.push("/projects");
    } catch (e) {
      console.error("オーナーとしてPJ削除時にエラー:", e);
      alert("共有プロジェクトの削除に失敗しました。");
    }
  };

  // オーナー交代 + 自分は抜ける
  const handleConfirmOwnerChangeAndLeave = async () => {
    if (!user || !project) return;
    if (!newOwnerId) {
      alert("新しいオーナーを選択してください。");
      return;
    }

    const target = otherMembers.find((m) => m.id === newOwnerId);
    if (!target) {
      alert("選択したメンバーが見つかりません。");
      return;
    }

    const label = getMemberLabel(target);

    const ok = window.confirm(
      `オーナーを「${label}」さんに変更し、あなたはこの共有PJから抜けます。\n\nよろしいですか？`
    );
    if (!ok) return;

    try {
      // メンバーから自分を外す
      const updatedMembers = (project.members ?? []).filter(
        (m) => m.id !== user.uid
      );
      const updatedMemberUids = (project.memberUids ?? []).filter(
        (id) => id !== user.uid
      );
      const updatedMemberEmails = (project.memberEmails ?? []).filter(
        (email) => email !== (user.email || "")
      );

      const updatedProject: Project = {
        ...project,
        members: updatedMembers,
        memberUids: updatedMemberUids,
        memberEmails: updatedMemberEmails,
        ownerUid: newOwnerId,
      };

      await saveProject(updatedProject);

      // 自分のショートカット削除
      const userProjectsRef = collection(db, "users", user.uid, "projects");
      const qSnap = await getDocs(
        query(userProjectsRef, where("sharedProjectId", "==", project.id))
      );
      const deletePromises = qSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      setIsOwnerLeaveModalOpen(false);
      setIsMember(false);
      router.push("/projects");
    } catch (e) {
      console.error("オーナー交代 + 退出時にエラー:", e);
      alert("オーナー交代または退出に失敗しました。");
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("リンクをコピーしました。");
    } catch (e) {
      console.error("リンクコピーに失敗しました:", e);
      alert("リンクのコピーに失敗しました。手動でコピーしてください。");
    }
  };

  // ===============================
  // レンダリング分岐
  // ===============================

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B]">
        <p className="text-lg font-medium animate-pulse">読み込み中...</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">
            この共有プロジェクトはありません
          </h1>
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

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">ログインが必要です</h1>
          <p className="text-gray-600 text-sm mb-6">
            共有プロジェクトを閲覧・編集するには、ログインしてください。
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
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span>📁</span>
            {project.title}
            <span className="text-sm text-gray-500">（共有PJ）</span>
            {isOwner && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full ml-2">
                あなたがオーナー
              </span>
            )}
          </h1>
          {project.description && (
            <p className="text-sm text-gray-600 mt-1">{project.description}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* 📋 課題管理表へのリンク */}
          <button
            onClick={() => router.push(`/shared/${project.id}/issues`)}
            className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-4 py-2 rounded-full shadow-sm hover:opacity-90 text-sm transition"
          >
            📋 課題管理表
          </button>

          {canEdit && (
            <button
              onClick={handleLeaveClick}
              className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-md text-sm border border-red-200 transition"
            >
              共有PJから抜ける
            </button>
          )}
          <button
            onClick={() => router.push("/projects")}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm transition"
          >
            ← プロジェクト一覧へ
          </button>
        </div>
      </header>

      {/* 👥 メンバー */}
      <section className="bg-white/70 rounded-xl shadow-sm border border-gray-100 p-5 mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            👥 メンバー
          </h2>

          {canEdit && (
            <button
              onClick={() => setIsShareLinkModalOpen(true)}
              className="text-sm bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-3 py-1 rounded-full hover:opacity-90"
            >
              ＋ メンバー追加
            </button>
          )}
        </div>

        {project.members.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {project.members.map((m) => {
              const isThisOwner = project.ownerUid === m.id;
              const isYou = m.id === user.uid;
              const label = getMemberLabel(m);
              const initial = (label || "").slice(0, 1).toUpperCase() || "?";

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:shadow-md transition"
                >
                  {/* アイコン */}
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700">
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        className="w-full h-full object-cover"
                        alt={label}
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>

                  {/* ニックネーム */}
                  <span className="text-sm font-medium text-gray-800">
                    {label}
                  </span>

                  {isThisOwner && (
                    <span className="text-[10px] px-2 py-[1px] rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                      オーナー
                    </span>
                  )}
                  {isYou && (
                    <span className="text-[10px] px-2 py-[1px] rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      あなた
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            まだメンバーが登録されていません。
          </p>
        )}
      </section>

      {/* 🎯 Goals / Tasks */}
      <section className="bg-white/60 rounded-xl border border-gray-200 shadow-sm p-6 mb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            🎯 中項目（Goals）
          </h2>
          {canEdit && (
            <button
              onClick={openGoalModal}
              className="bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white px-4 py-2 rounded-full shadow-sm hover:opacity-90"
            >
              ＋ Goal追加
            </button>
          )}
        </div>

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
                  className="bg-gray-50 rounded-lg border border-gray-200"
                >
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
                    {canEdit && (
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
                    )}
                  </div>

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
                              {canEdit && (
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
                                      if (
                                        confirm("このタスクを削除しますか？")
                                      ) {
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
                              )}
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

      {/* 🔗 共有リンク案内モーダル */}
      {isShareLinkModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">
              メンバーを追加するにはリンクを共有してください
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              この共有プロジェクトに参加してほしい相手に、以下のリンクを送ってください。
              <br />
              受け取った人がログインしてページを開き、「参加して編集する」を押すとメンバーとして参加できます。
            </p>

            <div className="flex gap-2 items-center mb-4">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 border rounded-md px-3 py-2 text-sm bg-gray-50"
              />
              <button
                onClick={handleCopyShareUrl}
                className="px-3 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                コピー
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setIsShareLinkModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 共有参加モーダル */}
      {isJoinModalOpen && user && project && !isMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">
              この共有プロジェクトに参加しますか？
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              プロジェクト「
              <span className="font-semibold">{project.title}</span>
              」に参加すると、タスクやGoalの編集ができるようになります。
            </p>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={async () => {
                  if (!user || !project) return;

                  // users/{uid} からニックネーム & アイコンを取得
                  let userData: any = null;
                  try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    userData = userDoc.data();
                  } catch (e) {
                    console.error("users ドキュメント取得エラー:", e);
                  }

                  const nickname =
                    currentDisplayName ||
                    userData?.nickname ||
                    userData?.displayName ||
                    user.displayName ||
                    user.email ||
                    "匿名ユーザー";

                  const avatarUrl = userData?.photoURL || user.photoURL || "";

                  const newMember: Member = {
                    id: user.uid,
                    nickname,
                    name: nickname,
                    avatarUrl,
                  };

                  const newMemberUids = Array.from(
                    new Set([...(project.memberUids ?? []), user.uid])
                  );
                  const email = user.email || "";
                  const newMemberEmails =
                    email.length > 0
                      ? Array.from(
                          new Set([...(project.memberEmails ?? []), email])
                        )
                      : project.memberEmails ?? [];

                  const updatedProject: Project = {
                    ...project,
                    members: [...(project.members ?? []), newMember],
                    memberUids: newMemberUids,
                    memberEmails: newMemberEmails,
                  };
                  await saveProject(updatedProject);

                  // 自分のダッシュボード側にショートカットを作成
                  try {
                    const userProjectsRef = collection(
                      db,
                      "users",
                      user.uid,
                      "projects"
                    );

                    const q = query(
                      userProjectsRef,
                      where("sharedProjectId", "==", project.id)
                    );
                    const snap = await getDocs(q);

                    if (snap.empty) {
                      await addDoc(userProjectsRef, {
                        title: project.title,
                        description: project.description,
                        isPrivate: false,
                        goals: [],
                        progress: project.progress ?? 0,
                        deadline: project.deadline || "",
                        createdAt: serverTimestamp(),
                        isShared: true,
                        sharedProjectId: project.id,
                      });
                    }
                  } catch (err) {
                    console.error("共有PJショートカット作成中にエラー:", err);
                  }

                  setIsMember(true);
                  setIsJoinModalOpen(false);
                }}
                className="px-4 py-2 bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white rounded-md hover:opacity-90 text-sm"
              >
                参加して編集する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Goal追加モーダル */}
      {isGoalModalOpen && canEdit && (
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
      {isModalOpen && canEdit && (
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

              <div>
                <label className="block text-sm font-medium mb-1">担当者</label>
                <select
                  value={newTask.assignee}
                  onChange={(e) =>
                    setNewTask({ ...newTask, assignee: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                >
                  <option value="">選択してください</option>
                  {project.members.map((m) => {
                    const label = getMemberLabel(m);
                    return (
                      <option key={m.id} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
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
                  const assignee = newTask.assignee || "未設定";

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
      {isCompleteModalOpen && completingTask && canEdit && (
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

      {/* ✅ オーナー退出用モーダル（オーナー交代） */}
      {isOwnerLeaveModalOpen && isOwner && otherMembers.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">
              オーナーを変更して退出しますか？
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              あなたは現在この共有プロジェクトのオーナーです。
              <br />
              退出するためには、新しいオーナーを1人選んでください。
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                新しいオーナー
              </label>
              <select
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {otherMembers.map((m) => {
                  const label = getMemberLabel(m);
                  return (
                    <option key={m.id} value={m.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsOwnerLeaveModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmOwnerChangeAndLeave}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
              >
                オーナーを変更して退出
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
