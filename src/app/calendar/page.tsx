"use client";

import { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Link from "next/link";

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import type { User } from "firebase/auth";

interface Task {
  id: string;
  title: string;
  deadline: string;
  assignee?: string;
  done?: boolean;
}

interface Goal {
  id: string;
  title: string;
  tasks: Task[];
}

interface FirestoreProject {
  id: string;
  title: string;
  isPrivate?: boolean;
  deadline?: string; // ✅ 案件の締め切り
  goals?: Goal[];
}

type CalendarItemType = "task" | "project";

interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  deadline: string;
  projectId: string;
  projectTitle: string;
  assignee?: string;
  done?: boolean;
}

export default function CalendarPage() {
  const user = useAuth(); // 🔑 ログイン中ユーザー（undefined / null / User）

  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [itemsByDate, setItemsByDate] = useState<
    Record<string, CalendarItem[]>
  >({});

  // 日付フォーマット（YYYY-MM-DD）
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Firestoreから、ログインユーザーのprojectsを取得
  const loadProjects = async (user: User) => {
    const ref = collection(db, "users", user.uid, "projects");
    const snapshot = await getDocs(ref);

    const data = snapshot.docs.map((docSnap) => {
      const raw = docSnap.data() as any;
      return {
        id: docSnap.id,
        title: raw.title || "",
        isPrivate: raw.isPrivate ?? true,
        deadline: raw.deadline || "",
        goals: raw.goals ?? [],
      } as FirestoreProject;
    });

    setProjects(data);

    // 🔁 カレンダー用データに変換
    const map: Record<string, CalendarItem[]> = {};

    data.forEach((p) => {
      // 1) 案件の締め切り
      if (p.deadline && p.deadline !== "") {
        if (!map[p.deadline]) map[p.deadline] = [];
        map[p.deadline].push({
          id: `project-${p.id}`,
          type: "project",
          title: `📁 案件締め切り: ${p.title}`,
          deadline: p.deadline,
          projectId: p.id,
          projectTitle: p.title,
        });
      }

      // 2) タスクの締め切り（Goalの期日は無視）
      (p.goals ?? []).forEach((g) => {
        (g.tasks ?? []).forEach((t) => {
          if (!t.deadline || t.deadline === "期日なし") return;

          if (!map[t.deadline]) map[t.deadline] = [];
          map[t.deadline].push({
            id: `task-${t.id}`,
            type: "task",
            title: `✅ ${t.title}`,
            deadline: t.deadline,
            projectId: p.id,
            projectTitle: p.title,
            assignee: t.assignee,
            done: t.done,
          });
        });
      });
    });

    setItemsByDate(map);
  };

  // 認証状態を見て Firestore読み込み
  useEffect(() => {
    if (user === undefined) return; // 認証確認中

    if (user) {
      loadProjects(user);
    } else {
      setProjects([]);
      setItemsByDate({});
    }
  }, [user]);

  const onDateClick = (value: Date) => {
    setSelectedDate(value);
  };

  const selectedKey = selectedDate ? formatDate(selectedDate) : null;
  const selectedItems = selectedKey ? itemsByDate[selectedKey] || [] : [];

  // ============================
  // 認証状態ごとの画面
  // ============================
  if (user === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5]">
        <p className="text-gray-700 text-lg font-medium animate-pulse">
          認証情報を確認中です...
        </p>
      </main>
    );
  }

  if (user === null) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">ログインが必要です</h1>
          <p className="text-gray-600 text-sm mb-6">
            あなた専用のタスクカレンダーを表示するには、ログインしてください。
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

  // ============================
  // カレンダー画面
  // ============================
  return (
    <main
      className="
        min-h-screen 
        bg-gradient-to-br from-[#F8FAFC] to-[#ECFDF5] 
        text-[#1E293B]
        px-6 sm:px-10 lg:px-20 xl:px-28 py-10
        max-w-[1500px] mx-auto
      "
    >
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-10 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span>📅</span> タスク & 案件カレンダー
        </h1>
        <Link
          href="/projects"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md transition"
        >
          ← 案件一覧に戻る
        </Link>
      </div>

      {/* カレンダー＋リスト */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* 左：カレンダー */}
        <div className="bg-white/80 border border-gray-100 p-6 rounded-xl shadow-sm w-full lg:w-1/2">
          <Calendar
            onClickDay={onDateClick}
            locale="ja-JP"
            className="w-full border-0 text-sm rounded-lg"
            tileContent={({ date }) => {
              const dateStr = formatDate(date);
              const items = itemsByDate[dateStr];
              if (items && items.length > 0) {
                const projectCount = items.filter(
                  (i) => i.type === "project"
                ).length;
                const taskCount = items.filter((i) => i.type === "task").length;

                return (
                  <div className="mt-1 text-[10px] leading-tight">
                    {projectCount > 0 && (
                      <div className="text-[#F97316] font-semibold">
                        案{projectCount}
                      </div>
                    )}
                    {taskCount > 0 && (
                      <div className="text-[#4C9AFF] font-semibold">
                        タ{taskCount}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
        </div>

        {/* 右：予定リスト */}
        <div className="flex-1 bg-white/80 border border-gray-100 p-6 rounded-xl shadow-sm overflow-y-auto max-h-[600px]">
          {selectedDate ? (
            <>
              <h2 className="text-lg font-semibold mb-3">
                {formatDate(selectedDate)} の予定
              </h2>
              {selectedItems.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  この日に締め切りのタスク・案件はありません。
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedItems.map((item) => (
                    <li
                      key={item.id}
                      className={`
                        border rounded-md px-3 py-2 transition flex flex-col gap-1
                        ${
                          item.type === "project"
                            ? "bg-orange-50 border-orange-200"
                            : item.done
                            ? "bg-green-50 border-green-200 line-through text-gray-500"
                            : "bg-gray-50 border-gray-200 hover:bg-[#F1FAFE]"
                        }
                      `}
                    >
                      {/* ラベル */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`
                            inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium
                            ${
                              item.type === "project"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            }
                          `}
                        >
                          {item.type === "project" ? "案件" : "タスク"}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {item.projectTitle}
                        </span>
                      </div>

                      {/* タイトル */}
                      <div className="text-sm font-medium">{item.title}</div>

                      {/* 担当者（タスクのみ） */}
                      {item.type === "task" && item.assignee && (
                        <div className="text-xs text-gray-600">
                          👤 {item.assignee}
                        </div>
                      )}

                      {/* 案件リンク */}
                      <div className="text-right mt-1">
                        <Link
                          href={`/projects/${item.projectId}`}
                          className="text-[11px] text-blue-600 hover:underline"
                        >
                          案件を開く →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              カレンダーの日付をクリックすると、その日のタスク・案件の締め切りが表示されます。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
