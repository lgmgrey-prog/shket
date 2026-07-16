export interface DbUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  isPremium: boolean;
  premiumType: "base" | "mega" | "ultra" | "demo" | "top5" | null;
  premiumUntil: string | null;
  messagesToday: number;
  gdzToday: number;
  lastMessageAt: string | null;
  customPrompt: string | null;
  currentStyleId: string;
  referredBy: string | null;
  referralsCount: number;
  isBlocked: boolean;
  registeredAt: string;
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
  position: "start" | "mid" | "gdz" | "pin";
  views: number;
  clicks: number;
  isActive: boolean;
  uniqueViews?: string[];
}

export interface DbCampaign {
  id: string;
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
}

export interface SystemStats {
  cpu: {
    cores: number;
    model: string;
    loadPercent: number;
  };
  ram: {
    totalGb: string;
    usedGb: string;
    percent: number;
  };
  disk: {
    totalGb: string;
    usedGb: string;
    percent: number;
  };
  serverUptime: number;
  dbSizeKb: string;
}

export interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  blockedUsers: number;
  totalRevenue: number;
  styleCount: { [id: string]: number };
  totalGdzSolved: number;
  totalMessagesChat: number;
  dau: number;
  mau: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  category: "bot" | "webhook" | "system" | "api" | "gemini";
  message: string;
  details?: string;
}
