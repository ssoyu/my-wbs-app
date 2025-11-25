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
  getDoc,
  setDoc, // 🆕 追加
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import type { User } from "firebase/auth";

interface Project {
  id: string;
  title: string;
  description: string;
  isPrivate: boolean;
  goals: any[];
  progress: number;
  deadline?: string;
  createdAt?: any;

  // 共有関連（ショートカット管理用）
  isShared?: boolean; // 共有プロジェクトかどうか
  sharedProjectId?: string; // shareProjects 側の ID
  ownerUid?: string; // 共有PJのオーナー（作成者）

  // 🆕 このプロジェクトに週あたりどれだけ時間を割くか（目安）
  allocatedHoursPerWeek?: number;
}

export default function Projects() {
  const user = useAuth(); // 🔑 認証状態
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
    isShared: false,
    sharedProjectId: undefined,
    ownerUid: undefined,
    allocatedHoursPerWeek: 0,
  });

  // 🆕 週あたり自分が使える時間（Firestore に保存する値）
  const [weeklyCapacity, setWeeklyCapacity] = useState<number>(20);
  // 入力用（文字列） state
  const [weeklyCapacityInput, setWeeklyCapacityInput] = useState<string>("20");
  const [isCapacitySaving, setIsCapacitySaving] = useState(false);

  // 共有リンク用に origin を確保
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // ===============================
  // 🔽 週あたりのキャパシティを Firestore から読み込む
  //   users/{uid}/settings/dashboardCapacity というドキュメントに保存する想定
  // ===============================
  const loadWeeklyCapacity = async (user: User) => {
    try {
      const settingsRef = doc(
        db,
        "users",
        user.uid,
        "settings",
        "dashboardCapacity"
      );
      const snap = await getDoc(settingsRef);

      if (snap.exists()) {
        const data = snap.data() as { weeklyCapacity?: number };
        const cap =
          typeof data.weeklyCapacity === "number" ? data.weeklyCapacity : 20;
        setWeeklyCapacity(cap);
        setWeeklyCapacityInput(String(cap));
      } else {
        // ドキュメントがない場合はデフォルト 20h
        setWeeklyCapacity(20);
        setWeeklyCapacityInput("20");
      }
    } catch (e) {
      console.error("weeklyCapacity の読み込みに失敗:", e);
      // 失敗した場合も一応 20 にしておく
      setWeeklyCapacity(20);
      setWeeklyCapacityInput("20");
    }
  };

  // ===============================
  // 🔽 weeklyCapacity を Firestore に保存
  // ===============================
  const saveWeeklyCapacity = async () => {
    if (!user) {
      alert("ログインが切れています。再度ログインしてください。");
      return;
    }

    const num = Number(weeklyCapacityInput);
    const safe = isNaN(num) || num <= 0 ? 1 : num; // 0 以下はとりあえず 1 に補正

    try {
      setIsCapacitySaving(true);
      const settingsRef = doc(
        db,
        "users",
        user.uid,
        "settings",
        "dashboardCapacity"
      );
      await setDoc(settingsRef, { weeklyCapacity: safe }, { merge: true });

      setWeeklyCapacity(safe);
      setWeeklyCapacityInput(String(safe));
    } catch (e) {
      console.error("weeklyCapacity の保存に失敗:", e);
      alert("週に使える時間の保存に失敗しました。");
    } finally {
      setIsCapacitySaving(false);
    }
  };

  // ===============================
  // 🔽 ログインユーザーのプロジェクト一覧を取得
  //   users/{uid}/projects のみをソースにする
  //   ＋ 共有PJの場合は shareProjects 側の ownerUid を上書き
  // ===============================
  const loadProjects = async (user: User) => {
    setIsLoading(true);

    const ref = collection(db, "users", user.uid, "projects");
    const snap = await getDocs(ref);

    // まずは users/{uid}/projects の情報をそのまま読み込む
    const baseList: Project[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Omit<Project, "id">;
      return {
        id: docSnap.id,
        title: data.title || "",
        description: data.description || "",
        isPrivate: data.isPrivate ?? true,
        goals: data.goals ?? [],
        progress: data.progress ?? 0,
        deadline: data.deadline || "",
        createdAt: data.createdAt,
        isShared: data.isShared ?? false,
        sharedProjectId: data.sharedProjectId,
        ownerUid: data.ownerUid,
        allocatedHoursPerWeek: data.allocatedHoursPerWeek ?? 0,
      };
    });

    // 共有PJの sharedProjectId 一覧を抽出
    const sharedIds = baseList
      .filter((p) => p.isShared && p.sharedProjectId)
      .map((p) => p.sharedProjectId as string);

    // shareProjects 側から ownerUid を取得してマージする
    const ownerMap: Record<string, string | undefined> = {};

    if (sharedIds.length > 0) {
      await Promise.all(
        sharedIds.map(async (sharedId) => {
          try {
            const sharedRef = doc(db, "shareProjects", sharedId);
            const sharedSnap = await getDoc(sharedRef);
            if (sharedSnap.exists()) {
              const sharedData = sharedSnap.data() as { ownerUid?: string };
              ownerMap[sharedId] = sharedData.ownerUid;
            } else {
              ownerMap[sharedId] = undefined;
            }
          } catch (e) {
            console.error("shareProjects 読み込みエラー:", e);
            ownerMap[sharedId] = undefined;
          }
        })
      );
    }

    // ownerMap の情報で ownerUid を上書き
    const mergedList: Project[] = baseList.map((p) => {
      if (p.isShared && p.sharedProjectId) {
        const latestOwner = ownerMap[p.sharedProjectId];
        if (latestOwner) {
          return { ...p, ownerUid: latestOwner };
        }
      }
      return p;
    });

    // createdAt でソート（新しい順）
    setProjects(
      mergedList.sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds || 0;
        const bTime = (b.createdAt as any)?.seconds || 0;
        return bTime - aTime;
      })
    );

    setIsLoading(false);
  };

  useEffect(() => {
    if (!user || user === null) return;
    loadProjects(user);
    loadWeeklyCapacity(user); // 🆕 キャパも一緒にロード
  }, [user]);

  const openModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setNewProject({
        ...project,
        // 編集モーダル上では isPrivate が「公開範囲」のラジオボタンに対応
        // 共有PJ編集中は公開範囲は変更不可（後で無効化）
        isPrivate: !project.isShared,
        allocatedHoursPerWeek: project.allocatedHoursPerWeek ?? 0,
      });
    } else {
      setEditingProject(null);
      setNewProject({
        id: "",
        title: "",
        description: "",
        isPrivate: true, // デフォルト：個人
        goals: [],
        progress: 0,
        deadline: "",
        isShared: false,
        sharedProjectId: undefined,
        ownerUid: user?.uid,
        allocatedHoursPerWeek: 0,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const isSharedEditing = !!editingProject?.isShared;

  // ===============================
  // 📝 プロジェクト保存
  //   - 新規: 個人 / 共有 を分岐
  //   - 編集: users/{uid}/projects を更新
  //          共有PJなら shareProjects 側も更新
  // ===============================
  const saveProject = async () => {
    if (!newProject.title.trim()) {
      alert("案件タイトルは必須です。");
      return;
    }
    if (!user) {
      alert("ログインが切れています。再度ログインしてください。");
      return;
    }

    try {
      if (editingProject) {
        // ==========================
        // 既存プロジェクトの編集
        // ==========================
        const projectRef = doc(
          db,
          "users",
          user.uid,
          "projects",
          editingProject.id
        );

        // 自分のカード情報を更新
        await updateDoc(projectRef, {
          title: newProject.title,
          description: newProject.description,
          // 共有PJは isPrivate: false 固定
          isPrivate: editingProject.isShared ? false : newProject.isPrivate,
          deadline: newProject.deadline,
          allocatedHoursPerWeek: newProject.allocatedHoursPerWeek ?? 0,
        });

        // 共有PJだった場合は、shareProjects 側も更新する
        if (editingProject.isShared && editingProject.sharedProjectId) {
          const sharedRef = doc(
            db,
            "shareProjects",
            editingProject.sharedProjectId
          );
          await updateDoc(sharedRef, {
            title: newProject.title,
            description: newProject.description,
            deadline: newProject.deadline,
            allocatedHoursPerWeek: newProject.allocatedHoursPerWeek ?? 0,
          });
        }
      } else {
        // ==========================
        // 新規プロジェクト作成
        // ==========================
        if (newProject.isPrivate) {
          // 🔒 個人プロジェクト → users/{uid}/projects に作成
          const projectsRef = collection(db, "users", user.uid, "projects");
          await addDoc(projectsRef, {
            title: newProject.title,
            description: newProject.description,
            isPrivate: true,
            isShared: false,
            goals: [],
            progress: 0,
            deadline: newProject.deadline,
            createdAt: serverTimestamp(),
            allocatedHoursPerWeek: newProject.allocatedHoursPerWeek ?? 0,
          });
        } else {
          // 👥 共有プロジェクト
          // 1) shareProjects に本体を作成（自分が ownerUid）
          const sharedRef = collection(db, "shareProjects");
          const sharedDoc = await addDoc(sharedRef, {
            title: newProject.title,
            description: newProject.description,
            isPrivate: false,
            ownerUid: user.uid,
            memberUids: [user.uid],
            memberEmails: [user.email],
            goals: [],
            issues: [],
            progress: 0,
            deadline: newProject.deadline,
            createdAt: serverTimestamp(),
            allocatedHoursPerWeek: newProject.allocatedHoursPerWeek ?? 0,
          });

          // 2) 自分の users/{uid}/projects にショートカットを作成
          const userProjectsRef = collection(db, "users", user.uid, "projects");
          await addDoc(userProjectsRef, {
            title: newProject.title,
            description: newProject.description,
            isPrivate: false,
            isShared: true,
            sharedProjectId: sharedDoc.id,
            ownerUid: user.uid,
            goals: [],
            progress: 0,
            deadline: newProject.deadline,
            createdAt: serverTimestamp(),
            allocatedHoursPerWeek: newProject.allocatedHoursPerWeek ?? 0,
          });
        }
      }

      setIsModalOpen(false);
      await loadProjects(user);
    } catch (e) {
      console.error("Firestore保存中にエラー:", e);
      alert("保存に失敗しました。");
    }
  };

  // ===============================
  // 🗑 削除
  //   - 個人PJ: そのまま削除
  //   - 共有PJ & オーナー: 本体 + 自分のショートカットを削除
  //   - 共有PJ & メンバー: 自分のショートカットのみ削除
  // ===============================
  const deleteProjectHandler = async (project: Project) => {
    if (!user) {
      alert("ログインが切れています。再度ログインしてください。");
      return;
    }

    const isShared = !!project.isShared && !!project.sharedProjectId;
    const isOwner = isShared && project.ownerUid === user.uid;

    let message = "";

    if (!isShared) {
      message = "本当に削除しますか？";
    } else if (isOwner) {
      message =
        "この共有プロジェクトを完全に削除しますか？\n\n・共有プロジェクト本体（タスク等を含む）\n・あなた自身の一覧上のカード\nが削除されます。\n\n他のメンバーの一覧にはカードが残る可能性がありますが、詳細画面は開けなくなります。";
    } else {
      message =
        "この共有プロジェクトをあなたの一覧から削除しますか？\n\n※ 共有プロジェクト本体や他のメンバーの一覧には影響しません。";
    }

    if (!confirm(message)) return;

    try {
      if (!isShared) {
        // 個人PJ
        await deleteDoc(doc(db, "users", user.uid, "projects", project.id));
      } else if (isOwner && project.sharedProjectId) {
        // 共有PJのオーナー → 本体 + 自分のショートカットを削除
        await deleteDoc(doc(db, "shareProjects", project.sharedProjectId));
        await deleteDoc(doc(db, "users", user.uid, "projects", project.id));
      } else {
        // 共有PJのメンバー → 自分のショートカットだけ削除
        await deleteDoc(doc(db, "users", user.uid, "projects", project.id));
      }

      await loadProjects(user);
    } catch (e) {
      console.error("削除に失敗:", e);
      alert("削除に失敗しました。");
    }
  };

  // 🧮 リソース配分の集計
  const totalAllocated = projects.reduce(
    (sum, p) => sum + (p.allocatedHoursPerWeek || 0),
    0
  );
  const utilization =
    weeklyCapacity > 0 ? Math.min(totalAllocated / weeklyCapacity, 2) : 0;

  // 🔄 認証状態を確認中
  if (user === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>読み込み中...</p>
      </main>
    );
  }

  // 🔐 未ログインの場合：ログインを促す
  if (user === null) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-md text-center">
          <h1 className="text-xl font-bold mb-4">ログインが必要です</h1>
          <p className="text-gray-600 mb-4 text-sm">
            あなた専用のプロジェクトを表示するには、ログインしてください。
          </p>
          <Link
            href="/login"
            className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            ログイン画面へ
          </Link>
        </div>
      </main>
    );
  }

  // ログイン済みの場合
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] text-[#1E293B] p-6 md:p-10">
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

      {/* 🆕 リソース配分（時間キャパ）のパネル */}
      <section className="mb-10 max-w-3xl mx-auto bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          今週のリソース配分
        </h2>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">
              1週間で使える時間（目安）
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="w-24 border border-gray-300 rounded-md px-2 py-1 text-sm"
                value={weeklyCapacityInput}
                onChange={(e) => setWeeklyCapacityInput(e.target.value)}
              />
              <span className="text-sm text-gray-600">時間 / 週</span>
              <button
                onClick={saveWeeklyCapacity}
                disabled={isCapacitySaving}
                className="px-3 py-1.5 text-xs rounded-full bg-gradient-to-r from-[#4CD4B0] to-[#4C9AFF] text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCapacitySaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            <p>
              割り当て合計：{" "}
              <span className="font-semibold">
                {totalAllocated.toFixed(1)} 時間 / {weeklyCapacity} 時間
              </span>
            </p>
            <p className="text-xs text-gray-500">
              使用率：
              {weeklyCapacity > 0
                ? Math.round((totalAllocated / weeklyCapacity) * 100)
                : 0}
              %
            </p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              utilization <= 0.8
                ? "bg-[#4CD4B0]"
                : utilization <= 1
                ? "bg-[#4C9AFF]"
                : "bg-[#FB7185]"
            }`}
            style={{ width: `${Math.min(utilization * 100, 200)}%` }}
          />
        </div>

        <p className="text-[11px] text-gray-500 mt-1">
          80% くらいまでがちょうど良い負荷。100%超えは少し詰め込み気味です。
        </p>
      </section>

      {/* 案件一覧 */}
      {isLoading ? (
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
          {projects.map((p) => {
            const isShared = !!p.isShared && !!p.sharedProjectId;
            const isOwner = isShared && p.ownerUid === user.uid;

            const shareUrl =
              isShared && origin && p.sharedProjectId
                ? `${origin}/shared/${p.sharedProjectId}`
                : "";

            // 共有PJなら shared/[id] に遷移、それ以外は projects/[id]
            const detailPath =
              isShared && p.sharedProjectId
                ? `/shared/${p.sharedProjectId}`
                : `/projects/${p.id}`;

            return (
              <div
                key={p.id}
                className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      {isShared && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          共有{isOwner && "（オーナー）"}
                        </span>
                      )}
                      {p.title}
                    </h2>
                    <div className="flex gap-3">
                      <button
                        onClick={() => openModal(p)}
                        className="text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-full p-1 transition"
                        title="編集"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteProjectHandler(p)}
                        className="text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full p-1 transition"
                        title={
                          !isShared
                            ? "削除"
                            : isOwner
                            ? "共有プロジェクトを完全に削除"
                            : "一覧から削除"
                        }
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
                    <span>
                      {isShared
                        ? isOwner
                          ? "👥 共有（オーナー）"
                          : "👥 共有"
                        : "🔒 個人"}
                    </span>
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

                  {typeof p.allocatedHoursPerWeek === "number" && (
                    <p className="text-xs text-gray-500">
                      割り当て: {p.allocatedHoursPerWeek} 時間 / 週
                    </p>
                  )}

                  {/* 👥 共有PJ用：共有リンクコピー */}
                  {isShared && shareUrl && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          alert("共有リンクをコピーしました");
                        } catch {
                          alert(`共有リンク: ${shareUrl}`);
                        }
                      }}
                      className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline"
                    >
                      共有リンクをコピー
                    </button>
                  )}
                </div>

                <Link
                  href={detailPath}
                  className="mt-4 inline-block text-[#4C9AFF] hover:text-[#2C7DF0] text-sm font-medium transition"
                >
                  詳細を見る →
                </Link>
              </div>
            );
          })}
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
                        setNewProject({
                          ...newProject,
                          isPrivate: true,
                          isShared: false,
                          sharedProjectId: undefined,
                        })
                      }
                      disabled={isSharedEditing}
                    />
                    🔒 個人
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="isPrivate"
                      checked={!newProject.isPrivate}
                      onChange={() =>
                        setNewProject({
                          ...newProject,
                          isPrivate: false,
                          isShared: true,
                          ownerUid: user.uid,
                        })
                      }
                      disabled={isSharedEditing}
                    />
                    👥 共有
                  </label>
                </div>
                {isSharedEditing && (
                  <p className="text-xs text-gray-500 mt-1">
                    共有プロジェクトの公開範囲は変更できません。
                  </p>
                )}
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

              {/* 🆕 このプロジェクトに割り当てる時間 */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  このプロジェクトに割り当てる時間（週あたり）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={newProject.allocatedHoursPerWeek ?? 0}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        allocatedHoursPerWeek: Number(e.target.value) || 0,
                      })
                    }
                    className="w-24 border border-gray-300 rounded-md px-3 py-2 focus:ring focus:ring-blue-100 text-sm"
                    placeholder="例：5"
                  />
                  <span className="text-sm text-gray-600">時間 / 週</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  「ブログに5時間 / アプリ開発に8時間」など、ざっくりでOKです。
                </p>
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
