"use client";

import { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Link from "next/link";

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

interface Project {
  id: string;
  title: string;
  isPrivate: boolean;
  goals: Goal[];
}

export default function CalendarPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});

  useEffect(() => {
    const saved = localStorage.getItem("projects");
    if (saved) {
      const parsed = JSON.parse(saved) as Project[];
      setProjects(parsed);

      const tasksMap: Record<string, Task[]> = {};
      parsed.forEach((p) => {
        p.goals.forEach((g) => {
          g.tasks.forEach((t) => {
            if (t.deadline && t.deadline !== "期日なし") {
              if (!tasksMap[t.deadline]) tasksMap[t.deadline] = [];
              tasksMap[t.deadline].push({
                ...t,
                title: `[${p.title}] ${t.title}`,
              });
            }
          });
        });
      });
      setTasksByDate(tasksMap);
    }
  }, []);

  const onDateClick = (value: Date) => {
    setSelectedDate(value);
  };

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const selectedKey = selectedDate ? formatDate(selectedDate) : null;
  const selectedTasks = selectedKey ? tasksByDate[selectedKey] || [] : [];

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
          <span>📅</span> タスクカレンダー
        </h1>
        <Link
          href="/projects"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md transition"
        >
          ← 案件一覧に戻る
        </Link>
      </div>

      {/* カレンダー＋タスクリスト */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* 左：カレンダー */}
        <div className="bg-white/80 border border-gray-100 p-6 rounded-xl shadow-sm w-full lg:w-1/2">
          <Calendar
            onClickDay={onDateClick}
            locale="ja-JP"
            className="w-full border-0 text-sm rounded-lg"
            tileContent={({ date }) => {
              const dateStr = formatDate(date);
              const tasks = tasksByDate[dateStr];
              if (tasks && tasks.length > 0) {
                return (
                  <div className="mt-1 text-xs text-[#4C9AFF] font-semibold">
                    ● {tasks.length}
                  </div>
                );
              }
              return null;
            }}
          />
        </div>

        {/* 右：タスクリスト */}
        <div className="flex-1 bg-white/80 border border-gray-100 p-6 rounded-xl shadow-sm overflow-y-auto max-h-[600px]">
          {selectedDate ? (
            <>
              <h2 className="text-lg font-semibold mb-3">
                {formatDate(selectedDate)} のタスク一覧
              </h2>
              {selectedTasks.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  この日に期日設定されたタスクはありません。
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedTasks.map((t) => (
                    <li
                      key={t.id}
                      className={`border rounded-md px-3 py-2 transition ${
                        t.done
                          ? "bg-green-50 border-green-200 line-through text-gray-500"
                          : "bg-gray-50 border-gray-200 hover:bg-[#F1FAFE]"
                      }`}
                    >
                      <div className="text-sm font-medium">{t.title}</div>
                      {t.assignee && (
                        <div className="text-xs text-gray-600">
                          👤 {t.assignee}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              カレンダーの日付をクリックすると、その日のタスクが表示されます。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
