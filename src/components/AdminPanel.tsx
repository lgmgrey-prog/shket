import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Users,
  Settings,
  Sparkles,
  Megaphone,
  Database,
  Search,
  Plus,
  Trash2,
  Edit,
  Play,
  Square,
  Activity,
  ArrowRight,
  UserCheck,
  UserX,
  Download,
  AlertCircle,
  TrendingUp,
  Coins,
  Cpu,
  RefreshCw,
  FolderPlus,
  Calendar,
  Lock,
  Globe,
  Bell,
  CheckCircle,
  Eye,
  CreditCard,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { DbUser, DbStyle, DbAd, DbCampaign, DbPayment, DbBroadcast, DbSettings, SystemStats, AdminStats, SystemLog } from "../types";

interface AdminPanelProps {
  activityTick?: number; // Increment triggers dashboard refresh
}

export default function AdminPanel({ activityTick = 0 }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "styles" | "ads" | "broadcasts" | "system" | "logs">("stats");

  // Admin Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [styles, setStyles] = useState<DbStyle[]>([]);
  const [ads, setAds] = useState<DbAd[]>([]);
  const [campaigns, setCampaigns] = useState<DbCampaign[]>([]);
  const [payments, setPayments] = useState<DbPayment[]>([]);
  const [broadcasts, setBroadcasts] = useState<DbBroadcast[]>([]);
  const [settings, setSettings] = useState<DbSettings | null>(null);
  const [system, setSystem] = useState<SystemStats | null>(null);

  // System Logs states
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logsFilter, setLogsFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [logsSearch, setLogsSearch] = useState("");
  const [logsCategory, setLogsCategory] = useState<"all" | "bot" | "webhook" | "system" | "api" | "gemini">("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Search & Filter state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);

  // Style form state
  const [styleForm, setStyleForm] = useState({ id: "", name: "", description: "", prompt: "" });
  const [styleEditMode, setStyleEditMode] = useState(false);

  // Ad form state
  const [adForm, setAdForm] = useState({ id: "", text: "", url: "", position: "mid" as "start" | "mid" | "gdz" | "pin", isActive: true });
  const [adEditMode, setAdEditMode] = useState(false);

  // Campaign form state
  const [campaignFormId, setCampaignFormId] = useState("");
  const [campaignError, setCampaignError] = useState("");

  // Broadcast newsletter form state
  const [broadcastForm, setBroadcastForm] = useState({ 
    text: "", 
    mediaUrl: "", 
    buttonText: "", 
    buttonUrl: "",
    buttonStyle: "default",
    buttonEmoji: "🔗"
  });
  const [broadPreview, setBroadPreview] = useState(false);

  // Subscription purchases filter period
  const [paymentPeriod, setPaymentPeriod] = useState<"day" | "week" | "month">("month");

  // Real Telegram Bot integration states
  const [tgBotTokenForm, setTgBotTokenForm] = useState("");
  const [tgBotStatus, setTgBotStatus] = useState<{
    isConnected: boolean;
    botUsername?: string;
    webhookUrl?: string;
    error?: string;
    telegramWebhookInfo?: any;
  } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [tgBotError, setTgBotError] = useState("");

  // In-app Notification toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // In-app Stateful Confirmation States
  const [isDisconnectConfirming, setIsDisconnectConfirming] = useState(false);
  const [styleToDeleteConfirmId, setStyleToDeleteConfirmId] = useState<string | null>(null);
  const [adToDeleteConfirmId, setAdToDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, [activeTab, activityTick]);

  useEffect(() => {
    let interval: any = null;
    if (activeTab === "logs") {
      fetchLogs();
      interval = setInterval(() => {
        fetchLogs();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/admin/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/admin/logs/clear", { method: "POST" });
      if (res.ok) {
        showToast("Системные логи успешно очищены!", "success");
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed to clear logs:", err);
      showToast("Ошибка при очистке логов", "error");
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAdminData = async () => {
    try {
      const statsRes = await fetch("/api/admin/stats");
      const statsData = await statsRes.json();
      setStats(statsData);

      const usersRes = await fetch("/api/admin/users");
      const usersData = await usersRes.json();
      setUsers(usersData);

      const stylesRes = await fetch("/api/admin/styles");
      const stylesData = await stylesRes.json();
      setStyles(stylesData);

      const adsRes = await fetch("/api/admin/ads");
      const adsData = await adsRes.json();
      setAds(adsData);

      const campaignsRes = await fetch("/api/admin/campaigns");
      const campaignsData = await campaignsRes.json();
      setCampaigns(campaignsData);

      const paymentsRes = await fetch("/api/admin/payments");
      const paymentsData = await paymentsRes.json();
      setPayments(paymentsData);

      const broadRes = await fetch("/api/admin/broadcasts");
      const broadData = await broadRes.json();
      setBroadcasts(broadData);

      const setRes = await fetch("/api/admin/settings");
      const setData = await setRes.json();
      setSettings(setData);

      const sysRes = await fetch("/api/admin/system");
      const sysData = await sysRes.json();
      setSystem(sysData);

      // Load Telegram Bot connection status
      const botStatusRes = await fetch("/api/admin/tg-bot/status");
      const botStatusData = await botStatusRes.json();
      setTgBotStatus(botStatusData);
    } catch (e) {
      console.error("Failed to load admin panel data", e);
    }
  };

  const handleConnectBot = async () => {
    if (!tgBotTokenForm) return;
    setIsConnecting(true);
    setTgBotError("");
    try {
      const res = await fetch("/api/admin/tg-bot/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tgBotTokenForm }),
      });
      const data = await res.json();
      if (data.error) {
        setTgBotError(data.error);
        showToast(data.error, "error");
      } else {
        setTgBotStatus({
          isConnected: true,
          botUsername: data.botUsername,
          webhookUrl: data.webhookUrl,
        });
        setTgBotTokenForm("");
        showToast("Телеграм-бот успешно подключен!", "success");
        // Reload admin settings
        const setRes = await fetch("/api/admin/settings");
        const setData = await setRes.json();
        setSettings(setData);
      }
    } catch (err: any) {
      setTgBotError("Не удалось подключиться к серверу: " + err.message);
      showToast("Ошибка подключения", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectBot = async () => {
    if (!isDisconnectConfirming) {
      setIsDisconnectConfirming(true);
      showToast("Нажмите «Отключить бота» еще раз для подтверждения", "info");
      setTimeout(() => setIsDisconnectConfirming(false), 5000); // Reset confirm
      return;
    }
    try {
      const res = await fetch("/api/admin/tg-bot/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTgBotStatus({ isConnected: false });
        showToast("Телеграм-бот успешно отключен!", "success");
        // Reload admin settings
        const setRes = await fetch("/api/admin/settings");
        const setData = await setRes.json();
        setSettings(setData);
      }
    } catch (err: any) {
      console.error("Disconnect failed:", err);
      showToast("Ошибка при отключении бота", "error");
    } finally {
      setIsDisconnectConfirming(false);
    }
  };

  // User Actions
  const handleToggleBlock = async (user: DbUser) => {
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, isBlocked: !user.isBlocked }),
      });
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (selectedUser?.id === user.id) setSelectedUser(updated);
      showToast(updated.isBlocked ? "Ученик заблокирован" : "Ученик разблокирован", "success");
    } catch (e) {
      console.error(e);
      showToast("Не удалось изменить статус блокировки", "error");
    }
  };

  const handleGrantPremium = async (user: DbUser, plan: "base" | "mega" | "ultra" | null) => {
    try {
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          isPremium: plan !== null,
          premiumType: plan,
          premiumUntil: plan ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null,
        }),
      });
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (selectedUser?.id === user.id) setSelectedUser(updated);
      showToast(plan ? `Премиум «${plan}» выдан на 30 дней` : "Премиум-доступ отозван", "success");
    } catch (e) {
      console.error(e);
      showToast("Не удалось обновить премиум статус", "error");
    }
  };

  // Settings update
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const updated = await res.json();
      setSettings(updated);
      showToast("Системные настройки и интеграция ЮKassa сохранены!", "success");
    } catch (e) {
      console.error(e);
      showToast("Ошибка при сохранении настроек", "error");
    }
  };

  // Styles CRUD
  const handleSaveStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = styleEditMode ? "/api/admin/styles/update" : "/api/admin/styles";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(styleForm),
      });
      if (res.ok) {
        showToast(styleEditMode ? "Стиль общения обновлен!" : "Новый стиль общения создан!", "success");
        setStyleForm({ id: "", name: "", description: "", prompt: "" });
        setStyleEditMode(false);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка сохранения стиля общения", "error");
    }
  };

  const handleEditStyleClick = (st: DbStyle) => {
    setStyleForm(st);
    setStyleEditMode(true);
    showToast("Стиль загружен в форму редактирования", "info");
  };

  const handleDeleteStyle = async (id: string) => {
    if (styleToDeleteConfirmId !== id) {
      setStyleToDeleteConfirmId(id);
      showToast("Нажмите «Удалить» еще раз для подтверждения удаления стиля", "info");
      setTimeout(() => setStyleToDeleteConfirmId(null), 5000);
      return;
    }

    try {
      const res = await fetch(`/api/admin/styles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showToast("Стиль ИИ успешно удален", "success");
        fetchAdminData();
      } else {
        showToast("Нельзя удалить стиль общения по умолчанию!", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка при удалении", "error");
    } finally {
      setStyleToDeleteConfirmId(null);
    }
  };

  // Advertising Campaigns CRUD
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adForm),
      });
      if (res.ok) {
        showToast("Рекламный блок успешно сохранен!", "success");
        setAdForm({ id: "", text: "", url: "", position: "mid", isActive: true });
        setAdEditMode(false);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка сохранения рекламы", "error");
    }
  };

  const handleDeleteAd = async (id: string) => {
    if (adToDeleteConfirmId !== id) {
      setAdToDeleteConfirmId(id);
      showToast("Нажмите «Удалить» еще раз для подтверждения удаления рекламы", "info");
      setTimeout(() => setAdToDeleteConfirmId(null), 5000);
      return;
    }

    try {
      await fetch(`/api/admin/ads/${id}`, { method: "DELETE" });
      showToast("Рекламный спонсорский блок удален", "success");
      fetchAdminData();
    } catch (e) {
      console.error(e);
      showToast("Ошибка при удалении рекламы", "error");
    } finally {
      setAdToDeleteConfirmId(null);
    }
  };

  // Create referral post marketing campaign link
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampaignError("");
    if (!campaignFormId.trim()) return;

    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaignFormId }),
      });
      if (res.ok) {
        showToast("Рекламная метка успешно создана!", "success");
        setCampaignFormId("");
        fetchAdminData();
      } else {
        const data = await res.json();
        setCampaignError(data.error || "Ошибка создания кампании");
        showToast(data.error || "Ошибка создания кампании", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка запроса", "error");
    }
  };

  // Newsletters Broadcast
  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(broadcastForm),
      });
      if (res.ok) {
        showToast("Пост рассылки успешно сохранен в черновики!", "success");
        setBroadcastForm({ 
          text: "", 
          mediaUrl: "", 
          buttonText: "", 
          buttonUrl: "",
          buttonStyle: "default",
          buttonEmoji: "🔗"
        });
        setBroadPreview(false);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
      showToast("Не удалось сохранить черновик", "error");
    }
  };

  const handleStartBroadcast = async (id: string) => {
    try {
      await fetch("/api/admin/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      showToast("Рассылка запущена в очередь!", "success");
      fetchAdminData();
    } catch (e) {
      console.error(e);
      showToast("Ошибка запуска рассылки", "error");
    }
  };

  const handleStopBroadcast = async (id: string) => {
    try {
      await fetch("/api/admin/broadcasts/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      showToast("Рассылка приостановлена", "info");
      fetchAdminData();
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate filtered payments sum
  const getFilteredPaymentsSum = () => {
    const now = new Date();
    const msInDay = 24 * 3600 * 1000;
    let limitTime = now.getTime() - 30 * msInDay; // Default month

    if (paymentPeriod === "day") {
      limitTime = now.getTime() - msInDay;
    } else if (paymentPeriod === "week") {
      limitTime = now.getTime() - 7 * msInDay;
    }

    const filtered = payments.filter((p) => p.status === "succeeded" && new Date(p.createdAt).getTime() >= limitTime);
    return filtered.reduce((sum, p) => sum + p.amount, 0);
  };

  // Filter users lists based on search
  const filteredUsers = users.filter(
    (u) =>
      u.id.includes(userSearch) ||
      (u.username && u.username.toLowerCase().includes(userSearch.toLowerCase())) ||
      u.firstName.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="flex-1 bg-brand-bg p-6 flex flex-col h-[820px] overflow-hidden relative rounded-2xl border border-brand-border">
      {/* Toast Notification Container */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-semibold animate-fade-in border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-brand-green" : toast.type === "error" ? "bg-brand-red" : "bg-indigo-400"}`} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Admin Panel Header */}
      <div className="flex items-center justify-between border-b border-brand-border pb-5 mb-5 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white border border-brand-border rounded-xl shadow-xs">
            <Activity className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-sans font-bold text-slate-800 text-base tracking-tight flex items-center gap-2">
              Панель Администратора
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-sans uppercase font-bold tracking-wider animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-brand-green rounded-full"></span> Live
              </span>
            </h2>
            <p className="text-xs text-brand-muted font-medium">Управление личностями ИИ, рекламными кампаниями и платежами ЮKassa</p>
          </div>
        </div>

        <button
          onClick={fetchAdminData}
          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
          title="Синхронизировать данные"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
          Обновить
        </button>
      </div>

      {/* Navigation tabs */}
      <div className="flex gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-brand-border mb-5 shrink-0 text-xs overflow-x-auto custom-scrollbar">
        {[
          { id: "stats", label: "Аналитика", icon: BarChart3 },
          { id: "users", label: "Ученики", icon: Users },
          { id: "styles", label: "Стили & Настройки", icon: Sparkles },
          { id: "ads", label: "Реклама", icon: Megaphone },
          { id: "broadcasts", label: "Рассылки", icon: Bell },
          { id: "system", label: "Система", icon: Database },
          { id: "logs", label: "Логи & Вебхуки", icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 shrink-0 cursor-pointer outline-none focus:outline-none focus:ring-0 ${
              activeTab === tab.id
                ? "bg-white text-slate-900 border border-brand-border shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-indigo-600" : "text-slate-400"}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dynamic Tab Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-1">
        {/* TAB 1: ANALYTICS */}
        {activeTab === "stats" && stats && (
          <div className="space-y-6 animate-fade-in">
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-brand-border p-5 rounded-2xl flex flex-col justify-between shadow-xs hover:shadow-sm transition-all">
                <span className="text-brand-muted text-[11px] font-bold uppercase tracking-wider block">Всего Учеников</span>
                <span className="text-3xl font-bold text-slate-950 mt-1.5 tracking-tight">{stats.totalUsers}</span>
                <span className="text-[10px] text-brand-green block mt-1.5 font-bold">Органика + Рефералка</span>
              </div>
              <div className="bg-white border border-brand-border p-5 rounded-2xl flex flex-col justify-between shadow-xs hover:shadow-sm transition-all">
                <span className="text-brand-muted text-[11px] font-bold uppercase tracking-wider block">Конверсия в подписку</span>
                <span className="text-3xl font-bold text-amber-600 mt-1.5 tracking-tight">
                  {stats.totalUsers > 0 ? Math.round((stats.premiumUsers / stats.totalUsers) * 100) : 0}%
                </span>
                <span className="text-[10px] text-slate-600 block mt-1.5 font-semibold">
                  {stats.premiumUsers} активных подписок
                </span>
              </div>
              <div className="bg-white border border-brand-border p-5 rounded-2xl flex flex-col justify-between shadow-xs hover:shadow-sm transition-all">
                <span className="text-brand-muted text-[11px] font-bold uppercase tracking-wider block">Активность DAU / MAU</span>
                <span className="text-3xl font-bold text-indigo-600 mt-1.5 tracking-tight">
                  {stats.dau} / {stats.mau}
                </span>
                <span className="text-[10px] text-slate-600 block mt-1.5 font-semibold flex items-center gap-1">
                  Retention: <span className="text-indigo-600 font-bold">{stats.mau > 0 ? Math.round((stats.dau / stats.mau) * 100) : 0}%</span>
                </span>
              </div>
              <div className="bg-white border border-brand-border p-5 rounded-2xl flex flex-col justify-between shadow-xs hover:shadow-sm transition-all">
                <span className="text-brand-muted text-[11px] font-bold uppercase tracking-wider block">Общий Оборот</span>
                <span className="text-3xl font-bold text-brand-green mt-1.5 tracking-tight">{stats.totalRevenue} ₽</span>
                <span className="text-[10px] text-brand-green block mt-1.5 font-bold">ЮKassa подтверждена</span>
              </div>
            </div>

            {/* Filtered Premium Income Analysis Card */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm tracking-tight">Продажи премиум-тарифов</h4>
                  <p className="text-[11px] text-brand-muted mt-0.5">Оценка выручки с подписок за выбранный интервал</p>
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-[11px] border border-brand-border">
                  {["day", "week", "month"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPaymentPeriod(p as any)}
                      className={`px-3 py-1 rounded-lg font-semibold uppercase transition-all cursor-pointer ${
                        paymentPeriod === p ? "bg-white text-slate-850 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {p === "day" ? "День" : p === "week" ? "Неделя" : "Месяц"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-brand-bg rounded-xl border border-brand-border flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Coins className="w-8 h-8 text-amber-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-brand-muted font-bold block uppercase tracking-wider">Получено платежей за период:</span>
                    <span className="text-3xl font-bold text-slate-800">{getFilteredPaymentsSum()} ₽</span>
                  </div>
                </div>
                <div className="text-left text-[11px] text-slate-600 space-y-1 font-medium bg-white p-3 rounded-xl border border-brand-border">
                  <div>Тариф Базовый: <span className="text-indigo-600 font-bold">199 ₽ (неделя)</span></div>
                  <div>Тариф Мега: <span className="text-indigo-600 font-bold">399 ₽ (месяц)</span></div>
                  <div>Тариф Ультра: <span className="text-indigo-600 font-bold">899 ₽ (3 месяца)</span></div>
                </div>
              </div>
            </div>

            {/* Core Bot Usage metrics & Styles popularity representation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-brand-border p-6 rounded-2xl space-y-4 shadow-xs">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-indigo-500" />
                  Популярность стилей общения ИИ
                </h4>
                <div className="space-y-4">
                  {Object.entries(stats.styleCount).map(([styleId, count]) => {
                    const pct = Math.round(((count as number) / stats.totalUsers) * 100) || 0;
                    return (
                      <div key={styleId} className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-700 font-medium">
                          <span className="capitalize font-semibold">{styleId === "brother" ? "Братка (Бро)" : styleId === "teacher" ? "Марь Ванна" : styleId === "professor" ? "Чокнутый Проф" : styleId}</span>
                          <span className="text-indigo-600 font-bold">{count} чел ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-50">
                          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-brand-border p-6 rounded-2xl space-y-4 flex flex-col justify-between shadow-xs">
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <TrendingUp className="w-4.5 h-4.5 text-brand-green" />
                    Общие запросы в сервис за все время
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 bg-slate-50 rounded-xl border border-brand-border">
                      <span className="text-brand-muted text-[10px] font-bold block uppercase tracking-wider">ГДЗ решено:</span>
                      <span className="text-2xl font-bold text-amber-600 mt-1 block">{stats.totalGdzSolved}</span>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-brand-border">
                      <span className="text-brand-muted text-[10px] font-bold block uppercase tracking-wider">Чат-сообщения:</span>
                      <span className="text-2xl font-bold text-brand-green mt-1 block">{stats.totalMessagesChat}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-3 mt-4">
                  <a
                    href="/api/admin/export/users"
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                    Экспорт CSV
                  </a>
                  <a
                    href="/api/admin/export/postgres"
                    className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                  >
                    <Database className="w-4 h-4 text-slate-500" />
                    Дамп Postgres
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER PROFILES */}
        {activeTab === "users" && (
          <div className="space-y-4 animate-fade-in">
            {/* Search inputs */}
            <div className="relative shrink-0 text-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск учеников по ID, имени или Telegram Username..."
                className="w-full bg-white border border-brand-border rounded-xl px-4 pl-10 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
              />
            </div>

            {/* Users listing */}
            <div className="bg-white border border-brand-border rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-brand-muted border-b border-brand-border font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-4 pl-5">ID / Имя ученика</th>
                      <th className="p-4">Username</th>
                      <th className="p-4">Премиум-тариф</th>
                      <th className="p-4">Рефералы / Баллы</th>
                      <th className="p-4 text-right pr-5">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-800">
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={`hover:bg-slate-50/50 transition-colors ${user.isBlocked ? "bg-red-50/30 opacity-60" : ""}`}
                      >
                        <td className="p-4 pl-5 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-base border border-brand-border shrink-0">
                            {user.gender === "M" ? "👦" : user.gender === "F" ? "👧" : "🧑"}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800 block text-xs">
                              {user.firstName} {user.lastName}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">{user.id}</span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-600 font-semibold">@{user.username || "—"}</td>
                        <td className="p-4">
                          {user.isPremium ? (
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-850 rounded-full font-bold text-[9px] uppercase tracking-wider border border-amber-200">
                              ★ {user.premiumType}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-medium">Обычный</span>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-slate-700">
                          <div>👥 {user.referralsCount || 0} чел</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">🏆 {user.quizPoints || 0} баллов</div>
                        </td>
                        <td className="p-4 text-right pr-5">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border rounded-xl text-[10px] uppercase font-bold cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            Детали
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-semibold text-xs">
                          Ученики по запросу не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User detail override modal */}
            {selectedUser && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-fade-in">
                <div className="bg-white border border-brand-border w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl">
                  <div className="flex justify-between items-start border-b border-brand-border pb-3.5">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Профиль ученика</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {selectedUser.id}</p>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="text-slate-400 hover:text-slate-600 font-bold text-base p-1 cursor-pointer transition-all active:scale-90"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-4 bg-brand-bg rounded-xl border border-brand-border space-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">ФИО:</span>
                      <span className="text-slate-800 font-bold">
                        {selectedUser.firstName} {selectedUser.lastName}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Никнейм:</span>
                      <span className="text-indigo-600 font-bold">@{selectedUser.username || "нет"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Регистрация:</span>
                      <span className="text-slate-700 font-semibold">{new Date(selectedUser.registeredAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Приглашен по метке:</span>
                      <span className="text-slate-700 font-bold">{selectedUser.referredByCampaign || "Прямой переход"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Приглашен пользователем:</span>
                      <span className="text-slate-700 font-mono font-bold">{selectedUser.referredBy || "нет"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Набрано баллов за квиз:</span>
                      <span className="text-brand-green font-bold">🏆 {selectedUser.quizPoints || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500 font-medium">Класс / Обучение:</span>
                      <span className="text-blue-600 font-bold">
                        {selectedUser.grade ? (selectedUser.grade === "uni" ? "Университет 🎓" : `${selectedUser.grade} класс 🎒`) : "❌ Не указан"}
                      </span>
                    </div>
                    <div className="flex justify-between pb-0">
                      <span className="text-slate-500 font-medium">ГДЗ решено сегодня:</span>
                      <span className="text-amber-600 font-bold">📂 {selectedUser.gdzToday}</span>
                    </div>
                    {selectedUser.customPrompt && (
                      <div className="border-t border-brand-border pt-3 text-left">
                        <span className="text-slate-700 block text-[10px] uppercase font-bold mb-1">Кастомный ИИ-промпт (Mega/Ultra):</span>
                        <div className="bg-white p-2.5 rounded-xl border border-brand-border text-[11px] text-slate-600 font-medium leading-relaxed max-h-[80px] overflow-y-auto custom-scrollbar">
                          {selectedUser.customPrompt}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual administrative override triggers */}
                  <div className="space-y-3 pt-1">
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                      Административные действия:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleToggleBlock(selectedUser)}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer border shadow-xs active:scale-95 ${
                          selectedUser.isBlocked
                            ? "bg-brand-green text-white border-brand-green hover:opacity-90"
                            : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                        }`}
                      >
                        {selectedUser.isBlocked ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                        {selectedUser.isBlocked ? "Разблокировать" : "Заблокировать"}
                      </button>

                      {selectedUser.isPremium ? (
                        <button
                          onClick={() => handleGrantPremium(selectedUser, null)}
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border rounded-xl text-[10px] font-bold uppercase cursor-pointer shadow-xs active:scale-95 transition-all"
                        >
                          Отозвать Премиум
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleGrantPremium(selectedUser, "base")}
                            className="px-4 py-2.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-[10px] font-bold uppercase cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            + База
                          </button>
                          <button
                            onClick={() => handleGrantPremium(selectedUser, "mega")}
                            className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-white border border-amber-300 hover:opacity-90 rounded-xl text-[10px] font-bold uppercase cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            + Мега
                          </button>
                          <button
                            onClick={() => handleGrantPremium(selectedUser, "ultra")}
                            className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white border border-indigo-400 hover:opacity-90 rounded-xl text-[10px] font-bold uppercase cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            + Ультра
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CHATBOT STYLES & GENERAL LIMITS */}
        {activeTab === "styles" && settings && (
          <div className="space-y-6 animate-fade-in">
            {/* Real Telegram Bot integration card */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-brand-border pb-3">
                <Globe className="w-5 h-5 text-indigo-500" />
                Настройка Telegram-Бота
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Введите токен вашего бота от <strong className="text-indigo-600">@BotFather</strong>. Система автоматически запустит фоновое длинное получение обновлений (polling) и начнет мгновенно принимать сообщения, фотографии домашней работы и ГДЗ!
              </p>

              {tgBotStatus && tgBotStatus.isConnected ? (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-green animate-pulse" />
                      <span className="font-bold text-emerald-850 text-[11px] tracking-wide uppercase">Бот успешно подключен и активен</span>
                    </div>
                    <button
                      onClick={handleDisconnectBot}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-[10px] uppercase transition-all cursor-pointer border active:scale-95 shadow-xs ${
                        isDisconnectConfirming 
                          ? "bg-brand-red text-white border-brand-red animate-pulse" 
                          : "bg-white text-brand-red border-red-200 hover:bg-red-50"
                      }`}
                    >
                      {isDisconnectConfirming ? "Уверены? Нажмите еще раз!" : "Отключить бота"}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-brand-border">
                      <span className="text-[10px] text-slate-400 uppercase block font-bold">Username в Telegram:</span>
                      <a
                        href={`https://t.me/${tgBotStatus.botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline font-bold mt-0.5 inline-block"
                      >
                        @{tgBotStatus.botUsername}
                      </a>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-brand-border">
                      <span className="text-[10px] text-slate-400 uppercase block font-bold">Режим работы:</span>
                      <span className="text-slate-700 truncate block mt-0.5 font-semibold">
                        Background Polling (Постоянный опрос)
                      </span>
                    </div>
                  </div>
                  {tgBotStatus.telegramWebhookInfo && (
                    <div className="text-[10px] text-slate-600 font-medium bg-white p-3 rounded-xl border border-brand-border space-y-1">
                      <div className="font-bold text-slate-700 mb-1">Сведения Telegram Webhook:</div>
                      <div>Ожидающих обновлений: <span className="font-bold text-indigo-600">{tgBotStatus.telegramWebhookInfo.pending_update_count}</span></div>
                      <div>Макс. соединений: <span className="font-bold text-slate-700">{tgBotStatus.telegramWebhookInfo.max_connections}</span></div>
                      {tgBotStatus.telegramWebhookInfo.last_error_message && (
                        <div className="text-brand-red font-bold">Последняя ошибка: {tgBotStatus.telegramWebhookInfo.last_error_message}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="text-slate-600 font-bold text-[10px] uppercase tracking-wider">Токен Telegram-бота (API Token):</label>
                    <div className="flex gap-2.5">
                      <input
                        type="text"
                        value={tgBotTokenForm}
                        onChange={(e) => setTgBotTokenForm(e.target.value)}
                        placeholder="Напр: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                        className="flex-1 bg-white border border-brand-border rounded-xl p-2.5 text-slate-850 font-mono text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
                      />
                      <button
                        onClick={handleConnectBot}
                        disabled={isConnecting || !tgBotTokenForm}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 border border-slate-900 text-white font-bold rounded-xl text-xs uppercase tracking-wide transition-all shrink-0 flex items-center gap-1.5 shadow-xs disabled:shadow-none cursor-pointer active:scale-95"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Подключение...
                          </>
                        ) : (
                          "Подключить бота"
                        )}
                      </button>
                    </div>
                  </div>
                  {tgBotError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-brand-red font-semibold animate-fade-in">
                      <AlertCircle className="w-4 h-4 shrink-0 text-brand-red" />
                      <span>{tgBotError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* NEW: Yookassa Billing Integration Card */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-brand-border pb-3">
                <CreditCard className="w-5 h-5 text-indigo-500" />
                Интеграция Эквайринга ЮKassa (Платежи)
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Настройте прием реальных оплат через ЮKassa в Telegram-боте. При активации интеграции тестовые ссылки симулятора оплаты будут отправлять транзакции через официальный шлюз платежной системы.
              </p>

              <div className="bg-brand-bg rounded-xl border border-brand-border p-4 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div>
                    <span className="font-semibold text-slate-800 text-xs block">Реальный эквайринг ЮKassa</span>
                    <span className="text-[10px] text-brand-muted mt-0.5">Включить обработку платежей через API</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, yookassaEnabled: !settings.yookassaEnabled })}
                    className="cursor-pointer focus:outline-none"
                  >
                    {settings.yookassaEnabled ? (
                      <ToggleRight className="w-11 h-11 text-indigo-600 transition-all" />
                    ) : (
                      <ToggleLeft className="w-11 h-11 text-slate-300 transition-all" />
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-600 uppercase tracking-wider block font-bold">Идентификатор магазина (Shop ID):</label>
                    <input
                      type="text"
                      placeholder="Напр: 495123"
                      value={settings.yookassaShopId || ""}
                      onChange={(e) => setSettings({ ...settings, yookassaShopId: e.target.value })}
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-850 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-600 uppercase tracking-wider block font-bold">Секретный API-ключ / Токен:</label>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="test_l79Q7fW_bXz..."
                        value={settings.yookassaSecretKey || ""}
                        onChange={(e) => setSettings({ ...settings, yookassaSecretKey: e.target.value })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-850 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Lock className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleUpdateSettings}
                    className="px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wide transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    💾 Сохранить интеграцию ЮKassa
                  </button>
                </div>
              </div>
            </div>

            {/* Style personality configuration form */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-brand-border pb-3">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                {styleEditMode ? "Редактировать личность ИИ" : "Создать личность ИИ"}
              </h4>
              <form onSubmit={handleSaveStyle} className="space-y-4.5 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 font-bold text-[10px] uppercase">Системный ID (EN):</label>
                    <input
                      type="text"
                      disabled={styleEditMode}
                      value={styleForm.id}
                      onChange={(e) => setStyleForm({ ...styleForm, id: e.target.value })}
                      placeholder="Напр: brother_nerd"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-600 font-bold text-[10px] uppercase">Отображаемое Имя:</label>
                    <input
                      type="text"
                      value={styleForm.name}
                      onChange={(e) => setStyleForm({ ...styleForm, name: e.target.value })}
                      placeholder="Напр: Зумер ИИ"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-bold text-[10px] uppercase">Краткое описание характера:</label>
                  <input
                    type="text"
                    value={styleForm.description}
                    onChange={(e) => setStyleForm({ ...styleForm, description: e.target.value })}
                    placeholder="Дерзкий, веселый и забавный бот..."
                    className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-bold text-[10px] uppercase">Системный промпт (Инструкции):</label>
                  <textarea
                    value={styleForm.prompt}
                    onChange={(e) => setStyleForm({ ...styleForm, prompt: e.target.value })}
                    placeholder="Ты ИИ-бот, говоришь на зумерском сленге..."
                    className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-medium h-20 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase text-[10px] rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    {styleEditMode ? "Сохранить изменения" : "Создать личность"}
                  </button>
                  {styleEditMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setStyleForm({ id: "", name: "", description: "", prompt: "" });
                        setStyleEditMode(false);
                      }}
                      className="px-4.5 py-2.5 bg-white border border-brand-border text-slate-700 font-bold uppercase text-[10px] rounded-xl hover:bg-slate-50 transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* List current styles */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                🎭 Существующие стили общения ИИ
              </h4>
              <div className="space-y-3">
                {styles.map((st) => (
                  <div
                    key={st.id}
                    className="bg-slate-50/50 border border-brand-border p-4 rounded-xl flex items-start justify-between text-xs transition-all hover:bg-slate-50"
                  >
                    <div>
                      <h5 className="font-bold text-slate-800 flex items-center gap-2">
                        {st.name}
                        {st.isDefault && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-sans uppercase font-bold tracking-wider">
                            Дефолт
                          </span>
                        )}
                      </h5>
                      <p className="text-slate-500 text-[11px] mt-1 font-medium">{st.description}</p>
                      <div className="mt-2 text-[10px] text-slate-400 font-mono leading-relaxed bg-white p-2.5 rounded-lg border border-slate-100">
                        <strong className="text-slate-500">Системный Промпт:</strong> {st.prompt}
                      </div>
                    </div>

                    <div className="flex gap-1.5 shrink-0 ml-4">
                      <button
                        onClick={() => handleEditStyleClick(st)}
                        className="p-2 bg-white hover:bg-slate-100 border border-brand-border text-slate-700 rounded-xl cursor-pointer active:scale-95 shadow-xs transition-all"
                        title="Редактировать"
                      >
                        <Edit className="w-3.5 h-3.5 text-indigo-600" />
                      </button>
                      {!st.isDefault && (
                        <button
                          onClick={() => handleDeleteStyle(st.id)}
                          className={`p-2 border rounded-xl transition-all cursor-pointer active:scale-95 shadow-xs ${
                            styleToDeleteConfirmId === st.id 
                              ? "bg-brand-red text-white border-brand-red animate-pulse" 
                              : "bg-white hover:bg-red-50 border-brand-border text-brand-red"
                          }`}
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Core Limits settings */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                ⚙️ Системные лимиты пользователей
              </h4>
              <form onSubmit={handleUpdateSettings} className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-semibold">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Обязательный канал (URL):</label>
                    <input
                      type="text"
                      value={settings.requiredChannelUrl}
                      onChange={(e) => setSettings({ ...settings, requiredChannelUrl: e.target.value })}
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Название канала (для UI):</label>
                    <input
                      type="text"
                      value={settings.requiredChannelName}
                      onChange={(e) => setSettings({ ...settings, requiredChannelName: e.target.value })}
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Free Чат Лим:</label>
                      <input
                        type="number"
                        value={settings.freeMessagesLimit}
                        onChange={(e) => setSettings({ ...settings, freeMessagesLimit: parseInt(e.target.value) })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Free ГДЗ Лим:</label>
                      <input
                        type="number"
                        value={settings.freeGdzLimit}
                        onChange={(e) => setSettings({ ...settings, freeGdzLimit: parseInt(e.target.value) })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Context (Free):</label>
                        <input
                          type="number"
                          value={settings.contextDepthFree}
                          onChange={(e) => setSettings({ ...settings, contextDepthFree: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Context (Prem):</label>
                        <input
                          type="number"
                          value={settings.contextDepthPremium}
                          onChange={(e) => setSettings({ ...settings, contextDepthPremium: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Флуд (Free/мин):</label>
                        <input
                          type="number"
                          value={settings.messageFloodLimitFree}
                          onChange={(e) => setSettings({ ...settings, messageFloodLimitFree: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Флуд (Prem/мин):</label>
                        <input
                          type="number"
                          value={settings.messageFloodLimitPremium}
                          onChange={(e) => setSettings({ ...settings, messageFloodLimitPremium: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Частота рекламы (часы):</label>
                        <input
                          type="number"
                          value={settings.adFrequencyHours || 4}
                          onChange={(e) => setSettings({ ...settings, adFrequencyHours: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Интервал сообщений:</label>
                        <input
                          type="number"
                          value={settings.adMessageInterval || 5}
                          onChange={(e) => setSettings({ ...settings, adMessageInterval: parseInt(e.target.value) })}
                          className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-white font-sans uppercase text-[10px] font-black rounded-xl cursor-pointer transition-all shadow-xs active:scale-95"
                  >
                    💾 Сохранить системные лимиты
                  </button>
                </div>
              </form>
            </div>

            {/* AI Integration settings */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3 flex items-center gap-2">
                <span>🤖 Настройка искусственного интеллекта (Gemini / Grok)</span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Выберите основной искусственный интеллект для общения с пользователями и решения домашних заданий (ГДЗ). Вы можете использовать встроенный Gemini или подключить Grok от xAI.
              </p>

              <form onSubmit={handleUpdateSettings} className="space-y-4 text-xs font-semibold">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider block">Основной ИИ провайдер:</label>
                    <select
                      value={settings.aiProvider || "gemini"}
                      onChange={(e) => setSettings({ ...settings, aiProvider: e.target.value as "gemini" | "grok" })}
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="gemini">Google Gemini (Стандартный, с поддержкой голоса/кружков)</option>
                      <option value="grok">xAI Grok (Высокая скорость, тонкая настройка)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider block">Модель Grok (для xAI):</label>
                    <input
                      type="text"
                      value={settings.grokModel || "grok-2-1212"}
                      onChange={(e) => setSettings({ ...settings, grokModel: e.target.value })}
                      placeholder="grok-2-1212"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider block">API Ключ Google Gemini:</label>
                    <input
                      type="password"
                      value={settings.geminiApiKey || ""}
                      onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      placeholder="Вставьте AIzaSy... (или останется по умолчанию из .env)"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider block">API Ключ xAI Grok:</label>
                    <input
                      type="password"
                      value={settings.grokApiKey || ""}
                      onChange={(e) => setSettings({ ...settings, grokApiKey: e.target.value })}
                      placeholder="Вставьте xai-... (требуется для провайдера Grok)"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-brand-border rounded-xl p-3.5 text-[11px] text-slate-500 leading-relaxed font-normal">
                  💡 <strong>Подсказка:</strong> Для решения домашнего задания по фото через <strong>Grok</strong>, убедитесь, что вы используете модель с поддержкой зрения (vision), либо оставьте <code>grok-2-1212</code>. Для обработки голосовых сообщений и видеокружков всегда задействуется Gemini (требуется наличие ключа в .env или в поле выше) для точного распознавания речи.
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-sans uppercase text-[10px] font-black rounded-xl cursor-pointer transition-all shadow-xs active:scale-95 animate-pulse"
                >
                  💾 Сохранить настройки ИИ моделей
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: ADVERTISING CAMPAIGNS */}
        {activeTab === "ads" && (
          <div className="space-y-4 animate-fade-in">
            {/* Create Campaign form */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                📈 Создать реферальную ссылку (Campaign Join)
              </h4>
              <form onSubmit={handleCreateCampaign} className="flex gap-2.5 text-xs flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  value={campaignFormId}
                  onChange={(e) => setCampaignFormId(e.target.value)}
                  placeholder="Имя рекламной ссылки, напр: blogger_vlad_10"
                  className="flex-1 bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-mono text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <button
                  type="submit"
                  className="px-4.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase text-[10px] rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer active:scale-95"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Создать метку
                </button>
              </form>
              {campaignError && <p className="text-[11px] text-brand-red font-bold animate-fade-in">{campaignError}</p>}
            </div>

            {/* Campaign statistics analyzer */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                📊 Анализ эффективности рекламных вступлений
              </h4>
              <p className="text-[10px] text-brand-muted uppercase tracking-wider font-bold">Воронка конверсии: Клик ➔ Уникальный ➔ Прошел обучение ➔ Купил премиум ➔ Выручка</p>

              <div className="space-y-3 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                {campaigns.map((camp) => {
                  const onboardingRate = camp.uniqueUsers > 0 ? Math.round((camp.completedOnboarding / camp.uniqueUsers) * 100) : 0;
                  const purchaseRate = camp.uniqueUsers > 0 ? Math.round((camp.premiumPurchased / camp.uniqueUsers) * 100) : 0;

                  return (
                    <div
                      key={camp.id}
                      className="bg-slate-50/50 border border-brand-border p-4.5 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-800 text-sm block">Метка: {camp.id}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Ссылка вступления: <code className="bg-white px-1.5 py-0.5 border border-slate-100 rounded text-indigo-600 font-bold select-all">t.me/YourBot?start=c_{camp.id}</code>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div className="bg-white border border-brand-border p-2.5 rounded-xl">
                          <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Кликов / Уников:</span>
                          <span className="text-sm font-bold text-slate-800">{camp.clicksCount} / {camp.uniqueUsers}</span>
                        </div>
                        <div className="bg-white border border-brand-border p-2.5 rounded-xl">
                          <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Обучение (Onboard):</span>
                          <span className="text-sm font-bold text-indigo-600">{camp.completedOnboarding} ({onboardingRate}%)</span>
                        </div>
                        <div className="bg-white border border-brand-border p-2.5 rounded-xl">
                          <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Продаж подписок:</span>
                          <span className="text-sm font-bold text-amber-600">{camp.premiumPurchased} ({purchaseRate}%)</span>
                        </div>
                        <div className="bg-white border border-brand-border p-2.5 rounded-xl">
                          <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Выручка (Оборот):</span>
                          <span className="text-sm font-bold text-brand-green">{camp.revenueSum || 0} ₽</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {campaigns.length === 0 && (
                  <p className="text-slate-400 text-center p-4 text-xs font-semibold">Нет заведенных рекламных кампаний</p>
                )}
              </div>
            </div>

            {/* Sponsor Slots / Ads Config */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                🎯 Спонсорские каналы & Встроенные объявления
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Настройте рекламу, которая показывается ученикам в телеграм-боте: перед выдачей ГДЗ-решения, в середине чата или при активации. Ссылка должна вести на ваш канал или спонсорский ресурс.
              </p>

              <form onSubmit={handleSaveAd} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Идентификатор рекламного блока (ID):</label>
                    <input
                      type="text"
                      disabled={adEditMode}
                      value={adForm.id}
                      onChange={(e) => setAdForm({ ...adForm, id: e.target.value })}
                      placeholder="Напр: sponsor_banner_one"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Целевая URL ссылка объявления:</label>
                    <input
                      type="url"
                      value={adForm.url}
                      onChange={(e) => setAdForm({ ...adForm, url: e.target.value })}
                      placeholder="Напр: https://t.me/your_channel_link"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3.5 flex flex-col justify-between">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Позиция показа:</label>
                      <select
                        value={adForm.position}
                        onChange={(e) => setAdForm({ ...adForm, position: e.target.value as any })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      >
                        <option value="start">При запуске (start)</option>
                        <option value="mid">В чате (mid)</option>
                        <option value="gdz">В блоке ГДЗ (gdz)</option>
                        <option value="pin">Закрепленное сообщение сверху чата (pin)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Статус показа:</label>
                      <select
                        value={adForm.isActive ? "yes" : "no"}
                        onChange={(e) => setAdForm({ ...adForm, isActive: e.target.value === "yes" })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      >
                        <option value="yes">Активно (Показывать)</option>
                        <option value="no">Приостановлено</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Рекламный Текст:</label>
                    <input
                      type="text"
                      value={adForm.text}
                      onChange={(e) => setAdForm({ ...adForm, text: e.target.value })}
                      placeholder="Подпишись на Школьный Канал, чтобы получить Premium!"
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      required
                    />
                  </div>

                  <div className="flex gap-2 justify-end mt-2">
                    <button
                      type="submit"
                      className="px-4.5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-bold uppercase text-[10px] rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      {adEditMode ? "Сохранить изменения" : "Создать объявление"}
                    </button>
                  </div>
                </div>
              </form>

              {/* List current sponsors slots */}
              <div className="space-y-3 pt-3">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Активные рекламные споты:</span>
                {ads.map((ad) => (
                  <div
                    key={ad.id}
                    className="bg-slate-50 border border-brand-border p-4 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{ad.id}</span>
                        <span className="text-[9px] bg-slate-100 border border-brand-border text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                          Поз: {ad.position}
                        </span>
                        <span className={`text-[9px] border px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ad.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          {ad.isActive ? "Активен" : "Выключен"}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1 font-semibold italic">«{ad.text}»</p>
                      <a href={ad.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline block text-[10px] font-semibold mt-1 truncate max-w-[300px]">
                        Ссылка: {ad.url}
                      </a>
                      <div className="flex items-center gap-4.5 mt-2.5 font-mono text-[10px] text-slate-500 font-bold">
                        <span>👁️ Всего показов: <strong className="text-slate-800">{ad.views}</strong></span>
                        <span>👤 Уников: <strong className="text-slate-800">{ad.uniqueViews?.length || 0}</strong></span>
                        <span>🖱️ Клики: <strong className="text-slate-800">{ad.clicks}</strong></span>
                      </div>
                    </div>

                    <div className="flex gap-1.5 shrink-0 ml-3">
                      <button
                        onClick={() => {
                          setAdForm(ad);
                          setAdEditMode(true);
                          showToast("Объявление загружено в форму", "info");
                        }}
                        className="p-2 bg-white hover:bg-slate-100 border border-brand-border text-slate-700 rounded-xl cursor-pointer active:scale-95 transition-all shadow-xs"
                        title="Редактировать"
                      >
                        <Edit className="w-3.5 h-3.5 text-indigo-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteAd(ad.id)}
                        className={`p-2 border rounded-xl transition-all cursor-pointer active:scale-95 shadow-xs ${
                          adToDeleteConfirmId === ad.id 
                            ? "bg-brand-red text-white border-brand-red animate-pulse" 
                            : "bg-white hover:bg-red-50 border-brand-border text-brand-red"
                        }`}
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: BROADCASTS */}
        {activeTab === "broadcasts" && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Creator container */}
              <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
                <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                  📢 Создать массовую рассылку сообщений
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Составьте информационное сообщение для отправки всем пользователям бота. Поддерживается разметка Markdown, кнопки действия и ссылки.
                </p>

                <form onSubmit={handleCreateBroadcast} className="space-y-4.5 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Основной текст рассылки:</label>
                    <textarea
                      value={broadcastForm.text}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, text: e.target.value })}
                      placeholder="Привет, ученик! Доступны новые решения для контрольных..."
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-medium h-20 placeholder:text-slate-400 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">URL медиафайла / Картинки (опционально):</label>
                    <input
                      type="text"
                      value={broadcastForm.mediaUrl}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, mediaUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/photo..."
                      className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Текст кнопки действия:</label>
                      <input
                        type="text"
                        value={broadcastForm.buttonText}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, buttonText: e.target.value })}
                        placeholder="Напр: Открыть ГДЗ"
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">URL кнопки действия:</label>
                      <input
                        type="text"
                        value={broadcastForm.buttonUrl}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, buttonUrl: e.target.value })}
                        placeholder="https://t.me/..."
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Эмодзи кнопки:</label>
                      <select
                        value={broadcastForm.buttonEmoji}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, buttonEmoji: e.target.value })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none cursor-pointer"
                      >
                        <option value="">Без эмодзи</option>
                        <option value="🔗">🔗 Ссылка</option>
                        <option value="🔥">🔥 Огонь</option>
                        <option value="👑">👑 Корона</option>
                        <option value="🎒">🎒 Портфель</option>
                        <option value="📚">📚 Книги</option>
                        <option value="💎">💎 Алмаз</option>
                        <option value="🎁">🎁 Подарок</option>
                        <option value="🚀">🚀 Ракета</option>
                        <option value="💬">💬 Чат</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">Цвет кнопки:</label>
                      <select
                        value={broadcastForm.buttonStyle}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, buttonStyle: e.target.value })}
                        className="w-full bg-white border border-brand-border rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none cursor-pointer"
                      >
                        <option value="default">Серая (Дефолт)</option>
                        <option value="primary">Синяя (Primary)</option>
                        <option value="success">Зеленая (Success)</option>
                        <option value="warning">Желтая (Warning)</option>
                        <option value="danger">Красная (Danger)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 justify-between">
                    <button
                      type="button"
                      onClick={() => setBroadPreview(!broadPreview)}
                      className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-brand-border font-bold uppercase text-[10px] rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-slate-500" />
                      {broadPreview ? "Скрыть превью" : "Посмотреть превью"}
                    </button>
                    <button
                      type="submit"
                      className="px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 border border-indigo-500 text-white font-bold uppercase text-[10px] rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Сохранить черновик
                    </button>
                  </div>
                </form>
              </div>

              {/* Live Preview container */}
              <div className="space-y-4">
                {broadPreview && (
                  <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs animate-fade-in">
                    <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3 uppercase tracking-wider text-[10px] text-indigo-600 flex items-center gap-1.5">
                      👁️ Мобильное Превью Telegram сообщения:
                    </h4>
                    <div className="max-w-[280px] mx-auto bg-slate-900 text-slate-100 rounded-2xl p-3.5 space-y-3 font-sans text-xs border border-slate-850 shadow-md">
                      {broadcastForm.mediaUrl && (
                        <div className="w-full h-32 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                          <img
                            src={broadcastForm.mediaUrl}
                            alt="Media Preview"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://placehold.co/600x400/222/777?text=Картинка+добавлена+(в+Telegram+будет+видно)";
                            }}
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed select-text font-bold text-slate-200">
                        {broadcastForm.text || "Введите текст слева для предпросмотра..."}
                      </p>
                      {broadcastForm.buttonText && (() => {
                        let styleClasses = "bg-slate-800 border-slate-700 text-indigo-400 hover:bg-slate-750";
                        if (broadcastForm.buttonStyle === "primary") styleClasses = "bg-blue-600 border-blue-500 text-white hover:bg-blue-500";
                        if (broadcastForm.buttonStyle === "success") styleClasses = "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500";
                        if (broadcastForm.buttonStyle === "warning") styleClasses = "bg-amber-500 border-amber-400 text-slate-950 hover:bg-amber-400";
                        if (broadcastForm.buttonStyle === "danger") styleClasses = "bg-rose-600 border-rose-500 text-white hover:bg-rose-500";

                        return (
                          <a
                            href={broadcastForm.buttonUrl || "#"}
                            className={`block w-full py-2 text-center rounded-xl font-bold border text-[10px] uppercase transition-all ${styleClasses}`}
                          >
                            {broadcastForm.buttonEmoji ? broadcastForm.buttonEmoji + " " : ""}{broadcastForm.buttonText}
                          </a>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* List Saved Newsletter campaigns & interactive simulation console */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3">
                ⚙️ Зарегистрированные массовые рассылки
              </h4>

              <div className="space-y-3 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                {broadcasts.map((b) => {
                  const percent = b.totalTarget > 0 ? Math.round(((b.sentCount + b.errorCount) / b.totalTarget) * 100) : 0;
                  return (
                    <div
                      key={b.id}
                      className="bg-slate-50/50 border border-brand-border p-4.5 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-800 text-sm">Рассылка #{b.id}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-semibold">
                            Создан: {new Date(b.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span
                          className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                            b.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : b.status === "sending"
                              ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                              : b.status === "stopped"
                              ? "bg-slate-100 text-slate-500 border-slate-200"
                              : "bg-white text-slate-600 border-slate-200"
                          }`}
                        >
                          {b.status === "completed"
                            ? "Выполнено"
                            : b.status === "sending"
                            ? "Отправка"
                            : b.status === "stopped"
                            ? "Приостановлено"
                            : "Черновик"}
                        </span>
                      </div>

                      <p className="text-slate-600 italic text-xs bg-white p-3.5 rounded-xl border border-slate-100 line-clamp-2 leading-relaxed font-semibold">
                        {b.text}
                      </p>

                      {/* Live progress pipelines */}
                      {(b.status === "sending" || b.status === "completed" || b.status === "stopped") && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-slate-500 font-bold">
                            <span>
                              Отправлено: <strong className="text-slate-700">{b.sentCount}</strong> / Ошибки: <strong className="text-brand-red">{b.errorCount}</strong> (Всего: {b.totalTarget})
                            </span>
                            <span className="text-brand-green font-bold">{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-50">
                            <div
                              className="bg-brand-green h-full transition-all duration-300 rounded-full"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Interactive dispatch controls */}
                      <div className="flex gap-2 justify-end">
                        {b.status !== "sending" && b.status !== "completed" && (
                          <button
                            onClick={() => handleStartBroadcast(b.id)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase text-[10px] rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Запустить отправку
                          </button>
                        )}
                        {b.status === "sending" && (
                          <button
                            onClick={() => handleStopBroadcast(b.id)}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold uppercase text-[10px] rounded-xl flex items-center gap-1.5 cursor-pointer animate-pulse shadow-xs active:scale-95 transition-all"
                          >
                            <Square className="w-3.5 h-3.5" />
                            Приостановить
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {broadcasts.length === 0 && (
                  <p className="text-slate-400 text-center p-4 text-xs font-semibold">Нет заведенных рассылок</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SYSTEM METRICS */}
        {activeTab === "system" && system && (
          <div className="space-y-4 animate-fade-in">
            {/* Live dials for system resources */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-500" />
                Мониторинг ресурсов виртуального сервера (Cloud Run)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-xs font-semibold">
                {/* CPU dial */}
                <div className="bg-slate-50/50 border border-brand-border p-5 rounded-xl space-y-2 relative overflow-hidden">
                  <Cpu className="w-6 h-6 text-indigo-600 mx-auto" />
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">CPU ({system.cpu.cores} Ядер):</span>
                  <span className="text-2xl font-bold text-indigo-600 block">{system.cpu.loadPercent}%</span>
                  <div className="text-[10px] text-slate-400 truncate leading-relaxed font-bold">{system.cpu.model}</div>
                </div>

                {/* RAM dial */}
                <div className="bg-slate-50/50 border border-brand-border p-5 rounded-xl space-y-2">
                  <div className="text-slate-700 text-2xl font-bold">🧠</div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Оперативная память RAM:</span>
                  <span className="text-2xl font-bold text-indigo-600 block">
                    {system.ram.usedGb} / {system.ram.totalGb} GB
                  </span>
                  <div className="text-[10px] text-slate-400 font-bold">Загрузка: {system.ram.percent}%</div>
                </div>

                {/* Disk dial */}
                <div className="bg-slate-50/50 border border-brand-border p-5 rounded-xl space-y-2">
                  <div className="text-slate-700 text-2xl font-bold">💾</div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Дисковое пространство:</span>
                  <span className="text-2xl font-bold text-indigo-600 block">
                    {system.disk.usedGb} / {system.disk.totalGb} GB
                  </span>
                  <div className="text-[10px] text-slate-400 font-bold">Заполнено: {system.disk.percent}%</div>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-brand-border text-xs font-bold">
                <span className="text-slate-500 uppercase text-[10px] tracking-wider font-bold">Время непрерывной работы (Uptime):</span>
                <span className="text-slate-700 font-bold bg-white px-3 py-1 border border-slate-100 rounded-lg">
                  {Math.floor(system.serverUptime / 3600)} ч {Math.floor((system.serverUptime % 3600) / 60)} мин
                </span>
              </div>
            </div>

            {/* Backups trigger */}
            <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-4 shadow-xs">
              <h4 className="font-bold text-slate-800 text-sm border-b border-brand-border pb-3 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                Экспорт базы данных & бэкап
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Скачайте полный дамп базы данных для переноса или резервного сохранения.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                <a
                  href="/api/admin/export/postgres"
                  className="p-4 bg-slate-50 hover:bg-slate-100 border border-brand-border rounded-xl flex items-center justify-between text-left transition-all shadow-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 block">Дамп PostgreSQL (.sql)</span>
                    <span className="text-[10px] text-slate-400 block mt-1">Полная схема отношений Postgres</span>
                  </div>
                  <Download className="w-5 h-5 text-brand-green shrink-0 ml-3" />
                </a>

                <a
                  href="/api/admin/export/json"
                  className="p-4 bg-slate-50 hover:bg-slate-100 border border-brand-border rounded-xl flex items-center justify-between text-left transition-all shadow-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 block">JSON Бэкап БД (.json)</span>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Размер файла: ~{system.dbSizeKb} KB
                    </span>
                  </div>
                  <Download className="w-5 h-5 text-amber-500 shrink-0 ml-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: LIVE LOGS */}
        {activeTab === "logs" && (
          <div className="flex-1 flex flex-col h-[520px] overflow-hidden font-sans animate-fade-in space-y-4">
            {/* Header / Info bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border pb-4 shrink-0 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">
                  🪵 Мониторинг логов и активности вебхуков Telegram
                </h4>
                <p className="text-brand-muted font-medium mt-1">
                  Отображение запросов в реальном времени. Нажмите на строку для просмотра деталей JSON.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <button
                  onClick={handleClearLogs}
                  className="px-3.5 py-2 bg-white hover:bg-red-50 text-brand-red border border-red-200 font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs text-[11px] rounded-xl active:scale-95"
                >
                  Очистить логи
                </button>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] uppercase rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-ping" />
                  Автообновление: 3с
                </div>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0 text-xs font-bold">
              {/* Filter by Category */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Раздел логов:</label>
                <select
                  value={logsCategory}
                  onChange={(e) => setLogsCategory(e.target.value as any)}
                  className="w-full bg-white border border-brand-border p-2.5 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl cursor-pointer"
                >
                  <option value="all">Все разделы</option>
                  <option value="webhook">webhook (Обновления Telegram)</option>
                  <option value="bot">bot (Симулятор/Чат)</option>
                  <option value="api">api (Запросы к Telegram)</option>
                  <option value="gemini">gemini (Ответы ИИ)</option>
                  <option value="system">system (Работа ядра)</option>
                </select>
              </div>

              {/* Filter by Level */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Уровень лога:</label>
                <select
                  value={logsFilter}
                  onChange={(e) => setLogsFilter(e.target.value as any)}
                  className="w-full bg-white border border-brand-border p-2.5 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl cursor-pointer"
                >
                  <option value="all">Все уровни</option>
                  <option value="info">INFO (Информационные)</option>
                  <option value="warn">WARN (Предупреждения)</option>
                  <option value="error">ERROR (Ошибки системы)</option>
                </select>
              </div>

              {/* Text Search */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Поиск по тексту:</label>
                <input
                  type="text"
                  placeholder="Введите ключевые слова..."
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  className="w-full bg-white border border-brand-border p-2.5 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl"
                />
              </div>
            </div>

            {/* Logs List Container */}
            <div className="flex-1 border border-brand-border bg-slate-900 overflow-y-auto custom-scrollbar font-mono text-[11px] p-4.5 leading-relaxed select-text min-h-0 rounded-2xl shadow-inner">
              {(() => {
                const filteredLogs = logs.filter((l) => {
                  if (logsFilter !== "all" && l.level !== logsFilter) return false;
                  if (logsCategory !== "all" && l.category !== logsCategory) return false;
                  if (logsSearch) {
                    const term = logsSearch.toLowerCase();
                    const msgMatch = l.message.toLowerCase().includes(term);
                    const detailsMatch = l.details && l.details.toLowerCase().includes(term);
                    return msgMatch || detailsMatch;
                  }
                  return true;
                });

                if (filteredLogs.length === 0) {
                  return (
                    <div className="text-slate-500 text-center py-12 italic font-sans font-bold">
                      Нет подходящих записей логов
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filteredLogs.map((l) => {
                      const isExpanded = expandedLogId === l.id;
                      const levelColors = {
                        info: "text-emerald-400",
                        warn: "text-amber-400",
                        error: "text-rose-400",
                      };
                      const catColors = {
                        webhook: "bg-blue-950/80 text-blue-300 border-blue-900/50",
                        bot: "bg-purple-950/80 text-purple-300 border-purple-900/50",
                        api: "bg-teal-950/80 text-teal-300 border-teal-900/50",
                        gemini: "bg-violet-950/80 text-violet-300 border-violet-900/50",
                        system: "bg-slate-800 text-slate-300 border-slate-700",
                      };

                      return (
                        <div
                          key={l.id}
                          className="border-b border-slate-800/60 pb-2 last:border-0"
                        >
                          {/* Log line summary */}
                          <div
                            onClick={() => l.details && setExpandedLogId(isExpanded ? null : l.id)}
                            className={`flex flex-wrap items-start gap-2.5 hover:bg-slate-800/40 p-1.5 cursor-pointer rounded-lg transition-colors ${
                              l.details ? "border-l-2 border-indigo-500 pl-2" : "pl-2"
                            }`}
                          >
                            <span className="text-slate-500 shrink-0 font-sans font-semibold">
                              {new Date(l.timestamp).toLocaleTimeString()}
                            </span>
                            
                            <span className={`font-bold uppercase tracking-wide shrink-0 ${levelColors[l.level]}`}>
                              [{l.level}]
                            </span>

                            <span className={`px-2 py-0.5 shrink-0 border text-[9px] font-sans font-bold uppercase rounded-md ${catColors[l.category] || "bg-slate-800 text-slate-300 border-slate-700"}`}>
                              {l.category}
                            </span>

                            <span className="text-slate-200 font-sans flex-1 break-all font-semibold">
                              {l.message}
                            </span>

                            {l.details && (
                              <span className="text-[10px] text-indigo-400 select-none hover:underline font-sans font-semibold shrink-0">
                                {isExpanded ? "Свернуть ▲" : "Детали ▼"}
                              </span>
                            )}
                          </div>

                          {/* Expanded JSON details */}
                          {isExpanded && l.details && (
                            <div className="mt-2 ml-4 p-3 bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[10px] overflow-x-auto max-h-[300px] whitespace-pre custom-scrollbar rounded-xl">
                              {l.details}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
