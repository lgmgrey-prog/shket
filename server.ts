import express from "express";
import path from "path";
import os from "os";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { dbInstance, DbUser } from "./server/db.js";
import { chatWithBot, solveHomework, generateTeacherJoke, insultByName, chatWithVoiceOrVideo, testAiConnection } from "./server/gemini.js";

// Load env variables
dotenv.config();

interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  category: "bot" | "webhook" | "system" | "api" | "gemini";
  message: string;
  details?: string;
}

const systemLogs: SystemLog[] = [
  {
    id: "init_1",
    timestamp: new Date().toISOString(),
    level: "info",
    category: "system",
    message: "Система логирования инициализирована. Сервер запускается...",
  }
];

function addSystemLog(level: "info" | "warn" | "error", category: "bot" | "webhook" | "system" | "api" | "gemini", message: string, details?: any) {
  const detailsStr = details ? (typeof details === "string" ? details : JSON.stringify(details, null, 2)) : undefined;
  systemLogs.unshift({
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details: detailsStr,
  });
  if (systemLogs.length > 500) {
    systemLogs.pop();
  }
}

// Check for expired premiums, demoting users if their premium expiration has passed.
function getUserWithPremiumCheck(userId: string) {
  let user = dbInstance.findUser(userId);
  if (!user) return undefined;
  if (user.isPremium && user.premiumUntil) {
    // Top 5 premium type does not expire this way as it is checked dynamically by syncTop5Premium
    if (user.premiumType !== "top5" && new Date(user.premiumUntil).getTime() < Date.now()) {
      dbInstance.updateUser(userId, {
        isPremium: false,
        premiumType: null,
        premiumUntil: null,
      });
      user = dbInstance.findUser(userId);
    }
  }
  return user;
}

// Synchronize Top 5 quiz players' premium access
function syncTop5Premium() {
  const users = dbInstance.getUsers();
  const quizResults = dbInstance.getQuizResults();

  // Sum points per user
  const userPointsMap: Record<string, number> = {};
  quizResults.forEach(r => {
    userPointsMap[r.userId] = (userPointsMap[r.userId] || 0) + r.points;
  });

  // Sort and filter active players with > 0 points
  const activePlayers = Object.keys(userPointsMap)
    .map(uid => ({ userId: uid, points: userPointsMap[uid] }))
    .filter(p => p.points > 0)
    .sort((a, b) => b.points - a.points);

  const top5UserIds = activePlayers.slice(0, 5).map(p => p.userId);

  users.forEach(u => {
    const isCurrentlyTop5 = top5UserIds.includes(u.id);

    if (isCurrentlyTop5) {
      // Award premium if they don't have it, or keep it if it's already top5
      if (!u.isPremium || u.premiumType === "top5") {
        dbInstance.updateUser(u.id, {
          isPremium: true,
          premiumType: "top5",
          premiumUntil: new Date("2035-01-01T00:00:00.000Z").toISOString(), // Infinite/Long-term premium while in Top 5
        });
      }
    } else {
      // Demote if they were in the top 5 but fell out
      if (u.isPremium && u.premiumType === "top5") {
        dbInstance.updateUser(u.id, {
          isPremium: false,
          premiumType: null,
          premiumUntil: null,
        });
      }
    }
  });
}

// Check if user is subscribed to the mandatory channel configured in settings
async function isSubscribedToRequiredChannel(token: string, userId: string): Promise<boolean> {
  const settings = dbInstance.getSettings();
  if (!settings.requiredChannelUrl) return true;

  // Derive channel username from URL, e.g. https://t.me/my_channel -> @my_channel
  let channelId = settings.requiredChannelUrl.trim();
  if (channelId.includes("t.me/")) {
    const parts = channelId.split("t.me/")[1].split("/");
    channelId = "@" + parts[0];
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${channelId}&user_id=${userId}`);
    const data = await res.json();
    if (data.ok) {
      const status = data.result?.status;
      return ["creator", "administrator", "member", "restricted"].includes(status);
    } else {
      console.warn(`getChatMember returned error: ${data.description}`);
      // Fallback: If channel format is invalid or bot is not an administrator, do not block the user!
      if (data.description && (data.description.includes("chat not found") || data.description.includes("not an administrator") || data.description.includes("bot is not a member"))) {
        return true;
      }
      return false;
    }
  } catch (err) {
    console.error("isSubscribedToRequiredChannel error:", err);
    return true; // fail-safe: pass on network/API failure
  }
}

// Check if we should display an advertisement to the user
function shouldShowAd(user: any): boolean {
  if (user.isPremium) return false; // Premium users bypass ads
  if (!user.lastAdShownAt) return true; // Show first ad immediately

  const settings = dbInstance.getSettings();
  const adFreqHours = settings.adFrequencyHours || 4;
  const adMsgInt = settings.adMessageInterval || 5;

  const lastAdTime = new Date(user.lastAdShownAt).getTime();
  const hoursElapsed = (Date.now() - lastAdTime) / (1000 * 60 * 60);

  const msgsCount = user.messagesSinceLastAd || 0;

  return hoursElapsed >= adFreqHours && msgsCount >= adMsgInt;
}

// Retrieve and rotate ads using impression balancing for the specified position
function getAdForPosition(position: "start" | "mid" | "gdz" | "pin", userId: string) {
  const activeAds = dbInstance.getAds().filter((a) => a.isActive && a.position === position);
  if (activeAds.length === 0) return null;

  // Rotation: pick the one with lowest impressions (views count), or fallback to random
  activeAds.sort((a, b) => {
    const viewsDiff = a.views - b.views;
    if (viewsDiff !== 0) return viewsDiff;
    return Math.random() > 0.5 ? 1 : -1;
  });

  const chosenAd = activeAds[0];

  // Track total and unique views
  const uniqueViews = chosenAd.uniqueViews || [];
  const isUnique = !uniqueViews.includes(userId);
  const updatedUniqueViews = isUnique ? [...uniqueViews, userId] : uniqueViews;

  dbInstance.updateAd(chosenAd.id, {
    views: chosenAd.views + 1,
    uniqueViews: updatedUniqueViews,
  });

  // Log in user state
  dbInstance.updateUser(userId, {
    lastAdShownAt: new Date().toISOString(),
    messagesSinceLastAd: 0,
  });

  return chosenAd;
}

let isPollingActive = false;
let lastUpdateId = 0;

async function startTelegramPolling() {
  if (isPollingActive) {
    addSystemLog("info", "system", "Запрос на запуск пуллинга отклонен: пуллинг уже активен");
    return;
  }
  
  const settings = dbInstance.getSettings();
  const token = settings.tgBotToken;
  if (!token) {
    addSystemLog("info", "system", "Фоновый пуллинг (getUpdates) пропущен: токен не задан в настройках");
    return;
  }

  isPollingActive = true;
  addSystemLog("info", "system", `Инициализация фонового пуллинга getUpdates для бота @${settings.tgBotUsername || "NeuroShketBot"}...`);

  // Deleting webhook to enable getUpdates
  try {
    const delWebhookRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const delData = await delWebhookRes.json();
    addSystemLog("info", "system", "Успешно отправлен запрос на удаление вебхука в Telegram для переключения в режим getUpdates.", delData);
  } catch (err: any) {
    addSystemLog("warn", "system", `Предупреждение при очистке вебхука: ${err.message}`);
  }

  const poll = async () => {
    if (!isPollingActive) return;
    
    // Check if token changed or was removed
    const currentSettings = dbInstance.getSettings();
    if (currentSettings.tgBotToken !== token || !currentSettings.tgBotToken) {
      addSystemLog("info", "system", "Фоновое пуллинг-соединение getUpdates остановлено: токен изменен или удален");
      isPollingActive = false;
      return;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
      const data = await res.json();
      
      if (data.ok && data.result && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          addSystemLog("info", "webhook", `[getUpdates] Получено новое обновление (ID: ${update.update_id}). Направляем на локальный обработчик...`);

          // Deliver locally to our webhook handler on port 3000
          fetch(`http://localhost:3000/api/tg-webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(update),
          }).catch((err: any) => {
            console.error("Local webhook delivery failed:", err);
            addSystemLog("error", "system", `Локальная доставка обновления ${update.update_id} не удалась: ${err.message}`);
          });
        }
      }
    } catch (err: any) {
      console.error("Error in getUpdates polling loop:", err);
      // Wait to prevent rapid error looping
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    if (isPollingActive) {
      setTimeout(poll, 100);
    }
  };

  poll();
}

function stopTelegramPolling() {
  if (isPollingActive) {
    addSystemLog("info", "system", "Принудительная остановка фонового пуллинга...");
    isPollingActive = false;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase body size limit to support base64 images for GDZ
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // Helper helper to send Telegram message
  async function sendTelegramMessage(token: string, chatId: string | number, text: string, extra: any = {}) {
    try {
      addSystemLog("info", "api", `Отправка sendMessage в Telegram (Чат ID: ${chatId})`, { text, extra });
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          ...extra
        })
      });
      const data = await res.json();
      if (!data.ok) {
        addSystemLog("error", "api", `Ошибка ответа Telegram API для чата ${chatId}`, data);
      } else {
        addSystemLog("info", "api", `Сообщение успешно доставлено в Telegram (Чат ID: ${chatId})`, data);
      }
      return data;
    } catch (err: any) {
      console.error("sendTelegramMessage failed:", err);
      addSystemLog("error", "api", `Исключение при вызове Telegram API (Чат ID: ${chatId})`, { error: err.message, stack: err.stack });
      return null;
    }
  }

  // Helper helper to send Telegram photo
  async function sendTelegramPhoto(token: string, chatId: string | number, photoUrl: string, caption: string, extra: any = {}) {
    try {
      addSystemLog("info", "api", `Отправка sendPhoto в Telegram (Чат ID: ${chatId})`, { photoUrl, caption, extra });
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          ...extra
        })
      });
      const data = await res.json();
      if (!data.ok) {
        addSystemLog("error", "api", `Ошибка ответа Telegram API (sendPhoto) для чата ${chatId}`, data);
      } else {
        addSystemLog("info", "api", `Фото успешно доставлено в Telegram (Чат ID: ${chatId})`, data);
      }
      return data;
    } catch (err: any) {
      console.error("sendTelegramPhoto failed:", err);
      addSystemLog("error", "api", `Исключение при вызове Telegram API (sendPhoto) (Чат ID: ${chatId})`, { error: err.message, stack: err.stack });
      return null;
    }
  }

  function ensureValidUrl(url: string | undefined | null): string {
    if (!url) return "";
    let trimmed = url.trim();
    if (!trimmed) return "";
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }
    return trimmed;
  }

  function getExternalHostUrl(req: express.Request): string {
    if (process.env.APP_URL) {
      return process.env.APP_URL;
    }
    let hostHeader = req.get("x-forwarded-host") || req.get("host") || "";
    if (hostHeader.includes(",")) {
      hostHeader = hostHeader.split(",")[0].trim();
    }
    if (hostHeader.includes(":")) {
      hostHeader = hostHeader.split(":")[0];
    }
    return `https://${hostHeader}`;
  }

  // ==========================================
  // REAL TELEGRAM BOT WEBHOOK & CONFIG ENDPOINTS
  // ==========================================

  // Connect & Set Webhook for real TG Bot
  app.post("/api/admin/tg-bot/setup", async (req, res) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Токен не предоставлен" });
    }

    try {
      // 1. Verify Bot Token using Telegram getMe API
      const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const getMeData = await getMeRes.json();
      if (!getMeData.ok) {
        return res.status(400).json({ error: "Неверный токен бота (Telegram API вернул ошибку)" });
      }

      const botUsername = getMeData.result.username;

      // 2. Set Webhook
      const hostUrl = getExternalHostUrl(req);
      const webhookUrl = `${hostUrl}/api/tg-webhook`;

      const setWebhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const setWebhookData = await setWebhookRes.json();

      if (!setWebhookData.ok) {
        return res.status(500).json({ error: "Не удалось установить webhook в Telegram API" });
      }

      // 3. Save into Settings database
      dbInstance.updateSettings({
        tgBotToken: token,
        tgBotUsername: botUsername,
        tgWebhookUrl: webhookUrl,
      });

      // Restart long polling for instant sandboxed access
      stopTelegramPolling();
      startTelegramPolling().catch((err) => {
        console.error("Failed to restart polling on setup:", err);
      });

      res.json({
        success: true,
        botUsername,
        webhookUrl,
      });
    } catch (err: any) {
      console.error("Failed to setup tg bot:", err);
      res.status(500).json({ error: err.message || "Внутренняя ошибка сервера" });
    }
  });

  // Disconnect TG Bot
  app.post("/api/admin/tg-bot/disconnect", async (req, res) => {
    const settings = dbInstance.getSettings();
    const token = settings.tgBotToken;
    if (token) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});
      } catch (err) {}
    }

    dbInstance.updateSettings({
      tgBotToken: "",
      tgBotUsername: "",
      tgWebhookUrl: "",
    });

    stopTelegramPolling();

    res.json({ success: true });
  });

  // Get TG Bot Connection Status
  app.get("/api/admin/tg-bot/status", async (req, res) => {
    const settings = dbInstance.getSettings();
    const token = settings.tgBotToken;
    if (!token) {
      return res.json({ isConnected: false });
    }

    try {
      const getWebhookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const getWebhookData = await getWebhookRes.json();
      res.json({
        isConnected: true,
        botUsername: settings.tgBotUsername,
        webhookUrl: settings.tgWebhookUrl,
        telegramWebhookInfo: getWebhookData.result,
      });
    } catch (err: any) {
      res.json({
        isConnected: true,
        botUsername: settings.tgBotUsername,
        webhookUrl: settings.tgWebhookUrl,
        error: "Не удалось связаться с Telegram API для проверки статуса",
      });
    }
  });

  // Serve beautiful interactive checkout simulator page
  app.get("/checkout/:paymentId", (req, res) => {
    const { paymentId } = req.params;
    const payment = dbInstance.getPayments().find((p) => p.id === paymentId);
    if (!payment) {
      return res.status(404).send("Счет не найден");
    }

    const settings = dbInstance.getSettings();
    const isRealYookassa = settings.yookassaEnabled || false;
    const shopId = settings.yookassaShopId || "не указан";

    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ЮKassa: Симулятор оплаты</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    <style>
        body {
            font-family: 'Montserrat', sans-serif;
            background: #09090b;
            color: #f4f4f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            width: 100%;
            max-width: 420px;
            background: #121214;
            border: 1px solid #27272a;
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            border-bottom: 1px solid #27272a;
            padding-bottom: 16px;
        }
        .logo-circle {
            width: 36px;
            height: 36px;
            background: #8b5cf6;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-weight: 800;
            color: #fff;
            font-size: 14px;
        }
        .title-group h2 {
            font-size: 15px;
            margin: 0;
            color: #fff;
            font-weight: 700;
        }
        .title-group p {
            font-size: 11px;
            margin: 4px 0 0 0;
            color: #a1a1aa;
        }
        .bill-card {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .bill-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 12px;
        }
        .bill-row:last-child {
            margin-bottom: 0;
        }
        .label { color: #a1a1aa; }
        .val { color: #fff; font-weight: 600; }
        .price { color: #10b981; font-weight: 800; font-size: 16px; }
        .card-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 16px;
        }
        .form-group label {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 700;
            color: #a1a1aa;
            letter-spacing: 0.05em;
        }
        .form-group input {
            background: #18181b;
            border: 1px solid #27272a;
            color: #fff;
            padding: 12px;
            border-radius: 8px;
            font-size: 13px;
            font-family: monospace;
            outline: none;
            transition: border 0.2s;
        }
        .form-group input:focus {
            border-color: #8b5cf6;
        }
        .row-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .pay-btn {
            width: 100%;
            background: #8b5cf6;
            color: #fff;
            border: none;
            padding: 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 8px;
        }
        .pay-btn:hover {
            background: #7c3aed;
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
        }
        .success-view {
            display: none;
            text-align: center;
            padding: 10px 0;
        }
        .success-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        .success-title {
            font-size: 18px;
            font-weight: 700;
            color: #10b981;
            margin-bottom: 8px;
        }
        .success-text {
            font-size: 13px;
            color: #a1a1aa;
            line-height: 1.5;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container" id="mainCard">
        <div class="header">
            <div class="logo-circle">Ю</div>
            <div class="title-group">
                <h2>ЮKassa Шлюз Оплаты</h2>
                <p>${isRealYookassa ? `Интеграция активна (Shop ID: ${shopId})` : "Тестовый симулятор платежей активен"}</p>
            </div>
        </div>

        <div class="bill-card">
            <div class="bill-row">
                <span class="label">Тариф:</span>
                <span class="val">НейроШкЕТ «\${payment.plan.toUpperCase()}»</span>
            </div>
            <div class="bill-row">
                <span class="label">ID счета:</span>
                <span class="val">\${payment.id}</span>
            </div>
            <div class="bill-row">
                <span class="label">Покупатель:</span>
                <span class="val">@\${payment.username}</span>
            </div>
            <div class="bill-row" style="margin-top: 12px; border-top: 1px dashed #27272a; padding-top: 12px;">
                <span class="label" style="font-size: 13px; font-weight:700;">Сумма к оплате:</span>
                <span class="price">\${payment.amount} ₽</span>
            </div>
        </div>

        <form id="paymentForm" onsubmit="handlePay(event)">
            <div class="form-group">
                <label>Номер карты</label>
                <input type="text" value="2200 4821 9910 4423" required placeholder="0000 0000 0000 0000">
            </div>
            <div class="row-2">
                <div class="form-group">
                    <label>Срок действия</label>
                    <input type="text" value="12/29" required placeholder="ММ/ГГ">
                </div>
                <div class="form-group">
                    <label>CVC / CVV</label>
                    <input type="password" value="991" required placeholder="000">
                </div>
            </div>
            <button type="submit" class="pay-btn" id="submitBtn">Подтвердить и оплатить \${payment.amount} ₽</button>
        </form>
    </div>

    <div class="container success-view" id="successCard">
        <div class="success-icon">🎉</div>
        <div class="success-title">Оплата успешна!</div>
        <div class="success-text">
            Тариф <strong>\${payment.plan.toUpperCase()}</strong> активирован в боте!<br>
            Вы можете закрыть эту вкладку и вернуться к переписке с ботом.
        </div>
        <button onclick="window.close()" class="pay-btn" style="background: #27272a; color: #f4f4f5;">Закрыть окно</button>
    </div>

    <script>
        function handlePay(e) {
            e.preventDefault();
            const btn = document.getElementById("submitBtn");
            btn.disabled = true;
            btn.innerText = "Обработка платежа...";

            fetch("/api/bot/webhook/yookassa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentId: "\${payment.id}", status: "succeeded" })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById("mainCard").style.display = "none";
                    document.getElementById("successCard").style.display = "block";
                    confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 }
                    });
                } else {
                    alert("Ошибка при симуляции оплаты. Пожалуйста, попробуйте еще раз.");
                    btn.disabled = false;
                    btn.innerText = "Подтвердить и оплатить \${payment.amount} ₽";
                }
            })
            .catch(err => {
                console.error(err);
                alert("Ошибка связи с сервером");
                btn.disabled = false;
                btn.innerText = "Подтвердить и оплатить";
            });
        }
    </script>
</body>
</html>
    `);
  });

  // Real Telegram Webhook Handler Route
  app.post("/api/tg-webhook", async (req, res) => {
    // Acknowledge receipt of Telegram update immediately with 200 OK
    res.sendStatus(200);

    const update = req.body;
    if (!update) {
      addSystemLog("warn", "webhook", "Получен пустой вебхук-запрос");
      return;
    }

    try {
      addSystemLog("info", "webhook", `Получено обновление от Telegram (Update ID: ${update.update_id || 'unknown'})`, update);

      const settings = dbInstance.getSettings();
      const token = settings.tgBotToken;
      if (!token) {
        addSystemLog("warn", "webhook", "Пропущена обработка вебхука: токен Telegram-бота не установлен в настройках");
        return;
      }

    // 1. Handle incoming message
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const from = message.from;
      if (!from) return;

      const userId = String(from.id);
      const username = from.username || "";
      const firstName = from.first_name || "";
      const lastName = from.last_name || "";

      let text = message.text || "";
      const botUser = settings.tgBotUsername || "NeuroShketBot";

      // Clean bot suffix from group commands (e.g. /start@NeuroShketBot -> /start)
      if (text) {
        const suffix = `@${botUser}`;
        if (text.includes(suffix)) {
          text = text.replace(suffix, "");
        }
      }

      // Group chat filtering
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      if (isGroup && text) {
        const isCommand = text.startsWith("/");
        const isMentioned = text.includes(`@${botUser}`);
        const isReplyToBot = message.reply_to_message && 
                             message.reply_to_message.from && 
                             String(message.reply_to_message.from.username).toLowerCase() === botUser.toLowerCase();

        if (!isCommand && !isMentioned && !isReplyToBot) {
          // Ignore casual messages in groups to avoid spam
          return;
        }
      }

      // Load or register user in DB with premium check
      let user = getUserWithPremiumCheck(userId);
      let isNew = false;
      if (!user) {
        isNew = true;
        let referredBy: string | null = null;
        let campaignId: string | null = null;

        if (text && text.startsWith("/start")) {
          const parts = text.split(" ");
          if (parts.length > 1) {
            const payload = parts[1];
            if (payload.startsWith("ref_")) {
              referredBy = payload.replace("ref_", "");
              const referrer = getUserWithPremiumCheck(referredBy);
              if (referrer) {
                dbInstance.updateUser(referredBy, {
                  referralsCount: (referrer.referralsCount || 0) + 1,
                });
                // Check if referrals count hit a multiple of 5 to award premium
                const updatedRef = getUserWithPremiumCheck(referredBy);
                if (updatedRef && updatedRef.referralsCount >= 5 && updatedRef.referralsCount % 5 === 0) {
                  const currentExpiry = updatedRef.premiumUntil ? new Date(updatedRef.premiumUntil).getTime() : Date.now();
                  const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
                  dbInstance.updateUser(referredBy, {
                    isPremium: true,
                    premiumType: updatedRef.premiumType || "base",
                    premiumUntil: new Date(baseTime + 3 * 24 * 3600 * 1000).toISOString(),
                  });
                }
              }
            } else if (payload.startsWith("camp_")) {
              campaignId = payload.replace("camp_", "");
              dbInstance.updateCampaignStats(campaignId, { uniqueUsers: 1 });
            }
          }
        }

        user = dbInstance.createUser({
          id: userId,
          username,
          firstName,
          lastName,
          referredBy,
          gender: Math.random() > 0.5 ? "M" : "F",
          onboardingCompleted: true,
          isPremium: true,
          premiumType: "demo",
          premiumUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour trial
        });

        if (campaignId) {
          dbInstance.updateCampaignStats(campaignId, { completedOnboarding: 1 });
        }
      }

      if (user.isBlocked) {
        await sendTelegramMessage(token, chatId, "⛔️ Ваш аккаунт заблокирован администратором.");
        return;
      }

      // Mandatory Channel Subscription Check (OP)
      const isStartCmd = text && text.startsWith("/start");
      if (settings.requiredChannelUrl && !isStartCmd && !user.isPremium) {
        const isSubbed = await isSubscribedToRequiredChannel(token, userId);
        if (!isSubbed) {
          const inlineKeyboard = {
            inline_keyboard: [
              [{ text: `📢 Подписаться на ${settings.requiredChannelName || "канал"}`, url: settings.requiredChannelUrl, style: "primary" }],
              [{ text: "✅ Я подписался (Проверить)", callback_data: "check_subscription_status", style: "success" }]
            ]
          };
          await sendTelegramMessage(token, chatId, `⚠️ **ОБЯЗАТЕЛЬНАЯ ПОДПИСКА (ОП)**\n\nЧтобы пользоваться ботом НейроШкЕТ, тебе нужно подписаться на наш спонсорский канал:\n\n👉 **${settings.requiredChannelName || "Наш Канал"}**\n\nПодпишись и нажми кнопку ниже, чтобы начать!`, {
            reply_markup: inlineKeyboard,
            parse_mode: "Markdown"
          });
          return;
        }
      }

      // A. Handle PHOTO upload (GDZ Homework Solver)
      if (message.photo) {
        if (!user.grade) {
          const gradeKeyboard = {
            inline_keyboard: [
              [
                { text: "1 класс", callback_data: "set_grade_1" },
                { text: "2 класс", callback_data: "set_grade_2" },
                { text: "3 класс", callback_data: "set_grade_3" }
              ],
              [
                { text: "4 класс", callback_data: "set_grade_4" },
                { text: "5 класс", callback_data: "set_grade_5" },
                { text: "6 класс", callback_data: "set_grade_6" }
              ],
              [
                { text: "7 класс", callback_data: "set_grade_7" },
                { text: "8 класс", callback_data: "set_grade_8" },
                { text: "9 класс", callback_data: "set_grade_9" }
              ],
              [
                { text: "10 класс", callback_data: "set_grade_10" },
                { text: "11 класс", callback_data: "set_grade_11" },
                { text: "Университет 🎓", callback_data: "set_grade_uni" }
              ]
            ]
          };
          await sendTelegramMessage(token, chatId, "🎒 **В каком классе ты учишься?**\n\nЧтобы я мог решить твою домашку, укажи свой класс или университет. Это нужно сделать один раз:", {
            reply_markup: gradeKeyboard
          });
          return;
        }
        const photos = message.photo;
        const largestPhoto = photos[photos.length - 1];
        const fileId = largestPhoto.file_id;

        await sendTelegramMessage(token, chatId, "🤖 Распознаю домашнее задание по фото... Пожалуйста, подождите.");

        try {
          // Get file path from Telegram API
          const getFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
          const getFileData = await getFileRes.json();
          if (getFileData.ok && getFileData.result?.file_path) {
            const filePath = getFileData.result.file_path;
            const fileDownloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
            const downloadRes = await fetch(fileDownloadUrl);
            const arrayBuffer = await downloadRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = `data:image/jpeg;base64,${buffer.toString("base64")}`;

            // Check limits for non-premium
            if (!user.isPremium) {
              const today = new Date().toDateString();
              const lastMsgDate = user.lastMessageAt ? new Date(user.lastMessageAt).toDateString() : "";
              let gdzCount = user.gdzToday;
              if (lastMsgDate !== today) gdzCount = 0;

              if (gdzCount >= settings.freeGdzLimit) {
                await sendTelegramMessage(token, chatId, `⚠️ Превышен бесплатный лимит ГДЗ: ${settings.freeGdzLimit} задач в день!\n\nКупите подписку /buy для полного безлимита на решение уроков!`);
                return;
              }

              dbInstance.updateUser(userId, {
                gdzToday: gdzCount + 1,
                lastMessageAt: new Date().toISOString(),
              });
            }

            // Solve homework!
            const solution = await solveHomework(base64Image);

            // Append dynamic GDZ ads if any
            let finalReply = solution;
            if (shouldShowAd(user)) {
              const ad = getAdForPosition("gdz", userId);
              if (ad) {
                finalReply += `\n\n📢 **РЕКЛАМА:**\n[${ad.text}](${ad.url})`;
              }
            } else {
              dbInstance.updateUser(userId, {
                messagesSinceLastAd: (user.messagesSinceLastAd || 0) + 1,
              });
            }

            await sendTelegramMessage(token, chatId, finalReply, { parse_mode: "Markdown" });
          } else {
            await sendTelegramMessage(token, chatId, "❌ Не удалось скачать фото с серверов Telegram. Попробуйте еще раз.");
          }
        } catch (err) {
          console.error("GDZ Telegram solve failed:", err);
          await sendTelegramMessage(token, chatId, "❌ Ошибка при обработке изображения. Попробуйте сфотографировать четче.");
        }
        return;
      }

      // A2. Handle VOICE message or VIDEO_NOTE message (circles)
      if (message.voice || message.video_note) {
        const isVideo = !!message.video_note;
        const voiceOrVideo = message.voice || message.video_note;
        const fileId = voiceOrVideo.file_id;
        const mimeType = isVideo ? "video/mp4" : (message.voice.mime_type || "audio/ogg");

        await sendTelegramMessage(token, chatId, isVideo ? "🎬 Слушаю и смотрю твой кружок... Секунду!" : "🎤 Слушаю твоё голосовое... Секунду!");

        try {
          // Get file path from Telegram API
          const getFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
          const getFileData = await getFileRes.json();
          if (getFileData.ok && getFileData.result?.file_path) {
            const filePath = getFileData.result.file_path;
            const fileDownloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
            const downloadRes = await fetch(fileDownloadUrl);
            const arrayBuffer = await downloadRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Data = buffer.toString("base64");

            // Check limits for non-premium
            if (!user.isPremium) {
              const today = new Date().toDateString();
              const lastMsgDate = user.lastMessageAt ? new Date(user.lastMessageAt).toDateString() : "";
              let msgCount = user.messagesToday;
              if (lastMsgDate !== today) msgCount = 0;

              if (msgCount >= settings.freeMessagesLimit) {
                await sendTelegramMessage(token, chatId, `⚠️ Превышен бесплатный лимит в ${settings.freeMessagesLimit} сообщений в день!\n\nКупите подписку через кнопку 💎 Купить Премиум, чтобы снять все лимиты!`);
                return;
              }

              dbInstance.updateUser(userId, {
                messagesToday: msgCount + 1,
                lastMessageAt: new Date().toISOString(),
              });
            }

            // Chat with bot using the audio/video
            const responseText = await chatWithVoiceOrVideo(userId, base64Data, mimeType, isVideo);

            // Append dynamic middle ad if active
            let finalReply = responseText;
            if (shouldShowAd(user)) {
              const ad = getAdForPosition("mid", userId);
              if (ad) {
                finalReply += `\n\n📢 **РЕКЛАМА:**\n[${ad.text}](${ad.url})`;
              }
            } else {
              dbInstance.updateUser(userId, {
                messagesSinceLastAd: (user.messagesSinceLastAd || 0) + 1,
              });
            }

            await sendTelegramMessage(token, chatId, finalReply, { parse_mode: "Markdown" });
          } else {
            await sendTelegramMessage(token, chatId, "❌ Не удалось загрузить аудио/видео с серверов Telegram.");
          }
        } catch (err) {
          console.error("Voice/video note processing failed:", err);
          await sendTelegramMessage(token, chatId, "❌ Произошла ошибка при анализе твоего сообщения. Попробуй сказать еще раз или напиши текстом.");
        }
        return;
      }

      // B. Handle Text messages & commands
      if (!text) return;

      // Handle start command
      if (text.startsWith("/start")) {
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const parts = text.split(" ");
        if (parts.length > 1) {
          const payload = parts[1];
          if (payload.startsWith("camp_")) {
            const campId = payload.replace("camp_", "");
            dbInstance.updateCampaignStats(campId, { clicks: 1 });
          }
        }

        // Send persistent reply keyboard first to register the bottom panel for the rest of the buttons
        await sendTelegramMessage(token, chatId, "Привет! Твои кнопки управления теперь всегда под рукой в меню внизу экрана. 👇", {
          reply_markup: {
            keyboard: [
              [{ text: "📚 Пройти Квиз" }, { text: "🔥 Свежий анекдот" }],
              [{ text: "💎 Купить Премиум" }, { text: "👥 Позвать друзей" }],
              [{ text: "👤 Мой Профиль" }]
            ],
            resize_keyboard: true
          }
        });

        let greeting = `Здорово! На связи ШкЕТ 🎒. Спрашивай чё угодно — я шарю за любую домашку и могу знатно поугарать над твоими преподшами. Будет жарко!\n\n` +
          `🎒 Панель управления НейроШкЕТа 🎒\n` +
          `Выбирай нужную функцию прямо на кнопках:`;

        // Interactive inline menu with 3 key features in 2 rows using Telegram Bot API 9.4 styles
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: "🎒 Решить ГДЗ", callback_data: "cmd_gdz", style: "danger" },
              { text: "🎭 Выбрать стиль ИИ", callback_data: "cmd_style", style: "primary" }
            ],
            [
              { text: "➕ Добавить в группу", url: `https://t.me/${botUser}?startgroup=true`, style: "success" }
            ]
          ]
        };

        await sendTelegramMessage(token, chatId, greeting, { reply_markup: inlineKeyboard, parse_mode: "Markdown" });

        // Handle Pinned Sponsor Message advertisement if configured
        try {
          const pinAds = dbInstance.getAds().filter((a) => a.isActive && a.position === "pin");
          if (pinAds.length > 0) {
            const ad = pinAds[Math.floor(Math.random() * pinAds.length)];
            const adText = `📌 **ЗАКРЕПЛЁННОЕ СООБЩЕНИЕ ОТ СПОНСОРА:**\n\n${ad.text}\n\n👉 [Перейти по ссылке](${ad.url})`;
            const adSendResult = await sendTelegramMessage(token, chatId, adText, { parse_mode: "Markdown" });
            if (adSendResult && adSendResult.ok && adSendResult.result?.message_id) {
              const messageId = adSendResult.result.message_id;
              dbInstance.updateAd(ad.id, { views: (ad.views || 0) + 1 });
              
              // Pin this message in the chat
              await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: messageId,
                  disable_notification: true
                })
              }).catch((pinErr) => console.error("Error pinning ad message:", pinErr));
            }
          }
        } catch (adErr) {
          console.error("Failed to process pinned advertisement:", adErr);
        }

        return;
      }

      // Keyboard option handlers
      if (text === "🎒 Решить домашку (ГДЗ)" || text === "/gdz") {
        if (!user.grade) {
          const gradeKeyboard = {
            inline_keyboard: [
              [
                { text: "1 класс", callback_data: "set_grade_1" },
                { text: "2 класс", callback_data: "set_grade_2" },
                { text: "3 класс", callback_data: "set_grade_3" }
              ],
              [
                { text: "4 класс", callback_data: "set_grade_4" },
                { text: "5 класс", callback_data: "set_grade_5" },
                { text: "6 класс", callback_data: "set_grade_6" }
              ],
              [
                { text: "7 класс", callback_data: "set_grade_7" },
                { text: "8 класс", callback_data: "set_grade_8" },
                { text: "9 класс", callback_data: "set_grade_9" }
              ],
              [
                { text: "10 класс", callback_data: "set_grade_10" },
                { text: "11 класс", callback_data: "set_grade_11" },
                { text: "Университет 🎓", callback_data: "set_grade_uni" }
              ]
            ]
          };
          await sendTelegramMessage(token, chatId, "🎒 В каком классе ты учишься?\n\nЧтобы я давал наиболее точные и понятные решения для твоего уровня сложности, выбери свой класс или университет:", {
            reply_markup: gradeKeyboard
          });
          return;
        }
        await sendTelegramMessage(token, chatId, "🎒 Просто отправь мне фото твоей домашки (задачи, упражнения, уравнения), и я решу её по шагам с подробным объяснением!");
        return;
      }

      if (text === "📚 Пройти Квиз" || text === "/quiz") {
        const quizzes = dbInstance.getQuizzes();
        if (quizzes.length === 0) {
          await sendTelegramMessage(token, chatId, "Квизы временно недоступны.");
          return;
        }
        const randomQuiz = quizzes[Math.floor(Math.random() * quizzes.length)];

        const inlineKeyboard = {
          inline_keyboard: randomQuiz.options.map((opt, idx) => [
            {
              text: opt,
              callback_data: `quiz_${randomQuiz.id}_${idx}`
            }
          ])
        };

        await sendTelegramMessage(token, chatId, `📚 КВИЗ по предмету [${randomQuiz.subject}]:\n\n${randomQuiz.question}\n\nЗа правильный ответ ты получишь ${randomQuiz.points} очков!`, {
          reply_markup: inlineKeyboard,
          parse_mode: "Markdown"
        });
        return;
      }

      if (text === "🔥 Свежий анекдот" || text === "/joke") {
        const joke = await generateTeacherJoke();
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "🔥 Новый анекдот", callback_data: "new_joke" }]
          ]
        };
        await sendTelegramMessage(token, chatId, `😂 Анекдот от ШкЕТа:\n\n${joke}`, {
          reply_markup: inlineKeyboard
        });
        return;
      }

      if (text === "/roast") {
        await sendTelegramMessage(token, chatId, "Укажи имя после команды, например: `/roast Ваня`", { parse_mode: "Markdown" });
        return;
      }

      if (text.startsWith("/roast ")) {
        const name = text.replace("/roast ", "").trim();
        const roast = await insultByName(name);
        await sendTelegramMessage(token, chatId, roast);
        return;
      }

      if (text === "🎭 Выбрать стиль" || text === "/style") {
        const styles = dbInstance.getStyles();
        const userStyle = styles.find(s => s.id === user?.currentStyleId) || styles[0];

        const inlineKeyboard = {
          inline_keyboard: styles.map((st) => [
            {
              text: `${st.name} ${st.id === userStyle.id ? "✅" : ""}`,
              callback_data: `style_${st.id}`
            }
          ])
        };

        await sendTelegramMessage(token, chatId, `🎭 **Выбор стиля общения:**\n\nТвой текущий стиль: *${userStyle.name}*\n\nВыбери другой стиль ниже, чтобы ИИ общался с тобой в этой роли:`, {
          reply_markup: inlineKeyboard,
          parse_mode: "Markdown"
        });
        return;
      }

      if (text === "💎 Купить Премиум" || text === "/buy") {
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "👑 БАЗОВЫЙ (7 дней) — 199 ₽", callback_data: "buy_base", style: "primary" }],
            [{ text: "🔥 МЕГА (30 дней) — 399 ₽", callback_data: "buy_mega", style: "success" }],
            [{ text: "⚡️ УЛЬТРА (90 дней) — 899 ₽", callback_data: "buy_ultra", style: "danger" }]
          ]
        };

        await sendTelegramMessage(token, chatId, `💎 **NeuroShkET PREMIUM**\n\nПолучи неограниченный доступ к ГДЗ и общению с ИИ, увеличенный контекст диалога и возможность создавать собственные стили ИИ!\n\n**Выбери подходящий тариф:**`, {
          reply_markup: inlineKeyboard
        });
        return;
      }

      if (text === "👥 Пригласить друзей" || text === "👥 Позвать друзей" || text === "/ref") {
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const refLink = `https://t.me/${botUser}?start=ref_${userId}`;
        await sendTelegramMessage(token, chatId, `👥 **Приглашай друзей — получай Премиум!**\n\nЗа каждых 5 друзей, перешедших по твоей ссылке, ты получишь **3 дня БЕСПЛАТНОГО Премиума!**\n\nТвоя реферальная ссылка:\n\`${refLink}\`\n\nУ тебя приглашено друзей: **${user.referralsCount || 0}**`, {
          parse_mode: "Markdown"
        });
        return;
      }

      if (text === "👤 Мой Профиль" || text === "/profile") {
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const refLink = `https://t.me/${botUser}?start=ref_${userId}`;
        const quizResults = dbInstance.getQuizResults();
        const quizPoints = quizResults.filter(r => r.userId === userId).reduce((sum, r) => sum + r.points, 0);
        
        let subStatus = "❌ Нет активной подписки";
        let daysLeftStr = "—";
        if (user.isPremium) {
          const typeLabel = user.premiumType === "base" ? "Базовый 👑" : user.premiumType === "mega" ? "Мега 🔥" : "Ультра ⚡️";
          subStatus = `Активна (${typeLabel})`;
          if (user.premiumUntil) {
            const msLeft = new Date(user.premiumUntil).getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000)));
            daysLeftStr = `${daysLeft} дн.`;
          } else {
            daysLeftStr = "Бессрочно";
          }
        }

        const profileText = `👤 **ЛИЧНЫЙ ПРОФИЛЬ УЧЕНИКА**\n\n` +
          `📝 **Информация о тебе:**\n` +
          `• Имя: *${user.firstName} ${user.lastName}*\n` +
          `• Юзернейм: @${user.username || "не установлен"}\n` +
          `• Класс / Обучение: *${user.grade ? (user.grade === "uni" ? "Университет 🎓" : `${user.grade} класс 🎒`) : "Не выбран ❌"}*\n` +
          `• ID: \`${userId}\`\n\n` +
          `🏆 **Твоя успеваемость:**\n` +
          `• Очки в квизах: *${quizPoints}* баллов\n` +
          `• Решено ГДЗ сегодня: *${user.gdzToday}*\n` +
          `• Сообщений сегодня: *${user.messagesToday}*\n\n` +
          `💎 **Статус подписки:**\n` +
          `• Подписка: *${subStatus}*\n` +
          `• Осталось дней: *${daysLeftStr}*\n\n` +
          `👥 **Реферальная система:**\n` +
          `• Приглашено друзей: *${user.referralsCount || 0}*\n` +
          `• Твоя ссылка: \`${refLink}\``;

        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "➕ Добавить ШкЕТа в группу", url: `https://t.me/${botUser}?startgroup=true`, style: "success" }],
            [{ text: "🎒 Изменить класс обучения", callback_data: "change_grade_trigger", style: "primary" }]
          ]
        };

        await sendTelegramMessage(token, chatId, profileText, { reply_markup: inlineKeyboard, parse_mode: "Markdown" });
        return;
      }

      // Default Chat fallback
      if (!user.isPremium) {
        const lastMsgDate = user.lastMessageAt ? new Date(user.lastMessageAt).toDateString() : "";
        const today = new Date().toDateString();
        let msgCount = user.messagesToday;

        if (lastMsgDate !== today) {
          msgCount = 0;
        }

        if (msgCount >= settings.freeMessagesLimit) {
          await sendTelegramMessage(token, chatId, `⚠️ Превышен бесплатный лимит в ${settings.freeMessagesLimit} сообщений в день!\n\nКупите подписку через кнопку 💎 Купить Премиум, чтобы снять все лимиты!`);
          return;
        }

        dbInstance.updateUser(userId, {
          messagesToday: msgCount + 1,
          lastMessageAt: new Date().toISOString(),
        });
      }

      // Show typing status indicator
      await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      }).catch(() => {});

      const responseText = await chatWithBot(userId, text);

      // Append dynamic middle ad if active
      let finalReply = responseText;
      if (shouldShowAd(user)) {
        const ad = getAdForPosition("mid", userId);
        if (ad) {
          finalReply += `\n\n📢 **РЕКЛАМА:**\n[${ad.text}](${ad.url})`;
        }
      } else {
        dbInstance.updateUser(userId, {
          messagesSinceLastAd: (user.messagesSinceLastAd || 0) + 1,
        });
      }

      await sendTelegramMessage(token, chatId, finalReply, { parse_mode: "Markdown" });
      return;
    }

    // 2. Handle callback queries (Inline Buttons)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const userId = String(cb.from.id);
      const cbData = cb.data;

      const user = getUserWithPremiumCheck(userId);
      if (!user) return;

      // Subscription check callback handler
      if (cbData === "check_subscription_status") {
        const isSubbed = await isSubscribedToRequiredChannel(token, userId);
        if (isSubbed) {
          await sendTelegramMessage(token, chatId, "✅ **Подписка подтверждена!**\n\nСпасибо за подписку! Теперь ты можешь полноценно использовать все функции НейроШкЕТа. Напиши что-нибудь или нажми кнопки меню!", {
            parse_mode: "Markdown"
          });
          // Remove inline keyboard
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
          }).catch(() => {});
        } else {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: cb.id, text: "❌ Ты ещё не подписался на канал!", show_alert: true })
          }).catch(() => {});
          return;
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: "Подписка проверена!" })
        }).catch(() => {});
        return;
      }

      // Inline Menu Command Handlers
      if (cbData === "cmd_gdz") {
        if (!user.grade) {
          const gradeKeyboard = {
            inline_keyboard: [
              [
                { text: "1 класс", callback_data: "set_grade_1" },
                { text: "2 класс", callback_data: "set_grade_2" },
                { text: "3 класс", callback_data: "set_grade_3" }
              ],
              [
                { text: "4 класс", callback_data: "set_grade_4" },
                { text: "5 класс", callback_data: "set_grade_5" },
                { text: "6 класс", callback_data: "set_grade_6" }
              ],
              [
                { text: "7 класс", callback_data: "set_grade_7" },
                { text: "8 класс", callback_data: "set_grade_8" },
                { text: "9 класс", callback_data: "set_grade_9" }
              ],
              [
                { text: "10 класс", callback_data: "set_grade_10" },
                { text: "11 класс", callback_data: "set_grade_11" },
                { text: "Университет 🎓", callback_data: "set_grade_uni" }
              ]
            ]
          };
          await sendTelegramMessage(token, chatId, "🎒 **В каком классе ты учишься?**\n\nЧтобы я давал наиболее точные и понятные решения для твоего уровня сложности, выбери свой класс или университет:", {
            reply_markup: gradeKeyboard
          });
        } else {
          await sendTelegramMessage(token, chatId, "🎒 Просто **отправь мне фото** твоей домашки (задачи, упражнения, уравнения), и я решу её по шагам с подробным объяснением!");
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_quiz") {
        const quizzes = dbInstance.getQuizzes();
        if (quizzes.length === 0) {
          await sendTelegramMessage(token, chatId, "Квизы временно недоступны.");
        } else {
          const randomQuiz = quizzes[Math.floor(Math.random() * quizzes.length)];

          const inlineKeyboard = {
            inline_keyboard: randomQuiz.options.map((opt, idx) => [
              {
                text: opt,
                callback_data: `quiz_${randomQuiz.id}_${idx}`
              }
            ])
          };

          await sendTelegramMessage(token, chatId, `📚 **КВИЗ по предмету [${randomQuiz.subject}]:**\n\n${randomQuiz.question}\n\n*За правильный ответ ты получишь ${randomQuiz.points} очков!*`, {
            reply_markup: inlineKeyboard,
            parse_mode: "Markdown"
          });
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_joke") {
        const joke = await generateTeacherJoke();
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "🔥 Новый анекдот", callback_data: "new_joke" }]
          ]
        };
        await sendTelegramMessage(token, chatId, `😂 Анекдот от ШкЕТа:\n\n${joke}`, {
          reply_markup: inlineKeyboard
        });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_style") {
        const styles = dbInstance.getStyles();
        const userStyle = styles.find(s => s.id === user?.currentStyleId) || styles[0];

        const inlineKeyboard = {
          inline_keyboard: styles.map((st) => [
            {
              text: `${st.name} ${st.id === userStyle.id ? "✅" : ""}`,
              callback_data: `style_${st.id}`
            }
          ])
        };

        await sendTelegramMessage(token, chatId, `🎭 **Выбор стиля общения:**\n\nТвой текущий стиль: *${userStyle.name}*\n\nВыбери другой стиль ниже, чтобы ИИ общался с тобой в этой роли:`, {
          reply_markup: inlineKeyboard,
          parse_mode: "Markdown"
        });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_premium") {
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "👑 БАЗОВЫЙ (7 дней) — 199 ₽", callback_data: "buy_base", style: "primary" }],
            [{ text: "🔥 МЕГА (30 дней) — 399 ₽", callback_data: "buy_mega", style: "success" }],
            [{ text: "⚡️ УЛЬТРА (90 дней) — 899 ₽", callback_data: "buy_ultra", style: "danger" }]
          ]
        };

        await sendTelegramMessage(token, chatId, `💎 **NeuroShkET PREMIUM**\n\nПолучи неограниченный доступ к ГДЗ и общению с ИИ, увеличенный контекст диалога и возможность создавать собственные стили ИИ!\n\n**Выбери подходящий тариф:**`, {
          reply_markup: inlineKeyboard
        });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_referral") {
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const refLink = `https://t.me/${botUser}?start=ref_${userId}`;
        await sendTelegramMessage(token, chatId, `👥 **Приглашай друзей — получай Премиум!**\n\nЗа каждых 5 друзей, перешедших по твоей ссылке, ты получишь **3 дня БЕСПЛАТНОГО Премиума!**\n\nТвоя реферальная ссылка:\n\`${refLink}\`\n\nУ тебя приглашено друзей: **${user.referralsCount || 0}**`, {
          parse_mode: "Markdown"
        });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      if (cbData === "cmd_profile") {
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const refLink = `https://t.me/${botUser}?start=ref_${userId}`;
        const quizResults = dbInstance.getQuizResults();
        const quizPoints = quizResults.filter(r => r.userId === userId).reduce((sum, r) => sum + r.points, 0);
        
        let subStatus = "❌ Нет активной подписки";
        let daysLeftStr = "—";
        if (user.isPremium) {
          const typeLabel = user.premiumType === "base" ? "Базовый 👑" : user.premiumType === "mega" ? "Мега 🔥" : "Ультра ⚡️";
          subStatus = `Активна (${typeLabel})`;
          if (user.premiumUntil) {
            const msLeft = new Date(user.premiumUntil).getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000)));
            daysLeftStr = `${daysLeft} дн.`;
          } else {
            daysLeftStr = "Бессрочно";
          }
        }

        const profileText = `👤 **ЛИЧНЫЙ ПРОФИЛЬ УЧЕНИКА**\n\n` +
          `📝 **Информация о тебе:**\n` +
          `• Имя: *${user.firstName} ${user.lastName}*\n` +
          `• Юзернейм: @${user.username || "не установлен"}\n` +
          `• Класс / Обучение: *${user.grade ? (user.grade === "uni" ? "Университет 🎓" : `${user.grade} класс 🎒`) : "Не выбран ❌"}*\n` +
          `• ID: \`${userId}\`\n\n` +
          `🏆 **Твоя успеваемость:**\n` +
          `• Очки в квизах: *${quizPoints}* баллов\n` +
          `• Решено ГДЗ сегодня: *${user.gdzToday}*\n` +
          `• Сообщений сегодня: *${user.messagesToday}*\n\n` +
          `💎 **Статус подписки:**\n` +
          `• Подписка: *${subStatus}*\n` +
          `• Осталось дней: *${daysLeftStr}*\n\n` +
          `👥 **Реферальная система:**\n` +
          `• Приглашено друзей: *${user.referralsCount || 0}*\n` +
          `• Твоя ссылка: \`${refLink}\``;

        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "➕ Добавить ШкЕТа в группу", url: `https://t.me/${botUser}?startgroup=true`, style: "success" }],
            [{ text: "🎒 Изменить класс обучения", callback_data: "change_grade_trigger", style: "primary" }]
          ]
        };

        await sendTelegramMessage(token, chatId, profileText, { reply_markup: inlineKeyboard, parse_mode: "Markdown" });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      // A. Handle Quiz Callback
      if (cbData.startsWith("quiz_")) {
        const parts = cbData.split("_");
        const quizId = parts[1];
        const selectedOptIdx = parseInt(parts[2]);

        const quiz = dbInstance.getQuizzes().find(q => q.id === quizId);
        if (!quiz) return;

        const isCorrect = selectedOptIdx === quiz.correctIndex;
        let notificationText = "";

        if (isCorrect) {
          notificationText = "🎉 Правильно!";
          dbInstance.addQuizResult(userId, user.username || user.firstName, quiz.points);
          
          // Re-evaluate Top 5 players and grant/revoke premium status
          syncTop5Premium();

          const praises = [
            "Хорош, бро! Мозг работает как швейцарские часики! 🔥",
            "Красава, уделал эту задачу как нефиг делать! 🧠⚡",
            "Вот это флекс знаниями! Преподы нервно курят в сторонке. 😎",
            "Мегахорош! Твой IQ официально пробил потолок! 🚀"
          ];
          const randomPraise = praises[Math.floor(Math.random() * praises.length)];

          await sendTelegramMessage(token, chatId, `✅ **Правильно!** Вы ответили верно и заработали **+${quiz.points} очков**!\n\n🎒 *ШкЕТ говорит:* ${randomPraise}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "📚 Следующий вопрос", callback_data: "cmd_quiz", style: "primary" }]
              ]
            }
          });
        } else {
          const correctOpt = quiz.options[quiz.correctIndex];
          notificationText = "❌ Неверно";

          const roasts = [
            "Мда, бро... С таким успехом домашку за тебя будет делать кот. 🐱",
            "Не угадал. Твоя оценка катится на дно, как и мои надежды. 📉",
            "Мимо! Кажется, кто-то спал на уроках. Проснись, салага! 🥱",
            "Увы, косяк! Твой мозг временно ушел на перезагрузку. 🔌"
          ];
          const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];

          await sendTelegramMessage(token, chatId, `❌ **Неправильно!**\n\nВерный ответ: *${correctOpt}*.\n\n🎒 *ШкЕТ говорит:* ${randomRoast}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "📚 Следующий вопрос", callback_data: "cmd_quiz", style: "primary" }]
              ]
            },
            parse_mode: "Markdown"
          });
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: notificationText })
        }).catch(() => {});

        // Edit markup to remove buttons
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
        }).catch(() => {});
        return;
      }

      // B. Handle Style Callback
      if (cbData.startsWith("style_")) {
        const styleId = cbData.replace("style_", "");
        const styles = dbInstance.getStyles();
        const style = styles.find(s => s.id === styleId);

        if (style) {
          dbInstance.updateUser(userId, { currentStyleId: styleId });
          await sendTelegramMessage(token, chatId, `🎭 **Стиль общения успешно изменен на "${style.name}"!**\n\nТеперь я буду отвечать тебе в этой роли.`);
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: "Стиль изменен!" })
        }).catch(() => {});

        // Edit markup to remove buttons
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
        }).catch(() => {});
        return;
      }

      // B3. Handle Grade Callback
      if (cbData.startsWith("set_grade_")) {
        const gradeValue = cbData.replace("set_grade_", "");
        let gradeName = "";
        if (gradeValue === "uni") {
          gradeName = "Университет 🎓";
        } else {
          gradeName = `${gradeValue} класс 🎒`;
        }

        dbInstance.updateUser(userId, { grade: gradeValue });

        await sendTelegramMessage(token, chatId, `✅ **Отлично! Твой уровень сохранен:** *${gradeName}*\n\nТеперь отправь мне фото домашнего задания (задачи, уравнения, примеры), и я помогу тебе разобраться!`);

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: "Класс сохранен!" })
        }).catch(() => {});

        // Edit markup to remove buttons
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
        }).catch(() => {});
        return;
      }

      // B4. Handle Change Grade Trigger Callback
      if (cbData === "change_grade_trigger") {
        const gradeKeyboard = {
          inline_keyboard: [
            [
              { text: "1 класс", callback_data: "set_grade_1" },
              { text: "2 класс", callback_data: "set_grade_2" },
              { text: "3 класс", callback_data: "set_grade_3" }
            ],
            [
              { text: "4 класс", callback_data: "set_grade_4" },
              { text: "5 класс", callback_data: "set_grade_5" },
              { text: "6 класс", callback_data: "set_grade_6" }
            ],
            [
              { text: "7 класс", callback_data: "set_grade_7" },
              { text: "8 класс", callback_data: "set_grade_8" },
              { text: "9 класс", callback_data: "set_grade_9" }
            ],
            [
              { text: "10 класс", callback_data: "set_grade_10" },
              { text: "11 класс", callback_data: "set_grade_11" },
              { text: "Университет 🎓", callback_data: "set_grade_uni" }
            ]
          ]
        };
        await sendTelegramMessage(token, chatId, "🎒 **Выбери свой класс или университет:**", {
          reply_markup: gradeKeyboard
        });
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id })
        }).catch(() => {});
        return;
      }

      // B2. Handle New Joke Callback
      if (cbData === "new_joke") {
        const joke = await generateTeacherJoke();
        const inlineKeyboard = {
          inline_keyboard: [
            [{ text: "🔥 Новый анекдот", callback_data: "new_joke" }]
          ]
        };
        await sendTelegramMessage(token, chatId, `😂 Анекдот от ШкЕТа:\n\n${joke}`, {
          reply_markup: inlineKeyboard
        });

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: "Держи свежий анекдот!" })
        }).catch(() => {});
        return;
      }

      // C. Handle Buy Callback
      if (cbData.startsWith("buy_")) {
        const plan = cbData.replace("buy_", "") as "base" | "mega" | "ultra";
        let amount = 199;
        if (plan === "mega") amount = 399;
        if (plan === "ultra") amount = 899;

        const payment = dbInstance.createPayment(userId, user.username || cb.from.first_name, plan, amount);
        const settings = dbInstance.getSettings();
        const isRealYookassa = settings.yookassaEnabled || false;
        const shopId = settings.yookassaShopId;
        const secretKey = settings.yookassaSecretKey;
        const botUser = settings.tgBotUsername || "NeuroShketBot";
        const returnUrl = `https://t.me/${botUser}`;

        let checkoutUrl = "";
        let errorMsg = "";

        if (isRealYookassa) {
          if (shopId && secretKey) {
            try {
              const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
              const response = await fetch("https://api.yookassa.ru/v3/payments", {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${auth}`,
                  "Idempotence-Key": payment.id,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  amount: {
                    value: `${amount}.00`,
                    currency: "RUB"
                  },
                  capture: true,
                  confirmation: {
                    type: "redirect",
                    return_url: returnUrl
                  },
                  description: `Оплата тарифа ${plan.toUpperCase()} для пользователя @${user.username || user.firstName} (ID: ${userId})`,
                  metadata: {
                    paymentId: payment.id
                  }
                })
              });

              if (response.ok) {
                const data: any = await response.json();
                if (data.confirmation && data.confirmation.confirmation_url) {
                  checkoutUrl = data.confirmation.confirmation_url;
                } else {
                  errorMsg = "Не удалось получить платежную ссылку от ЮKassa.";
                }
              } else {
                const errBody = await response.text();
                errorMsg = `Ошибка API ЮKassa: ${response.status}`;
                addSystemLog("error", "api", `Ошибка создания платежа в ЮKassa: ${errBody}`);
              }
            } catch (err: any) {
              errorMsg = `Не удалось связаться с ЮKassa: ${err.message}`;
              addSystemLog("error", "system", `Исключение при запросе к ЮKassa: ${err.message}`);
            }
          } else {
            errorMsg = "ЮKassa активна, но Shop ID или Секретный Ключ не настроены.";
          }
        }

        if (isRealYookassa && checkoutUrl) {
          const paymentKeyboard = {
            inline_keyboard: [
              [{ text: "💳 Перейти к оплате", url: checkoutUrl }]
            ]
          };

          await sendTelegramMessage(token, chatId, `💎 **Счет на оплату тарифа "${plan.toUpperCase()}" создан!**\n\nСумма к оплате: **${amount} ₽**\n\nНажмите кнопку ниже, чтобы перейти на официальный сайт ЮKassa для безопасной оплаты. После успешного совершения платежа премиум будет мгновенно активирован!`, {
            reply_markup: paymentKeyboard
          });
        } else {
          let message = `💎 **Счет на оплату тарифа "${plan.toUpperCase()}" создан!**\n\nСумма к оплате: **${amount} ₽**\n\n`;
          if (isRealYookassa && errorMsg) {
            message += `⚠️ **Ошибка платежной системы:**\n${errorMsg}\n\nПожалуйста, обратитесь к администратору для ручной выдачи тарифа.`;
          } else {
            message += `⚙️ **Платежная система временно недоступна.**\n\nВ данный момент платежные ссылки отключены. Обратитесь к администратору для подключения тарифа.`;
          }
          await sendTelegramMessage(token, chatId, message);
        }

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id, text: "Счет сформирован!" })
        }).catch(() => {});
        return;
      }
    }
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    addSystemLog("error", "webhook", `Критическая ошибка обработки вебхука: ${err.message}`, {
      error: err.message,
      stack: err.stack
    });
  }
});

  // ==========================================
  // BOT SIMULATOR ENDPOINTS (DEPRECATED FOR EMULATOR, KEPT FOR BACKWARD COMPATIBILITY)
  // ==========================================

  // Initialize bot user
  app.post("/api/bot/init", (req, res) => {
    const { id, username, firstName, lastName, referrerId, campaignId } = req.body;
    if (!id || !username) {
      return res.status(400).json({ error: "id and username are required" });
    }

    let user = dbInstance.findUser(id);
    let isNew = false;

    if (!user) {
      isNew = true;
      // Handle referral or campaign tracking
      let referredBy: string | null = null;
      if (referrerId && referrerId !== id) {
        const referrer = dbInstance.findUser(referrerId);
        if (referrer) {
          referredBy = referrerId;
          dbInstance.updateUser(referrerId, {
            referralsCount: (referrer.referralsCount || 0) + 1,
          });
          // Check if referrals hit 5 for premium award
          const updatedReferrer = dbInstance.findUser(referrerId);
          if (updatedReferrer && updatedReferrer.referralsCount >= 5 && updatedReferrer.referralsCount % 5 === 0) {
            // award 3 premium days
            const currentExpiry = updatedReferrer.premiumUntil ? new Date(updatedReferrer.premiumUntil).getTime() : Date.now();
            const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
            const newExpiry = new Date(baseTime + 3 * 24 * 3600 * 1000).toISOString();
            dbInstance.updateUser(referrerId, {
              isPremium: true,
              premiumType: updatedReferrer.premiumType || "base",
              premiumUntil: newExpiry,
            });
          }
        }
      }

      // Track Campaign
      if (campaignId) {
        dbInstance.updateCampaignStats(campaignId, {
          uniqueUsers: 1, // Will increment inside DB function
        });
      }

      user = dbInstance.createUser({
        id,
        username,
        firstName,
        lastName,
        referredBy,
        gender: Math.random() > 0.5 ? "M" : "F", // Simulate gender split
        onboardingCompleted: false,
      });
    }

    // Update campaign clicks/onboarding
    if (campaignId) {
      const campaign = dbInstance.getCampaigns().find((c) => c.id === campaignId);
      if (campaign) {
        dbInstance.updateCampaignStats(campaignId, {
          clicks: (campaign.clicks || 0) + 1,
          completedOnboarding: (campaign.completedOnboarding || 0) + (isNew ? 1 : 0),
        });
      }
    }

    res.json({ user, isNew });
  });

  // Verify channel subscription
  app.post("/api/bot/check-sub", (req, res) => {
    const { userId, subscribed } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (subscribed) {
      dbInstance.updateUser(userId, { onboardingCompleted: true });
    }
    res.json({ onboardingCompleted: subscribed });
  });

  // Send message to the bot
  app.post("/api/bot/chat", async (req, res) => {
    const { userId, text } = req.body;
    if (!userId || !text) return res.status(400).json({ error: "userId and text are required" });

    const user = getUserWithPremiumCheck(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isBlocked) return res.json({ text: "⛔️ Ваш аккаунт заблокирован администратором.", isBlocked: true });

    const settings = dbInstance.getSettings();

    // Enforce limits for free users
    if (!user.isPremium) {
      // Reset limit if new day
      const lastMsgDate = user.lastMessageAt ? new Date(user.lastMessageAt).toDateString() : "";
      const today = new Date().toDateString();
      let msgCount = user.messagesToday;

      if (lastMsgDate !== today) {
        msgCount = 0;
      }

      if (msgCount >= settings.freeMessagesLimit) {
        return res.json({
          text: `⚠️ Превышен бесплатный лимит в ${settings.freeMessagesLimit} сообщений в день!\n\nКупите подписку /buy, чтобы получить бесконечное общение, увеличенный контекст и новые стили!`,
          limitExceeded: true,
        });
      }

      dbInstance.updateUser(userId, {
        messagesToday: msgCount + 1,
        lastMessageAt: new Date().toISOString(),
      });
    }

    // Chat
    const responseText = await chatWithBot(userId, text);

    // Look up dynamic advertisements triggered during chat (position: mid)
    let adToShow = null;
    if (shouldShowAd(user)) {
      adToShow = getAdForPosition("mid", userId);
    } else {
      dbInstance.updateUser(userId, {
        messagesSinceLastAd: (user.messagesSinceLastAd || 0) + 1,
      });
    }

    res.json({ text: responseText, ad: adToShow });
  });

  // Submit HW Photo (GDZ Solver)
  app.post("/api/bot/gdz", async (req, res) => {
    const { userId, image } = req.body;
    if (!userId || !image) return res.status(400).json({ error: "userId and image are required" });

    const user = getUserWithPremiumCheck(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isBlocked) return res.json({ text: "⛔️ Ваш аккаунт заблокирован администратором.", isBlocked: true });

    // Auto-assign default grade if missing
    if (!user.grade) {
      dbInstance.updateUser(userId, { grade: "11" });
    }

    const settings = dbInstance.getSettings();

    // Check GDZ Limits
    if (!user.isPremium) {
      const today = new Date().toDateString();
      const lastMsgDate = user.lastMessageAt ? new Date(user.lastMessageAt).toDateString() : "";
      let gdzCount = user.gdzToday;

      if (lastMsgDate !== today) {
        gdzCount = 0;
      }

      if (gdzCount >= settings.freeGdzLimit) {
        return res.json({
          text: `⚠️ Превышен бесплатный лимит ГДЗ: ${settings.freeGdzLimit} задач в день!\n\nКупите подписку через /buy для полного безлимита на решение уроков!`,
          limitExceeded: true,
        });
      }

      dbInstance.updateUser(userId, {
        gdzToday: gdzCount + 1,
        lastMessageAt: new Date().toISOString(),
      });
    }

    // Solve GDZ
    const solution = await solveHomework(image);

    // Track active GDZ ad (position: gdz)
    let adToShow = null;
    if (shouldShowAd(user)) {
      adToShow = getAdForPosition("gdz", userId);
    } else {
      dbInstance.updateUser(userId, {
        messagesSinceLastAd: (user.messagesSinceLastAd || 0) + 1,
      });
    }

    res.json({ text: solution, ad: adToShow });
  });

  // Get daily quiz questions
  app.get("/api/bot/quiz", (req, res) => {
    const quizzes = dbInstance.getQuizzes();
    res.json(quizzes);
  });

  // Submit quiz answer
  app.post("/api/bot/quiz/submit", (req, res) => {
    const { userId, quizId, correct } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (correct) {
      const quiz = dbInstance.getQuizzes().find((q) => q.id === quizId);
      const points = quiz ? quiz.points : 10;
      dbInstance.addQuizResult(userId, user.username || user.firstName, points);
      return res.json({ success: true, points });
    }
    res.json({ success: false });
  });

  // Get scoreboard ratings
  app.get("/api/bot/quiz/ratings", (req, res) => {
    const results = dbInstance.getQuizResults();
    // Sum points per user
    const totals: { [username: string]: number } = {};
    results.forEach((r) => {
      totals[r.username] = (totals[r.username] || 0) + r.points;
    });
    const sorted = Object.entries(totals)
      .map(([username, points]) => ({ username, points }))
      .sort((a, b) => b.points - a.points);
    res.json(sorted);
  });

  // Get teacher joke
  app.get("/api/bot/joke", async (req, res) => {
    const joke = await generateTeacherJoke();
    res.json({ text: joke });
  });

  // Get roast/insult
  app.post("/api/bot/roast", async (req, res) => {
    const { name } = req.body;
    const roast = await insultByName(name || "Двоечник");
    res.json({ text: roast });
  });

  // Create payment transaction
  app.post("/api/bot/buy", (req, res) => {
    const { userId, plan } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let amount = 199;
    if (plan === "mega") amount = 399;
    if (plan === "ultra") amount = 899;

    const payment = dbInstance.createPayment(userId, user.username || user.firstName, plan, amount);
    // Return mock YooKassa link
    res.json({
      paymentId: payment.id,
      amount,
      paymentUrl: `${process.env.APP_URL || "http://localhost:3000"}/checkout/${payment.id}`,
    });
  });

  // Confirm payment via simulated Webhook or Real Yookassa Webhook
  app.post("/api/bot/webhook/yookassa", (req, res) => {
    let paymentId = req.body.paymentId;
    let status = req.body.status;

    // Check if it is a real Yookassa event notification
    if (req.body.event === "payment.succeeded" && req.body.object) {
      status = "succeeded";
      if (req.body.object.metadata && req.body.object.metadata.paymentId) {
        paymentId = req.body.object.metadata.paymentId;
      }
    }

    if (!paymentId) return res.status(400).json({ error: "paymentId is required" });

    if (status === "succeeded") {
      const payment = dbInstance.succeedPayment(paymentId);
      if (payment) {
        // Increment campaign premium stats
        dbInstance.getCampaigns().forEach((c) => {
          if (Math.random() > 0.4) {
            dbInstance.updateCampaignStats(c.id, {
              premiumPurchased: (c.premiumPurchased || 0) + 1,
            });
          }
        });

        // Notify the user in Telegram
        const settings = dbInstance.getSettings();
        const token = settings.tgBotToken;
        if (token && payment.userId) {
          sendTelegramMessage(token, Number(payment.userId), `🎉 **Поздравляем! Ваш платёж успешно подтвержден!**\n\nТариф **${payment.plan.toUpperCase()}** успешно активирован!\n\nВсе лимиты на решение ГДЗ и сообщения ИИ сняты. Спасибо за подписку!`)
            .catch((err) => console.error("Failed to notify user about successful payment via telegram:", err));
        }

        addSystemLog("info", "webhook", `Платеж ${paymentId} на сумму ${payment.amount} руб. успешно подтвержден.`);
        return res.json({ success: true, payment });
      }
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({ success: false, status });
  });

  // Simulate friend invitations (instantly add 5 friends to earn premium)
  app.post("/api/bot/simulate-friends", (req, res) => {
    const { userId } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Register 5 fake friends
    for (let i = 0; i < 5; i++) {
      const friendId = "sim_" + Math.random().toString(36).substr(2, 9);
      dbInstance.createUser({
        id: friendId,
        username: `friend_sim_${Math.random().toString(36).substr(2, 5)}`,
        firstName: `Кореш${i + 1}`,
        referredBy: userId,
        gender: i % 2 === 0 ? "M" : "F",
        onboardingCompleted: true,
      });
    }

    // Increment original user referrals count
    dbInstance.updateUser(userId, {
      referralsCount: (user.referralsCount || 0) + 5,
    });

    // Award 3 premium days (since referralsCount increased by 5)
    const updatedUser = dbInstance.findUser(userId)!;
    const currentExpiry = updatedUser.premiumUntil ? new Date(updatedUser.premiumUntil).getTime() : Date.now();
    const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
    const newExpiry = new Date(baseTime + 3 * 24 * 3600 * 1000).toISOString();

    dbInstance.updateUser(userId, {
      isPremium: true,
      premiumType: updatedUser.premiumType || "base",
      premiumUntil: newExpiry,
    });

    res.json({ success: true, referralsCount: updatedUser.referralsCount, user: updatedUser });
  });

  // Support ad click tracking
  app.post("/api/bot/ad-click", (req, res) => {
    const { adId, campaignId } = req.body;
    if (adId) {
      const ad = dbInstance.getAds().find((a) => a.id === adId);
      if (ad) {
        dbInstance.updateAd(adId, { clicks: ad.clicks + 1 });
      }
    }
    if (campaignId) {
      const camp = dbInstance.getCampaigns().find((c) => c.id === campaignId);
      if (camp) {
        dbInstance.updateCampaignStats(campaignId, { clicks: camp.clicks + 1 });
      }
    }
    res.json({ success: true });
  });

  // Support custom prompt setting
  app.post("/api/bot/custom-prompt", (req, res) => {
    const { userId, prompt } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.isPremium || user.premiumType === "base") {
      return res.status(403).json({ error: "Custom prompts only allowed for Mega and Ultra plans!" });
    }

    dbInstance.updateUser(userId, { customPrompt: prompt });
    res.json({ success: true, customPrompt: prompt });
  });

  // Reset chatbot style
  app.post("/api/bot/select-style", (req, res) => {
    const { userId, styleId } = req.body;
    const user = dbInstance.findUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    dbInstance.updateUser(userId, { currentStyleId: styleId });
    res.json({ success: true, currentStyleId: styleId });
  });

  // Clear simulated chatbot chat logs
  app.post("/api/bot/clear-history", (req, res) => {
    const { userId } = req.body;
    dbInstance.clearMessages(userId);
    res.json({ success: true });
  });

  // ==========================================
  // ADMINISTRATIVE PANEL ENDPOINTS
  // ==========================================

  // Get system logs
  app.get("/api/admin/logs", (req, res) => {
    res.json(systemLogs);
  });

  // Clear system logs
  app.post("/api/admin/logs/clear", (req, res) => {
    systemLogs.length = 0;
    addSystemLog("info", "system", "Системные логи очищены администратором");
    res.json({ success: true });
  });

  // Dashboard stats
  app.get("/api/admin/stats", (req, res) => {
    const users = dbInstance.getUsers();
    const payments = dbInstance.getPayments().filter((p) => p.status === "succeeded");

    const totalUsers = users.length;
    const premiumUsers = users.filter((u) => u.isPremium).length;
    const blockedUsers = users.filter((u) => u.isBlocked).length;
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    // Styles popularity (count of users using each style)
    const styleCount: { [id: string]: number } = {};
    users.forEach((u) => {
      styleCount[u.currentStyleId] = (styleCount[u.currentStyleId] || 0) + 1;
    });

    // Solve GDZ stats - sum up daily limits or total actions
    const totalGdzSolved = users.reduce((sum, u) => sum + u.gdzToday, 0) + 150; // add mock base historical solved
    const totalMessagesChat = users.reduce((sum, u) => sum + u.messagesToday, 0) + 1200; // add mock base historical chats

    // DAU/MAU stats (Simulated based on registered users)
    const dau = Math.min(totalUsers, Math.max(2, Math.floor(totalUsers * 0.45)));
    const mau = Math.min(totalUsers, Math.max(5, Math.floor(totalUsers * 0.85)));

    res.json({
      totalUsers,
      premiumUsers,
      blockedUsers,
      totalRevenue,
      styleCount,
      totalGdzSolved,
      totalMessagesChat,
      dau,
      mau,
    });
  });

  // Get/Search Users
  app.get("/api/admin/users", (req, res) => {
    const { search } = req.query;
    let users = dbInstance.getUsers();

    if (search) {
      const q = (search as string).toLowerCase();
      users = users.filter(
        (u) =>
          u.id.includes(q) ||
          (u.username && u.username.toLowerCase().includes(q)) ||
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q)
      );
    }
    res.json(users);
  });

  // Modify User (block/unblock, grant premium)
  app.post("/api/admin/users/update", (req, res) => {
    const { id, isBlocked, isPremium, premiumType, premiumUntil } = req.body;
    const user = dbInstance.findUser(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const updates: Partial<DbUser> = {};
    if (isBlocked !== undefined) updates.isBlocked = isBlocked;
    if (isPremium !== undefined) {
      updates.isPremium = isPremium;
      updates.premiumType = isPremium ? premiumType || "base" : null;
      updates.premiumUntil = isPremium ? premiumUntil || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null;
    }

    const updated = dbInstance.updateUser(id, updates);
    res.json(updated);
  });

  // Get Settings
  app.get("/api/admin/settings", (req, res) => {
    res.json(dbInstance.getSettings());
  });

  // Update Settings
  app.post("/api/admin/settings", (req, res) => {
    const updated = dbInstance.updateSettings(req.body);
    res.json(updated);
  });

  // Test AI Connection
  app.post("/api/admin/test-ai", async (req, res) => {
    try {
      const { provider, config } = req.body;
      if (!provider) {
        return res.status(400).json({ error: "Provider is required" });
      }
      const result = await testAiConnection(provider, config || {});
      res.json({ success: true, result });
    } catch (err: any) {
      console.error("Test AI Connection error:", err);
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Get Styles
  app.get("/api/admin/styles", (req, res) => {
    res.json(dbInstance.getStyles());
  });

  // Add Style
  app.post("/api/admin/styles", (req, res) => {
    const { id, name, description, prompt } = req.body;
    if (!id || !name || !prompt) {
      return res.status(400).json({ error: "id, name, and prompt are required" });
    }
    const newStyle = dbInstance.addStyle({ id, name, description: description || "", prompt });
    res.json(newStyle);
  });

  // Update Style
  app.post("/api/admin/styles/update", (req, res) => {
    const { id, name, description, prompt } = req.body;
    const updated = dbInstance.updateStyle(id, { name, description, prompt });
    if (!updated) return res.status(404).json({ error: "Style not found" });
    res.json(updated);
  });

  // Delete Style
  app.delete("/api/admin/styles/:id", (req, res) => {
    const success = dbInstance.deleteStyle(req.params.id);
    res.json({ success });
  });

  // Get Ads
  app.get("/api/admin/ads", (req, res) => {
    res.json(dbInstance.getAds());
  });

  // Add/Update Ads
  app.post("/api/admin/ads", (req, res) => {
    const { id, url, text, position, isActive } = req.body;
    if (id) {
      const updated = dbInstance.updateAd(id, { url, text, position, isActive });
      return res.json(updated);
    } else {
      const newAd = dbInstance.createAd({
        id: "ad_" + Math.random().toString(36).substr(2, 9),
        url,
        text,
        position,
        isActive: isActive !== undefined ? isActive : true,
      });
      return res.json(newAd);
    }
  });

  // Delete Ad
  app.delete("/api/admin/ads/:id", (req, res) => {
    const success = dbInstance.deleteAd(req.params.id);
    res.json({ success });
  });

  // Get campaigns/referral link statistics
  app.get("/api/admin/campaigns", (req, res) => {
    res.json(dbInstance.getCampaigns());
  });

  // Add Campaign Link
  app.post("/api/admin/campaigns", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Campaign name/ID is required" });
    const exists = dbInstance.getCampaigns().find((c) => c.id === id);
    if (exists) return res.status(400).json({ error: "Campaign name already exists" });

    const newCamp = dbInstance.createCampaign(id);
    res.json(newCamp);
  });

  // Get Payments list
  app.get("/api/admin/payments", (req, res) => {
    res.json(dbInstance.getPayments());
  });

  // Get Broadcast newsletters
  app.get("/api/admin/broadcasts", (req, res) => {
    res.json(dbInstance.getBroadcasts());
  });

  // Create Broadcast newsletter
  app.post("/api/admin/broadcasts", (req, res) => {
    const { text, mediaUrl, buttonText, buttonUrl, buttonStyle, buttonEmoji } = req.body;
    if (!text) return res.status(400).json({ error: "Broadcast text is required" });

    const cleanedMediaUrl = mediaUrl ? ensureValidUrl(mediaUrl) : null;
    const cleanedButtonUrl = buttonUrl ? ensureValidUrl(buttonUrl) : null;

    const newBroad = dbInstance.createBroadcast({ 
      text, 
      mediaUrl: cleanedMediaUrl, 
      buttonText: buttonText || null, 
      buttonUrl: cleanedButtonUrl,
      buttonStyle: buttonStyle || "default",
      buttonEmoji: buttonEmoji || ""
    });
    res.json(newBroad);
  });

  // Start sending broadcast newsletter
  app.post("/api/admin/broadcasts/send", (req, res) => {
    const { id } = req.body;
    const broad = dbInstance.getBroadcasts().find((b) => b.id === id);
    if (!broad) return res.status(404).json({ error: "Broadcast not found" });

    const allUsers = dbInstance.getUsers().filter((u) => !u.isBlocked);
    const totalTarget = allUsers.length;

    dbInstance.updateBroadcast(id, {
      status: "sending",
      totalTarget,
      sentCount: 0,
      errorCount: 0,
    });

    // Simulate sending chunk-by-chunk with a quick interval so the admin can monitor
    let sent = 0;
    let errors = 0;
    const interval = setInterval(() => {
      // Check if broadcast was stopped in between
      const currentBroad = dbInstance.getBroadcasts().find((b) => b.id === id);
      if (!currentBroad || currentBroad.status === "stopped") {
        clearInterval(interval);
        return;
      }

      if (sent + errors >= totalTarget) {
        clearInterval(interval);
        dbInstance.updateBroadcast(id, { status: "completed" });
        return;
      }

      // Send to 1 user
      const currentUser = allUsers[sent + errors];
      const settings = dbInstance.getSettings();
      const token = settings.tgBotToken;

      if (token && /^\d+$/.test(currentUser.id)) {
        const extra: any = {};
        if (currentBroad.buttonText && currentBroad.buttonUrl) {
          const btnTextWithEmoji = currentBroad.buttonEmoji 
            ? `${currentBroad.buttonEmoji} ${currentBroad.buttonText}`
            : currentBroad.buttonText;
          extra.reply_markup = {
            inline_keyboard: [
              [{ 
                text: btnTextWithEmoji, 
                url: ensureValidUrl(currentBroad.buttonUrl)
              }]
            ]
          };
        }

        // If mediaUrl is specified, send as sendPhoto with text as caption
        const promise = currentBroad.mediaUrl
          ? sendTelegramPhoto(token, currentUser.id, ensureValidUrl(currentBroad.mediaUrl), currentBroad.text, extra)
          : sendTelegramMessage(token, currentUser.id, currentBroad.text, extra);

        promise
          .then((response) => {
            if (response && response.ok) {
              sent++;
            } else {
              errors++;
            }
            dbInstance.updateBroadcast(id, {
              sentCount: sent,
              errorCount: errors,
            });
          })
          .catch(() => {
            errors++;
            dbInstance.updateBroadcast(id, {
              sentCount: sent,
              errorCount: errors,
            });
          });
      } else {
        // Fallback for simulation or mock users
        if (Math.random() > 0.05) {
          sent++;
          // Log newsletter message to simulated user chat history
          const btnTextWithEmoji = currentBroad.buttonEmoji 
            ? `${currentBroad.buttonEmoji} ${currentBroad.buttonText}`
            : currentBroad.buttonText;
          dbInstance.saveMessage(
            currentUser.id,
            "model",
            `📢 **РАССЫЛКА:**\n\n` +
              (currentBroad.mediaUrl ? `🖼️ [Изображение](${currentBroad.mediaUrl})\n\n` : "") +
              `${currentBroad.text}` +
              (currentBroad.buttonText ? `\n\n📎 [${btnTextWithEmoji}](${currentBroad.buttonUrl})` : "")
          );
        } else {
          errors++;
        }
        dbInstance.updateBroadcast(id, {
          sentCount: sent,
          errorCount: errors,
        });
      }
    }, 400); // Send 1 message every 400ms

    res.json({ success: true, broadcast: broad });
  });

  // Stop sending broadcast newsletter
  app.post("/api/admin/broadcasts/stop", (req, res) => {
    const { id } = req.body;
    const updated = dbInstance.updateBroadcast(id, { status: "stopped" });
    if (!updated) return res.status(404).json({ error: "Broadcast not found" });
    res.json(updated);
  });

  // System statistics (CPU, RAM, Disk, Backups)
  app.get("/api/admin/system", (req, res) => {
    // Generate actual server specifications dynamically
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const loadAvg = os.loadavg();

    res.json({
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Intel Xeon",
        loadPercent: Math.round((loadAvg[0] / os.cpus().length) * 100) || 12,
      },
      ram: {
        totalGb: (totalMemory / 1024 / 1024 / 1024).toFixed(1),
        usedGb: (usedMemory / 1024 / 1024 / 1024).toFixed(1),
        percent: Math.round((usedMemory / totalMemory) * 100),
      },
      disk: {
        totalGb: "45.0",
        usedGb: "12.4",
        percent: 27,
      },
      serverUptime: Math.round(os.uptime()),
      dbSizeKb: (JSON.stringify(dbInstance.getUsers()).length / 1024).toFixed(1),
    });
  });

  // Export statistics as CSV
  app.get("/api/admin/export/users", (req, res) => {
    const users = dbInstance.getUsers();
    let csv = "ID,Username,First Name,Last Name,Is Premium,Plan,Premium Expiry,Referrals,Registered At,Blocked\n";
    users.forEach((u) => {
      csv += `"${u.id}","${u.username || ""}","${u.firstName}","${u.lastName}",${u.isPremium},"${u.premiumType || ""}","${u.premiumUntil || ""}",${u.referralsCount},"${u.registeredAt}",${u.isBlocked}\n`;
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=neuro_shket_users.csv");
    res.send(csv);
  });

  // Trigger PostgreSQL backup dump
  app.get("/api/admin/export/postgres", (req, res) => {
    const dump = dbInstance.getPostgresDump();
    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", "attachment; filename=neuro_shket_postgres_dump.sql");
    res.send(dump);
  });

  // Get JSON database dump
  app.get("/api/admin/export/json", (req, res) => {
    const fileContent = path.join(process.cwd(), "db.json");
    res.sendFile(fileContent);
  });

  // ==========================================
  // VITE & STATIC FILES MIDDLEWARE
  // ==========================================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NeuroShkET App Server] Running on http://localhost:${PORT}`);
    // Start background polling for TG Bot updates if token exists
    startTelegramPolling().catch((err) => {
      console.error("Failed to start initial Telegram polling:", err);
    });
  });
}

startServer();
