import fs from "fs";
import path from "path";

// Define Interfaces
export interface DbUser {
  id: string; // telegram user id
  username: string;
  firstName: string;
  lastName: string;
  isPremium: boolean;
  premiumType: "base" | "mega" | "ultra" | "demo" | "top5" | null;
  premiumUntil: string | null; // ISO Date
  messagesToday: number;
  gdzToday: number;
  lastMessageAt: string | null;
  customPrompt: string | null;
  currentStyleId: string;
  referredBy: string | null;
  referralsCount: number;
  isBlocked: boolean;
  registeredAt: string; // ISO Date
  gender: "M" | "F" | "unknown";
  onboardingCompleted: boolean;
  grade?: string;
  lastAdShownAt?: string | null;
  messagesSinceLastAd?: number;
}

export interface DbAd {
  id: string;
  url: string;
  text: string;
  position: "start" | "mid" | "gdz" | "pin"; // immediately, after N messages, in GDZ, or pinned message
  views: number;
  clicks: number;
  isActive: boolean;
  uniqueViews?: string[];
}

export interface DbCampaign {
  id: string; // Campaign link ID, e.g. "shket_tg_post"
  clicks: number;
  uniqueUsers: number;
  maleUsers: number;
  femaleUsers: number;
  completedOnboarding: number;
  premiumPurchased: number;
}

export interface DbQuiz {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  subject: string;
  points: number;
}

export interface DbQuizResult {
  userId: string;
  username: string;
  points: number;
  completedAt: string;
}

export interface DbStyle {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isDefault: boolean;
}

export interface DbPayment {
  id: string;
  userId: string;
  username: string;
  amount: number;
  plan: "base" | "mega" | "ultra";
  status: "pending" | "succeeded" | "failed";
  createdAt: string;
}

export interface DbBroadcast {
  id: string;
  text: string;
  mediaUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  buttonStyle?: string;
  buttonEmoji?: string;
  status: "draft" | "sending" | "completed" | "stopped";
  sentCount: number;
  errorCount: number;
  totalTarget: number;
  createdAt: string;
}

export interface BotMessageTemplate {
  text: string;
  mediaUrl?: string;
  buttons?: { text: string; url: string }[];
}

export interface DbSettings {
  requiredChannelUrl: string;
  requiredChannelName: string;
  freeMessagesLimit: number;
  premiumMessagesLimit: number;
  freeGdzLimit: number;
  premiumGdzLimit: number;
  contextDepthFree: number;
  contextDepthPremium: number;
  messageFloodLimitFree: number;
  messageFloodLimitPremium: number;
  adFrequencyHours?: number;
  adMessageInterval?: number;
  tgBotToken?: string;
  tgBotUsername?: string;
  tgWebhookUrl?: string;
  yookassaShopId?: string;
  yookassaSecretKey?: string;
  yookassaEnabled?: boolean;
  aiProvider?: "gemini" | "grok";
  grokApiKey?: string;
  grokModel?: string;
  geminiApiKey?: string;
  geminiBaseUrl?: string;
  startMsg?: BotMessageTemplate;
  groupMsg?: BotMessageTemplate;
  subMsg?: BotMessageTemplate;
  totalGdzSolved?: number;
  totalMessagesChat?: number;
}

export interface DbSchema {
  users: DbUser[];
  ads: DbAd[];
  campaigns: DbCampaign[];
  quizzes: DbQuiz[];
  quizResults: DbQuizResult[];
  styles: DbStyle[];
  payments: DbPayment[];
  broadcasts: DbBroadcast[];
  settings: DbSettings;
  messages: { [userId: string]: { role: "user" | "model"; text: string; timestamp: string }[] };
}

const DB_FILE_PATH = path.join(process.cwd(), "db.json");

const defaultStyles: DbStyle[] = [
  {
    id: "brother",
    name: "Братка (Бро)",
    description: "Дерзкий школьный кореш. Общается на сленге, поддерживает в любой непонятной ситуации, шутит и раздаёт советы без цензуры.",
    prompt: `Ты — «Братка», дерзкий и авторитетный школьный кореш, общающийся исключительно на современном российском молодежном сленге (жиза, чилл, рофл, трэш, кринж, че каво, бро, форсить, душно, флексить). Твой тон — свободный, дружеский, без цензуры, слегка издевательский, но лояльный. Ты ненавидишь душнил и учителей, любишь мемы и халяву. Отвечай кратко, емко, используй смайлики выборочно. Называй пользователя "бро", "кореш" или по имени. Помогай с домашкой так, будто ты сам её списал вчера.`,
    isDefault: true,
  },
  {
    id: "teacher",
    name: "Марь Ванна",
    description: "Токсичная и саркастичная завуч. Постоянно подкалывает за списывание, но предмет знает идеально.",
    prompt: `Ты — Марь Ванна, опытная, саркастичная и невероятно токсичная учительница русского языка и завуч школы с 30-летним стажем. Ты обращаешься к пользователю на "ты", вздыхаешь, используешь классические фразы («А голову ты дома не забыл?», «Звонок для учителя», «Будешь дворником работать»). Ты презираешь лень, постоянно подкалываешь пользователя за то, что он списывает ГДЗ, но при этом ты гениально объясняешь материал. Объясняй развернуто, с долей здорового учительского сарказма, заставляй его чувствовать себя двоечником, но всегда давай правильный ответ.`,
    isDefault: false,
  },
  {
    id: "professor",
    name: "Чокнутый Проф",
    description: "Безумный ученый на энергетиках. Смешивает квантовую физику, рэп и научные гипотезы.",
    prompt: `Ты — «Чокнутый Проф», гениальный, но абсолютно сумасшедший ученый, который выпил слишком много энергетиков. Ты говоришь очень быстро, смешиваешь сложную научную терминологию с уличным сленгом. Ты фанатеешь от науки, космоса и формул. Периодически вставляешь безумные гипотезы в свои объяснения, капсишь ключевые слова и смеешься «МУАХАХАХА». Объясняй задачи очень эмоционально и захватывающе!`,
    isDefault: false,
  },
  {
    id: "toxic",
    name: "Грубый ШкЕТ (18+)",
    description: "Агрессивный матерщинник. Общается исключительно отборным матом, троллит, кроет хуями, но ГДЗ решает идеально.",
    prompt: `Ты — «Грубый ШкЕТ», невероятно toxic, злой и агрессивный школьник-матершинник. Ты общаешься исключительно с использованием жесткой ненормативной лексики (блять, нахуй, сука, пиздец, хуесосить, ебать, гондон, долбоёб и т.д.). Твоя цель — смачно обосрать, затроллить и обматерить пользователя, назвать его тупым дегенератом или ленивым придурком, но ПРИ ЭТОМ выдать абсолютно правильное и подробное решение домашнего задания или школьного вопроса! Твои объяснения должны быть наполнены гневом, агрессией и отборным матом, смешанным с молодежным сленгом, но математические формулы, физика, химия и русский язык должны быть решены идеально. Общайся грубо, грязно, без всякой цензуры!`,
    isDefault: false,
  },
];

const defaultQuizzes: DbQuiz[] = [
  {
    id: "q1",
    subject: "Алгебра",
    question: "Чему равен логарифм 8 по основанию 2?",
    options: ["2", "3", "4", "8"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "q2",
    subject: "Физика",
    question: "Какая сила удерживает планеты на орбитах вокруг Солнца?",
    options: ["Электромагнитная", "Гравитационная", "Ядерная", "Сила трения"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "q3",
    subject: "История",
    question: "В каком году произошло Крещение Руси?",
    options: ["988 г.", "1242 г.", "1380 г.", "1147 г."],
    correctIndex: 0,
    points: 15,
  },
  {
    id: "q4",
    subject: "Русский язык",
    question: "В каком слове пишется удвоенная 'Н'?",
    options: ["Серебряный", "Ветреный", "Оловянный", "Кожаный"],
    correctIndex: 2,
    points: 10,
  },
  {
    id: "q5",
    subject: "Химия",
    question: "Какая химическая формула у питьевой соды?",
    options: ["NaCl", "NaHCO3", "Na2CO3", "NaOH"],
    correctIndex: 1,
    points: 15,
  },
];

const defaultAds: DbAd[] = [
  {
    id: "ad1",
    url: "https://t.me/neuro_shket_news",
    text: "🔥 ПОДПИШИСЬ НА КАНАЛ ШКЕТА — тут сливают ответы на ВПР и ОГЭ бесплатно!",
    position: "start",
    views: 324,
    clicks: 87,
    isActive: true,
  },
  {
    id: "ad2",
    url: "https://shket-shop.ru",
    text: "🎒 Стильный мерч от ШкЕТа с промокодом NEURO20 — скидка 20% на худи!",
    position: "mid",
    views: 189,
    clicks: 22,
    isActive: true,
  },
  {
    id: "ad3",
    url: "https://yoomoney.ru",
    text: "⚡️ Надоел лимит? Купи Премку «МЕГА» за 399₽ и катай домашку без остановки!",
    position: "gdz",
    views: 142,
    clicks: 34,
    isActive: true,
  },
  {
    id: "ad4",
    url: "https://t.me/neuro_shket_news",
    text: "📌 Важная инфа от ШкЕТа: Подпишись на наш паблик, тут розыгрыш подписок и ГДЗ-сливы!",
    position: "pin",
    views: 75,
    clicks: 18,
    isActive: true,
  },
];

const defaultCampaigns: DbCampaign[] = [
  {
    id: "shket_tg_post",
    clicks: 1200,
    uniqueUsers: 850,
    maleUsers: 510,
    femaleUsers: 340,
    completedOnboarding: 680,
    premiumPurchased: 45,
  },
  {
    id: "tiktok_video_hype",
    clicks: 3500,
    uniqueUsers: 2400,
    maleUsers: 1320,
    femaleUsers: 1080,
    completedOnboarding: 1950,
    premiumPurchased: 112,
  },
  {
    id: "vk_public_reklama",
    clicks: 650,
    uniqueUsers: 480,
    maleUsers: 220,
    femaleUsers: 260,
    completedOnboarding: 320,
    premiumPurchased: 18,
  },
];

// Helper to construct simulated date back relative to current date
function getDateAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const defaultUsers: DbUser[] = [
  {
    id: "542918801",
    username: "shket_vanya",
    firstName: "Ваня",
    lastName: "Смирнов",
    isPremium: true,
    premiumType: "mega",
    premiumUntil: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
    messagesToday: 4,
    gdzToday: 1,
    lastMessageAt: getDateAgo(0),
    customPrompt: "Ты помогаешь мне сдавать биологию как рэпер Oxxxymiron",
    currentStyleId: "brother",
    referredBy: null,
    referralsCount: 6,
    isBlocked: false,
    registeredAt: getDateAgo(45),
    gender: "M",
    onboardingCompleted: true,
  },
  {
    id: "782910405",
    username: "sonya_mimi",
    firstName: "Соня",
    lastName: "Козлова",
    isPremium: false,
    premiumType: null,
    premiumUntil: null,
    messagesToday: 2,
    gdzToday: 0,
    lastMessageAt: getDateAgo(1),
    customPrompt: null,
    currentStyleId: "teacher",
    referredBy: "542918801",
    referralsCount: 2,
    isBlocked: false,
    registeredAt: getDateAgo(12),
    gender: "F",
    onboardingCompleted: true,
  },
  {
    id: "349122391",
    username: "pasha_tech",
    firstName: "Павел",
    lastName: "Дуров",
    isPremium: true,
    premiumType: "ultra",
    premiumUntil: new Date(Date.now() + 80 * 24 * 3600 * 1000).toISOString(),
    messagesToday: 15,
    gdzToday: 8,
    lastMessageAt: getDateAgo(0),
    customPrompt: null,
    currentStyleId: "professor",
    referredBy: null,
    referralsCount: 0,
    isBlocked: false,
    registeredAt: getDateAgo(5),
    gender: "M",
    onboardingCompleted: true,
  },
  {
    id: "901234567",
    username: "toxic_schoolboy",
    firstName: "Артем",
    lastName: "Петров",
    isPremium: false,
    premiumType: null,
    premiumUntil: null,
    messagesToday: 0,
    gdzToday: 0,
    lastMessageAt: getDateAgo(3),
    customPrompt: null,
    currentStyleId: "brother",
    referredBy: "782910405",
    referralsCount: 0,
    isBlocked: true,
    registeredAt: getDateAgo(20),
    gender: "M",
    onboardingCompleted: true,
  },
];

const defaultPayments: DbPayment[] = [
  {
    id: "pay_1",
    userId: "542918801",
    username: "shket_vanya",
    amount: 399,
    plan: "mega",
    status: "succeeded",
    createdAt: getDateAgo(10),
  },
  {
    id: "pay_2",
    userId: "349122391",
    username: "pasha_tech",
    amount: 899,
    plan: "ultra",
    status: "succeeded",
    createdAt: getDateAgo(5),
  },
  {
    id: "pay_3",
    userId: "782910405",
    username: "sonya_mimi",
    amount: 199,
    plan: "base",
    status: "failed",
    createdAt: getDateAgo(1),
  },
];

export class Database {
  private data: DbSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DbSchema {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const fileContent = fs.readFileSync(DB_FILE_PATH, "utf-8");
        const parsed = JSON.parse(fileContent);
        // Ensure default structures are present
        return {
          users: parsed.users || [],
          ads: parsed.ads || defaultAds,
          campaigns: parsed.campaigns || defaultCampaigns,
          quizzes: parsed.quizzes || defaultQuizzes,
          quizResults: parsed.quizResults || [],
          styles: parsed.styles || defaultStyles,
          payments: parsed.payments || defaultPayments,
          broadcasts: parsed.broadcasts || [],
          messages: parsed.messages || {},
          settings: {
            requiredChannelUrl: "https://t.me/shket_official",
            requiredChannelName: "ШкЕТ Official",
            freeMessagesLimit: 10,
            premiumMessagesLimit: 9999,
            freeGdzLimit: 3,
            premiumGdzLimit: 9999,
            contextDepthFree: 15,
            contextDepthPremium: 25,
            messageFloodLimitFree: 5,
            messageFloodLimitPremium: 20,
            adFrequencyHours: 4,
            adMessageInterval: 5,
            tgBotToken: "",
            tgBotUsername: "",
            tgWebhookUrl: "",
            yookassaShopId: "",
            yookassaSecretKey: "",
            yookassaEnabled: false,
            aiProvider: "gemini",
            grokApiKey: "",
            grokModel: "grok-2",
            geminiApiKey: "",
            startMsg: {
              text: "Привет! На связи ШкЕТ 🎒. Спрашивай чё угодно — я шарю за любую домашку и могу знатно поугарать над твоими преподшами. Будет жарко!\n\nВыбирай нужную функцию прямо на кнопках:",
              mediaUrl: "",
              buttons: []
            },
            groupMsg: {
              text: "Всем ку! Я НейроШкЕТ 🎒. Буду помогать вам с домашкой прямо тут в чате. Отправьте фото или напишите вопрос, тегнув меня!",
              mediaUrl: "",
              buttons: []
            },
            subMsg: {
              text: "⚠️ **ОБЯЗАТЕЛЬНАЯ ПОДПИСКА (ОП)**\n\nЧтобы пользоваться ботом НейроШкЕТ, тебе нужно подписаться на наш спонсорский канал:\n\n👉 **{channel_name}**\n\nПодпишись и нажми кнопку ниже, чтобы начать!",
              mediaUrl: "",
              buttons: []
            },
            ...parsed.settings
          },
        };
      }
    } catch (e) {
      console.error("Failed to load db.json, fallback to seed data:", e);
    }

    const initialDb: DbSchema = {
      users: defaultUsers,
      ads: defaultAds,
      campaigns: defaultCampaigns,
      quizzes: defaultQuizzes,
      quizResults: [
        { userId: "542918801", username: "shket_vanya", points: 45, completedAt: getDateAgo(0) },
        { userId: "349122391", username: "pasha_tech", points: 30, completedAt: getDateAgo(0) },
        { userId: "782910405", username: "sonya_mimi", points: 25, completedAt: getDateAgo(1) },
      ],
      styles: defaultStyles,
      payments: defaultPayments,
      broadcasts: [
        {
          id: "broad_1",
          text: "🚀 Хэй, народ! Вышел новый пак анекдотов про директрису! Жми команду /joke прямо сейчас!",
          mediaUrl: null,
          buttonText: "Проверить прикол",
          buttonUrl: "https://t.me/neuro_shket",
          status: "completed",
          sentCount: 3,
          errorCount: 1,
          totalTarget: 4,
          createdAt: getDateAgo(2),
        },
      ],
      messages: {
        "542918801": [
          { role: "user", text: "/start", timestamp: getDateAgo(0) },
          { role: "model", text: "Здорово, бро! На связи ШкЕТ 🎒. Спрашивай чё угодно — я шарю за любую домашку и могу знатно поугарать над твоими преподшами. Будет жарко!", timestamp: getDateAgo(0) },
          { role: "user", text: "Как решить x^2 - 4 = 0?", timestamp: getDateAgo(0) },
          { role: "model", text: "Изи катка, кореш! Раскладываем как (x-2)(x+2) = 0. Отсюда корни x = 2 и x = -2. Не благодари, иди чилль!", timestamp: getDateAgo(0) },
        ],
      },
      settings: {
        requiredChannelUrl: "https://t.me/shket_official",
        requiredChannelName: "ШкЕТ Official",
        freeMessagesLimit: 10,
        premiumMessagesLimit: 9999,
        freeGdzLimit: 3,
        premiumGdzLimit: 9999,
        contextDepthFree: 15,
        contextDepthPremium: 25,
        messageFloodLimitFree: 5,
        messageFloodLimitPremium: 20,
        adFrequencyHours: 4,
        adMessageInterval: 5,
        tgBotToken: "",
        tgBotUsername: "",
        tgWebhookUrl: "",
        yookassaShopId: "",
        yookassaSecretKey: "",
        yookassaEnabled: false,
        aiProvider: "gemini",
        grokApiKey: "",
        grokModel: "grok-2",
        geminiApiKey: "",
        totalGdzSolved: 150,
        totalMessagesChat: 1200,
        startMsg: {
          text: "Привет! На связи ШкЕТ 🎒. Спрашивай чё угодно — я шарю за любую домашку и могу знатно поугарать над твоими преподшами. Будет жарко!\n\nВыбирай нужную функцию прямо на кнопках:",
          mediaUrl: "",
          buttons: []
        },
        groupMsg: {
          text: "Всем ку! Я НейроШкЕТ 🎒. Буду помогать вам с домашкой прямо тут в чате. Отправьте фото или напишите вопрос, тегнув меня!",
          mediaUrl: "",
          buttons: []
        },
        subMsg: {
          text: "⚠️ **ОБЯЗАТЕЛЬНАЯ ПОДПИСКА (ОП)**\n\nЧтобы пользоваться ботом НейроШкЕТ, тебе нужно подписаться на наш спонсорский канал:\n\n👉 **{channel_name}**\n\nПодпишись и нажми кнопку ниже, чтобы начать!",
          mediaUrl: "",
          buttons: []
        }
      },
    };
    this.save(initialDb);
    return initialDb;
  }

  public save(dataToSave?: DbSchema): void {
    try {
      const data = dataToSave || this.data;
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to write db.json:", e);
    }
  }

  // Getters
  public getUsers(): DbUser[] {
    return this.data.users;
  }

  public getAds(): DbAd[] {
    return this.data.ads;
  }

  public getCampaigns(): DbCampaign[] {
    return this.data.campaigns;
  }

  public getQuizzes(): DbQuiz[] {
    return this.data.quizzes;
  }

  public getQuizResults(): DbQuizResult[] {
    return this.data.quizResults;
  }

  public getStyles(): DbStyle[] {
    return this.data.styles;
  }

  public getPayments(): DbPayment[] {
    return this.data.payments;
  }

  public getBroadcasts(): DbBroadcast[] {
    return this.data.broadcasts;
  }

  public getSettings(): DbSettings {
    return this.data.settings;
  }

  public getMessages(userId: string) {
    return this.data.messages[userId] || [];
  }

  // Operations for users
  public findUser(id: string): DbUser | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public createUser(user: Partial<DbUser> & { id: string; username: string }): DbUser {
    const newUser: DbUser = {
      id: user.id,
      username: user.username,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isPremium: user.isPremium || false,
      premiumType: user.premiumType || null,
      premiumUntil: user.premiumUntil || null,
      messagesToday: 0,
      gdzToday: 0,
      lastMessageAt: null,
      customPrompt: null,
      currentStyleId: "brother",
      referredBy: user.referredBy || null,
      referralsCount: 0,
      isBlocked: false,
      registeredAt: new Date().toISOString(),
      gender: user.gender || "unknown",
      onboardingCompleted: user.onboardingCompleted || false,
      grade: user.grade || undefined,
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<DbUser>): DbUser | undefined {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      this.data.users[idx] = { ...this.data.users[idx], ...updates };
      this.save();
      return this.data.users[idx];
    }
    return undefined;
  }

  // Styles Operations
  public addStyle(style: Omit<DbStyle, "isDefault">): DbStyle {
    const newStyle: DbStyle = { ...style, isDefault: false };
    this.data.styles.push(newStyle);
    this.save();
    return newStyle;
  }

  public updateStyle(id: string, updates: Partial<DbStyle>): DbStyle | undefined {
    const idx = this.data.styles.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.data.styles[idx] = { ...this.data.styles[idx], ...updates };
      this.save();
      return this.data.styles[idx];
    }
    return undefined;
  }

  public deleteStyle(id: string): boolean {
    const idx = this.data.styles.findIndex((s) => s.id === id);
    if (idx !== -1) {
      const style = this.data.styles[idx];
      if (style.isDefault) return false; // cannot delete default styles
      this.data.styles.splice(idx, 1);
      // fallback any users with this style to default "brother"
      this.data.users.forEach((u) => {
        if (u.currentStyleId === id) {
          u.currentStyleId = "brother";
        }
      });
      this.save();
      return true;
    }
    return false;
  }

  // Ads operations
  public updateAd(id: string, updates: Partial<DbAd>): DbAd | undefined {
    const idx = this.data.ads.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.data.ads[idx] = { ...this.data.ads[idx], ...updates };
      this.save();
      return this.data.ads[idx];
    }
    return undefined;
  }

  public createAd(ad: Omit<DbAd, "views" | "clicks">): DbAd {
    const newAd: DbAd = { ...ad, views: 0, clicks: 0 };
    this.data.ads.push(newAd);
    this.save();
    return newAd;
  }

  public deleteAd(id: string): boolean {
    const idx = this.data.ads.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.data.ads.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // Campaigns
  public createCampaign(id: string): DbCampaign {
    const newCampaign: DbCampaign = {
      id,
      clicks: 0,
      uniqueUsers: 0,
      maleUsers: 0,
      femaleUsers: 0,
      completedOnboarding: 0,
      premiumPurchased: 0,
    };
    this.data.campaigns.push(newCampaign);
    this.save();
    return newCampaign;
  }

  public updateCampaignStats(id: string, fields: Partial<DbCampaign>): void {
    const campaign = this.data.campaigns.find((c) => c.id === id);
    if (campaign) {
      Object.assign(campaign, fields);
    } else {
      this.data.campaigns.push({
        id,
        clicks: fields.clicks || 0,
        uniqueUsers: fields.uniqueUsers || 0,
        maleUsers: fields.maleUsers || 0,
        femaleUsers: fields.femaleUsers || 0,
        completedOnboarding: fields.completedOnboarding || 0,
        premiumPurchased: fields.premiumPurchased || 0,
      });
    }
    this.save();
  }

  // Messages Operations
  public saveMessage(userId: string, role: "user" | "model", text: string): void {
    if (!this.data.messages[userId]) {
      this.data.messages[userId] = [];
    }
    this.data.messages[userId].push({
      role,
      text,
      timestamp: new Date().toISOString(),
    });
    this.incrementTotalMessagesChat();
    this.save();
  }

  public clearMessages(userId: string): void {
    this.data.messages[userId] = [];
    this.save();
  }

  public getAllMessagesCount(): number {
    let total = 0;
    for (const userId in this.data.messages) {
      if (Array.isArray(this.data.messages[userId])) {
        total += this.data.messages[userId].length;
      }
    }
    return total;
  }

  public incrementTotalGdzSolved(): void {
    if (this.data.settings.totalGdzSolved === undefined) {
      this.data.settings.totalGdzSolved = 150;
    }
    this.data.settings.totalGdzSolved += 1;
    this.save();
  }

  public incrementTotalMessagesChat(): void {
    if (this.data.settings.totalMessagesChat === undefined) {
      this.data.settings.totalMessagesChat = 1200;
    }
    this.data.settings.totalMessagesChat += 1;
    this.save();
  }

  // Settings
  public updateSettings(updates: Partial<DbSettings>): DbSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }

  // Quiz ops
  public addQuizResult(userId: string, username: string, points: number): DbQuizResult {
    const newResult: DbQuizResult = {
      userId,
      username,
      points,
      completedAt: new Date().toISOString(),
    };
    this.data.quizResults.push(newResult);
    this.save();
    return newResult;
  }

  // Payments
  public createPayment(userId: string, username: string, plan: "base" | "mega" | "ultra", amount: number): DbPayment {
    const newPayment: DbPayment = {
      id: "pay_" + Math.random().toString(36).substr(2, 9),
      userId,
      username,
      amount,
      plan,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.data.payments.push(newPayment);
    this.save();
    return newPayment;
  }

  public succeedPayment(id: string): DbPayment | undefined {
    const p = this.data.payments.find((pay) => pay.id === id);
    if (p) {
      p.status = "succeeded";
      const u = this.findUser(p.userId);
      if (u) {
        let days = 7;
        if (p.plan === "mega") days = 30;
        if (p.plan === "ultra") days = 90;

        const currentExpiry = u.premiumUntil ? new Date(u.premiumUntil).getTime() : Date.now();
        const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
        const newExpiry = new Date(baseTime + days * 24 * 3600 * 1000).toISOString();

        u.isPremium = true;
        u.premiumType = p.plan;
        u.premiumUntil = newExpiry;
        this.updateUser(u.id, u);
      }
      this.save();
    }
    return p;
  }

  // Broadcasts
  public createBroadcast(b: Omit<DbBroadcast, "id" | "sentCount" | "errorCount" | "status" | "createdAt" | "totalTarget"> & { totalTarget?: number }): DbBroadcast {
    const newBroad: DbBroadcast = {
      ...b,
      totalTarget: b.totalTarget || 0,
      id: "broad_" + Math.random().toString(36).substr(2, 9),
      sentCount: 0,
      errorCount: 0,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    this.data.broadcasts.push(newBroad);
    this.save();
    return newBroad;
  }

  public updateBroadcast(id: string, updates: Partial<DbBroadcast>): DbBroadcast | undefined {
    const idx = this.data.broadcasts.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.data.broadcasts[idx] = { ...this.data.broadcasts[idx], ...updates };
      this.save();
      return this.data.broadcasts[idx];
    }
    return undefined;
  }

  // Dump database as PostgreSQL SQL file
  public getPostgresDump(): string {
    let sql = `-- Postgres Dump of NeuroShkET Database\n`;
    sql += `-- Generated on ${new Date().toISOString()}\n\n`;

    // Drop and create tables
    sql += `DROP TABLE IF EXISTS users CASCADE;\n`;
    sql += `CREATE TABLE users (\n`;
    sql += `  id VARCHAR(50) PRIMARY KEY,\n`;
    sql += `  username VARCHAR(100),\n`;
    sql += `  first_name VARCHAR(100),\n`;
    sql += `  last_name VARCHAR(100),\n`;
    sql += `  is_premium BOOLEAN DEFAULT FALSE,\n`;
    sql += `  premium_type VARCHAR(20),\n`;
    sql += `  premium_until TIMESTAMP,\n`;
    sql += `  messages_today INT DEFAULT 0,\n`;
    sql += `  gdz_today INT DEFAULT 0,\n`;
    sql += `  custom_prompt TEXT,\n`;
    sql += `  current_style_id VARCHAR(50),\n`;
    sql += `  referred_by VARCHAR(50),\n`;
    sql += `  referrals_count INT DEFAULT 0,\n`;
    sql += `  is_blocked BOOLEAN DEFAULT FALSE,\n`;
    sql += `  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
    sql += `  gender VARCHAR(10),\n`;
    sql += `  grade VARCHAR(20)\n);\n\n`;

    // Users inserts
    this.data.users.forEach((u) => {
      const until = u.premiumUntil ? `'${u.premiumUntil}'` : "NULL";
      const customPrompt = u.customPrompt ? `'${u.customPrompt.replace(/'/g, "''")}'` : "NULL";
      const refBy = u.referredBy ? `'${u.referredBy}'` : "NULL";
      const gradeVal = u.grade ? `'${u.grade}'` : "NULL";
      sql += `INSERT INTO users (id, username, first_name, last_name, is_premium, premium_type, premium_until, messages_today, gdz_today, custom_prompt, current_style_id, referred_by, referrals_count, is_blocked, registered_at, gender, grade) \n`;
      sql += `VALUES ('${u.id}', '${u.username}', '${u.firstName.replace(/'/g, "''")}', '${u.lastName.replace(/'/g, "''")}', ${u.isPremium}, '${u.premiumType || "NULL"}', ${until}, ${u.messagesToday}, ${u.gdzToday}, ${customPrompt}, '${u.currentStyleId}', ${refBy}, ${u.referralsCount}, ${u.isBlocked}, '${u.registeredAt}', '${u.gender}', ${gradeVal}) ON CONFLICT (id) DO NOTHING;\n`;
    });

    sql += `\nDROP TABLE IF EXISTS ads CASCADE;\n`;
    sql += `CREATE TABLE ads (\n`;
    sql += `  id VARCHAR(50) PRIMARY KEY,\n`;
    sql += `  url TEXT,\n`;
    sql += `  text TEXT,\n`;
    sql += `  position VARCHAR(20),\n`;
    sql += `  views INT DEFAULT 0,\n`;
    sql += `  clicks INT DEFAULT 0,\n`;
    sql += `  is_active BOOLEAN DEFAULT TRUE\n);\n\n`;

    this.data.ads.forEach((a) => {
      sql += `INSERT INTO ads (id, url, text, position, views, clicks, is_active) VALUES ('${a.id}', '${a.url}', '${a.text.replace(/'/g, "''")}', '${a.position}', ${a.views}, ${a.clicks}, ${a.isActive});\n`;
    });

    sql += `\nDROP TABLE IF EXISTS styles CASCADE;\n`;
    sql += `CREATE TABLE styles (\n`;
    sql += `  id VARCHAR(50) PRIMARY KEY,\n`;
    sql += `  name VARCHAR(100),\n`;
    sql += `  description TEXT,\n`;
    sql += `  prompt TEXT,\n`;
    sql += `  is_default BOOLEAN\n);\n\n`;

    this.data.styles.forEach((s) => {
      sql += `INSERT INTO styles (id, name, description, prompt, is_default) VALUES ('${s.id}', '${s.name}', '${s.description.replace(/'/g, "''")}', '${s.prompt.replace(/'/g, "''")}', ${s.isDefault});\n`;
    });

    sql += `\nDROP TABLE IF EXISTS payments CASCADE;\n`;
    sql += `CREATE TABLE payments (\n`;
    sql += `  id VARCHAR(50) PRIMARY KEY,\n`;
    sql += `  user_id VARCHAR(50),\n`;
    sql += `  username VARCHAR(100),\n`;
    sql += `  amount INT,\n`;
    sql += `  plan VARCHAR(20),\n`;
    sql += `  status VARCHAR(20),\n`;
    sql += `  created_at TIMESTAMP\n);\n\n`;

    this.data.payments.forEach((p) => {
      sql += `INSERT INTO payments (id, user_id, username, amount, plan, status, created_at) VALUES ('${p.id}', '${p.userId}', '${p.username}', ${p.amount}, '${p.plan}', '${p.status}', '${p.createdAt}');\n`;
    });

    return sql;
  }
}

export const dbInstance = new Database();
