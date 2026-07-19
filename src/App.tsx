import React from "react";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans flex flex-col selection:bg-violet-500/20 selection:text-violet-700">
      {/* Sleek Modern Light Header */}
      <header className="bg-white border-b border-brand-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-xs rounded-none">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 text-white font-extrabold px-3 py-1.5 rounded-none text-xs tracking-wider uppercase">
            НейроШкЕТ
          </div>
          <div>
            <h1 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center gap-2">
              Панель Администратора
              <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-none font-bold">
                v3.3.0
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Управление пользователями, ИИ-стилями, кампаниями и лимитами Telegram-бота
            </p>
          </div>
        </div>

        {/* Live system health status badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-none shadow-xs">
          <span className="w-1.5 h-1.5 rounded-none bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider">ТГ-Сервер Активен</span>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white p-5">
        <div className="w-full h-full flex flex-col animate-fade-in">
          <AdminPanel />
        </div>
      </main>

      {/* Modern Footer */}
      <footer className="border-t border-brand-border bg-white px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2 shadow-xs rounded-none">
        <div className="flex gap-4">
          <span>СУБД: <span className="text-slate-600 font-semibold">JSON DB Engine</span></span>
          <span>Статус Бота: <span className="text-violet-600 font-semibold">Интегрирован</span></span>
        </div>
        <div>
          <span>© 2026 НейроШкЕТ. Все права защищены.</span>
        </div>
      </footer>
    </div>
  );
}
