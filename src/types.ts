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
  campaignId?: string | null;
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
  targetScope?: "all" | "private" | "group";
}

export interface DbCampaign {
  id: string;
  clicks: number;
  uniqueUsers: number;
  maleUsers: number;
  femaleUsers: number;
  completedOnboarding: number;
  premiumPurchased: number;
  channelSubscribed?: number;
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
  isPremium?: boolean;
}

export interface RequiredChannel {
  name: string;
  url: string;
}

export interface DbGroup {
  chatId: string;
  title: string;
  isPremium: boolean;
  premiumUntil: string | null;
  addedAt: string;
}

export interface DbPayment {
  id: string;
  userId: string;
  username: string;
  amount: number;
  plan: "base" | "mega" | "ultra" | "group";
  method?: "card" | "stars";
  starsAmount?: number;
  chatId?: string;
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

export interface TemplateButton {
  text: string;
  type?: "cmd_gdz" | "cmd_style" | "startgroup" | "cmd_quiz" | "cmd_joke" | "cmd_premium" | "cmd_profile" | "cmd_ref" | "url";
  url?: string;
  callbackData?: string;
  row?: number;
}

export interface BotMessageTemplate {
  text: string;
  mediaUrl?: string;
  buttonsInRow?: number;
  buttons?: TemplateButton[];
}

export interface DbSettings {
  requiredChannelUrl: string;
  requiredChannelName: string;
  requiredChannels?: RequiredChannel[];
  priceBaseRub?: number;
  priceMegaRub?: number;
  priceUltraRub?: number;
  priceGroupRub?: number;
  priceBaseStars?: number;
  priceMegaStars?: number;
  priceUltraStars?: number;
  priceGroupStars?: number;
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
  groupRandomReplyChance?: number;
  voiceResponsesMode?: "disabled" | "always" | "premium";
  voiceResponseType?: "voice" | "video_note" | "both";
  circleVideoUrl?: string;
  voiceResponseName?: string;
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
  periodNewUsers?: number;
  periodRevenue?: number;
  periodFrom?: string | null;
  periodTo?: string | null;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  category: "bot" | "webhook" | "system" | "api" | "gemini";
  message: string;
  details?: string;
}
