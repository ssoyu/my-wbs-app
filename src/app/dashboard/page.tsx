"use client";

import { useState, useEffect } from "react";

/**
 * ダッシュボード（MVP版）
 * - ローカルストレージにタスク・課題を保存
 * - 画面上にWBS進捗バー・タスク・課題を表示
 */
export default function Dashboard() {
  // -----------------------------
  // ステート（状態管理）
  // -----------------------------
  const [tasks, setTasks] = useState<
    { title: string; status: string; deadline: string }[]
  >([]);
  const [issues, setIssues] = useState<
    { title: string; assignee: string; status: string }[]
  >([]);
  const [progress, setProgress] = useState({ design: 70, dev: 40, test: 10 });

  // -----------------------------
  // ローカルストレージから読み込み
  // -----------------------------
  useEffect(() => {
    const savedTasks = localStorage.getItem("tasks");
    const savedIssues = localStorage.getItem("issues");
    if (savedTasks) setTasks(JSON.parse(savedTasks));
    if (savedIssues) setIssues(JSON.parse(savedIssues));
  }, []);

  // -----------------------------
  // ローカルストレージに保存
  // -----------------------------
  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
    localStorage.setItem("issues", JSON.stringify(issues));
  }, [tasks, issues]);

  // -----------------------------
  // 新規追加ボタン
  // -----------------------------
  const addTask = () => {
    const title = prompt("新しいタスク名を入力してください:");
    if (title)
      setTasks([...tasks, { title, status: "進行中", deadline: "未設定" }]);
  };

  const addIssue = () => {
    const title = prompt("新しい課題名を入力してください:");
    if (title)
      setIssues([...issues, { title, assignee: "自分", status: "未対応" }]);
  };

  // -----------------------------
  // JSX（UI部分）
  // -----------------------------
  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900">
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">📊 ダッシュボード</h1>
        <button
          onClick={addTask}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
        >
          ＋ タスク追加
        </button>
      </div>

      {/* WBS進捗 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">WBS進捗</h2>
        <div className="space-y-3">
          <ProgressBar label="設計" value={progress.design} />
          <ProgressBar label="開発" value={progress.dev} />
          <ProgressBar label="テスト" value={progress.test} />
        </div>
      </section>

      {/* タスク一覧 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">タスク一覧</h2>
        <table className="w-full border border-gray-200 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-3 text-left">タイトル</th>
              <th className="py-2 px-3 text-left">ステータス</th>
              <th className="py-2 px-3 text-left">期限</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className="py-2 px-3">{t.title}</td>
                <td className="py-2 px-3">{t.status}</td>
                <td className="py-2 px-3">{t.deadline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 課題一覧 */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">課題一覧</h2>
          <button
            onClick={addIssue}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md"
          >
            ＋ 課題追加
          </button>
        </div>
        <table className="w-full border border-gray-200 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-3 text-left">タイトル</th>
              <th className="py-2 px-3 text-left">担当者</th>
              <th className="py-2 px-3 text-left">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i, idx) => (
              <tr key={idx} className="border-t border-gray-200">
                <td className="py-2 px-3">{i.title}</td>
                <td className="py-2 px-3">{i.assignee}</td>
                <td className="py-2 px-3">{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

/**
 * 進捗バー（簡易版）
 */
function ProgressBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="mb-1 font-medium">{label}</p>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
