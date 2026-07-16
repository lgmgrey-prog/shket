import { GoogleGenAI } from "@google/genai";
import { dbInstance } from "./db.js";

let aiInstance: GoogleGenAI | null = null;

let currentApiKey: string | undefined = undefined;

export function getGeminiClient(): GoogleGenAI {
  const settings = dbInstance.getSettings();
  const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in settings or environment variables");
  }

  if (!aiInstance || currentApiKey !== apiKey) {
    currentApiKey = apiKey;
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Helper for exponential backoff delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GenerateConfig {
  contents: any;
  config?: any;
  model?: string;
}

/**
 * Robust wrapper around ai.models.generateContent with exponential backoff retry and model fallback.
 */
async function generateContentWithRetry(params: GenerateConfig): Promise<any> {
  const ai = getGeminiClient();
  const maxRetries = 3;
  let delayMs = 1000;
  
  // Use gemini-3.5-flash as default if no model specified
  const primaryModel = params.model || "gemini-3.5-flash";
  const fallbackModel = "gemini-3.1-flash-lite";

  // Try the primary model first, with retries on transient errors (503 / 429)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: primaryModel,
      });
      return response;
    } catch (err: any) {
      const errStr = typeof err === "string" ? err : (err.message || JSON.stringify(err));
      console.warn(`[Attempt ${attempt}/${maxRetries}] Gemini API failed with model ${primaryModel}:`, errStr);
      
      const isQuotaExceeded = errStr.includes("Quota exceeded") || 
                              errStr.includes("RESOURCE_EXHAUSTED") || 
                              errStr.includes("quota") ||
                              errStr.includes("Quota") ||
                              errStr.includes("limit: 20");

      const isTransient = (errStr.includes("503") || 
                           errStr.includes("UNAVAILABLE") || 
                           errStr.includes("429") || 
                           errStr.includes("Resource has been exhausted") ||
                           err.status === 503 ||
                           err.status === 429) && !isQuotaExceeded;

      if (isTransient && attempt < maxRetries) {
        console.log(`Retrying in ${delayMs}ms due to transient error...`);
        await delay(delayMs);
        delayMs *= 2; // exponential backoff
      } else {
        // If it's a quota limit, or a non-transient error, or we reached max retries, try the fallback model immediately!
        console.log(`Switching to fallback model ${fallbackModel} due to: ${isQuotaExceeded ? 'Quota Exceeded' : 'Error/Max Retries'}...`);
        try {
          const fallbackResponse = await ai.models.generateContent({
            ...params,
            model: fallbackModel,
          });
          return fallbackResponse;
        } catch (fallbackErr: any) {
          const fallbackErrStr = typeof fallbackErr === "string" ? fallbackErr : (fallbackErr.message || JSON.stringify(fallbackErr));
          console.error(`Fallback model ${fallbackModel} also failed:`, fallbackErrStr);
          throw err; // throw the original error so that parent handlers can use their fast local mock fallbacks
        }
      }
    }
  }
}

/**
 * Call Grok API via standard fetch (OpenAI-compatible)
 */
async function callGrok(systemPrompt: string, messages: { role: string; content: any }[], model?: string): Promise<string> {
  const settings = dbInstance.getSettings();
  const apiKey = settings.grokApiKey || process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not configured in settings or environment variables");
  }
  const grokModel = model || settings.grokModel || "grok-2-1212";

  const requestMessages = [];
  if (systemPrompt) {
    requestMessages.push({ role: "system", content: systemPrompt });
  }
  requestMessages.push(...messages);

  const res = await fetch("https://api.xai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: grokModel,
      messages: requestMessages,
      temperature: 0.9
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Grok API returned status ${res.status}: ${errorText}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from Grok API");
  }
  return content;
}

// Custom fallback responses for sandbox when API key is missing
function getMockChatResponse(styleId: string, message: string): string {
  const roll = Math.random();
  if (styleId === "brother") {
    const lines = [
      `Йоу, бро! Я бы тебе ответил на изичах, но тут траблы с ключом Gemini. Но чисто по-братски: жиза полная, держи хвост пистолетом!`,
      `Мда, трешак, бро, мой космический мозг временно спит без API-ключа. Но если по теме "${message}" — то это фигня, забей и иди чиллить!`,
      `Че каво, кореш! Без ключа ИИ я туплю как на контрольной по химии, давай лучше просто поугораем!`,
    ];
    return lines[Math.floor(roll * lines.length)];
  } else if (styleId === "teacher") {
    return `Опять списываешь, оболтус? У меня, Марь Ванны, батарейка села без ключа Gemini, так что марш открывать учебник!`;
  } else {
    return `МУАХАХАХА! Мой реактор остался без плутония (ключа Gemini)! Твой запрос прекрасен, но без заряда ИИ я могу только безумно хохотать!`;
  }
}

function getMockGdzResponse(): string {
  return `🎒 **ГДЗ-помощник ШкЕТ [Демо-режим]**\n\n` +
         `Вижу твою картинку, бро! Из-за отсутствия ключа GEMINI_API_KEY я включил свой внутренний резервный калькулятор:\n\n` +
         `**Распознанное уравнение:**\n` +
         `$5x^2 - 15x + 10 = 0$\n\n` +
         `**Пошаговое решение:**\n` +
         `1) Разделим все члены уравнения на 5:\n` +
         `   $x^2 - 3x + 2 = 0$\n` +
         `2) По теореме Виета корни должны давать в сумме 3, а в произведении 2.\n` +
         `3) Находим корни подбором: $x_1 = 1$, $x_2 = 2$.\n\n` +
         `**Ответ:** $x = 1; x = 2$.\n\n` +
         `*Магия! Чтобы распознавать любые другие задачи по фото, админу нужно прописать настоящий GEMINI_API_KEY в панели Secrets!*`;
}

function getMockTeacherJoke(): string {
  const jokes = [
    "— Марь Ванна, а можно ли наказывать за то, чего человек не делал?\n— Конечно нет, Вовочка!\n— Фух, отлично, а то я домашку по физике не сделал!",
    "На уроке ОБЖ учитель спрашивает:\n— Что нужно делать при землетрясении?\nВовочка:\n— Быстро бежать, пока Марь Ванна не вспомнила, что нужно собрать тетрадки на проверку!",
    "Директор школы на линейке:\n— Школа — это ваш второй дом! Вовочка шепотом: — Ага, поэтому я и прихожу сюда поспать и вечно торчу в телефоне.",
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}

function getMockInsult(name: string): string {
  const roasts = [
    `О, здорово, ${name}-Карамелька! Вроде имя нормальное, а лицо такое, будто у Марь Ванны дневник украл и съел его.`,
    `${name}-Кибердвоечник! Из сильных сторон у тебя только умение сворачивать вкладку с Дотой, когда батя в комнату заходит.`,
    `Ну че, ${name}-Флексер? Твой статус в соцсетях круче твоих оценок в четверти в десять раз. Рофл ходячий!`,
  ];
  return roasts[Math.floor(Math.random() * roasts.length)];
}

/**
 * Chat with the AI in a specific style with message context
 */
export async function chatWithBot(userId: string, userMessage: string): Promise<string> {
  const user = dbInstance.findUser(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const styles = dbInstance.getStyles();
  const activeStyle = styles.find((s) => s.id === user.currentStyleId) || styles[0];
  const settings = dbInstance.getSettings();

  const isPremium = user.isPremium;
  const contextLimit = isPremium ? settings.contextDepthPremium : settings.contextDepthFree;

  // Retrieve message history
  const history = dbInstance.getMessages(userId).slice(-contextLimit);

  // Construct parameters
  let systemPrompt = activeStyle.prompt;
  systemPrompt += `\n\nКРИТИЧЕСКОЕ ОГРАНИЧЕНИЕ: Твой ответ должен быть ОЧЕНЬ коротким — ровно ОДНО ИЛИ МАКСИМУМ ДВА ПРЕДЛОЖЕНИЯ. Никогда не пиши больше двух предложений! Отвечай дерзко, весело и молодежно, но укладывайся строго в 1-2 предложения.`;
  if (isPremium && user.premiumType !== "base" && user.customPrompt) {
    systemPrompt += `\nВНИМАНИЕ: Пользователь активировал персональный стиль. Дополнительное требование к твоему поведению: "${user.customPrompt}". Обязательно соблюдай его!`;
  }

  if (settings.aiProvider === "grok") {
    try {
      const grokMessages = history.map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text,
      }));
      grokMessages.push({ role: "user", content: userMessage });

      const aiText = await callGrok(systemPrompt, grokMessages);
      dbInstance.saveMessage(userId, "user", userMessage);
      dbInstance.saveMessage(userId, "model", aiText);
      return aiText;
    } catch (err: any) {
      console.warn("Grok API call failed:", err);
      const errMsg = err?.message || String(err);
      const mockReply = `⚠️ Ошибка Grok API: "${errMsg}". Пожалуйста, проверьте API ключ xAI Grok в панели администратора (раздел "Настройки") или проверьте статус баланса вашего аккаунта xAI.`;
      dbInstance.saveMessage(userId, "user", userMessage);
      dbInstance.saveMessage(userId, "model", mockReply);
      return mockReply;
    }
  }

  try {
    // Prepare contents array matching history
    const contents = history.map((msg) => ({
      role: msg.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: msg.text }],
    }));
    contents.push({ role: "user" as const, parts: [{ text: userMessage }] });

    const response = await generateContentWithRetry({
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.9,
      },
    });

    const aiText = response.text || "Слушай, бро, чет я подвис... Давай еще раз.";
    dbInstance.saveMessage(userId, "user", userMessage);
    dbInstance.saveMessage(userId, "model", aiText);
    return aiText;
  } catch (err: any) {
    console.warn("Gemini API call failed:", err);
    const errMsg = err?.message || String(err);
    const hasKey = !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);
    const mockReply = hasKey
      ? `⚠️ Ошибка Gemini API: "${errMsg}". Пожалуйста, проверьте API-ключ Gemini в панели администратора (раздел "Настройки").`
      : getMockChatResponse(user.currentStyleId, userMessage);
    dbInstance.saveMessage(userId, "user", userMessage);
    dbInstance.saveMessage(userId, "model", mockReply);
    return mockReply;
  }
}

/**
 * Solve Homework (GDZ) from image base64
 */
export async function solveHomework(base64ImageWithHeader: string): Promise<string> {
  const settings = dbInstance.getSettings();
  if (settings.aiProvider === "grok") {
    try {
      const prompt = "Ты — ГДЗ-помощник ШкЕТ. Распознай рукописный текст, печатный текст, формулы, рисунки или чертежи с задачами на картинке. Выдай максимально понятное, структурированное и абсолютно правильное пошаговое решение по школьной общеобразовательной программе (любой предмет, 1-11 классы). ВАЖНОЕ ПРАВИЛО: Категорически запрещено использовать LaTeX, знаки доллара ($), квадратные скобки со слешами и другие непонятные символы для формул. Пиши математические формулы и примеры в простом, понятном человеческом виде, используя обычные знаки: +, -, *, /, дробь пиши как '1/2' или через двоеточие ':', степени пиши как '^2'. Текст должен идеально читаться в мессенджере Telegram без каких-либо искажений и долларов. Выделяй шаги жирным шрифтом. В конце обязательно напиши четкий ответ. Говори в легком, бодром молодежном стиле школьного помощника.";
      const grokMessages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: base64ImageWithHeader
              }
            }
          ]
        }
      ];
      const modelToUse = settings.grokModel?.includes("vision") ? settings.grokModel : "grok-2-1212";
      return await callGrok("", grokMessages, modelToUse);
    } catch (err: any) {
      console.warn("Grok API GDZ failed, using mock fallback:", err);
      return getMockGdzResponse();
    }
  }

  // Strip mime prefix if present
  let base64Data = base64ImageWithHeader;
  let mimeType = "image/jpeg";

  const match = base64ImageWithHeader.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  }

  try {
    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: "Ты — ГДЗ-помощник ШкЕТ. Распознай рукописный текст, печатный текст, формулы, рисунки или чертежи с задачами на картинке. Выдай максимально понятное, структурированное и абсолютно правильное пошаговое решение по школьной общеобразовательной программе (любой предмет, 1-11 классы). ВАЖНОЕ ПРАВИЛО: Категорически запрещено использовать LaTeX, знаки доллара ($), квадратные скобки со слешами и другие непонятные символы для формул. Пиши математические формулы и примеры в простом, понятном человеческом виде, используя обычные знаки: +, -, *, /, дробь пиши как '1/2' или через двоеточие ':', степени пиши как '^2'. Текст должен идеально читаться в мессенджере Telegram без каких-либо искажений и долларов. Выделяй шаги жирным шрифтом. В конце обязательно напиши четкий ответ. Говори в легком, бодром молодежном стиле школьного помощника.",
    };

    const response = await generateContentWithRetry({
      contents: {
        parts: [imagePart, textPart],
      },
    });

    return response.text || "Не смог разобрать картинку, бро. Попробуй сфоткать четче!";
  } catch (err: any) {
    console.warn("Gemini API GDZ failed:", err);
    const errMsg = err?.message || String(err);
    const hasKey = !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);
    if (hasKey) {
      return `⚠️ Ошибка Gemini API при решении домашнего задания: "${errMsg}". Пожалуйста, проверьте правильность вашего API-ключа Gemini в настройках администратора.`;
    }
    return getMockGdzResponse();
  }
}

/**
 * Generate school teacher jokes
 */
export async function generateTeacherJoke(): Promise<string> {
  const settings = dbInstance.getSettings();
  if (settings.aiProvider === "grok") {
    try {
      return await callGrok(
        "Ты — школьный юморист ШкЕТ. Пиши смешно, коротко и со сленгом.",
        [{ role: "user", content: "Расскажи один смешной, короткий, дерзкий и саркастичный анекдот про школьных учителей или завуча Марь Ванну. Без жесткой цензуры, чтобы было жизненно для школьников." }]
      );
    } catch (err) {
      return getMockTeacherJoke();
    }
  }

  try {
    const response = await generateContentWithRetry({
      contents: "Расскажи один смешной, короткий, дерзкий и саркастичный анекдот про школьных учителей или завуча Марь Ванну. Без жесткой цензуры, чтобы было жизненно для школьников.",
      config: {
        systemInstruction: "Ты — школьный юморист ШкЕТ. Пиши смешно, коротко и со сленгом.",
      },
    });
    return response.text || getMockTeacherJoke();
  } catch (err) {
    return getMockTeacherJoke();
  }
}

/**
 * Insult/Roast a student by name
 */
export async function insultByName(name: string): Promise<string> {
  const settings = dbInstance.getSettings();
  if (settings.aiProvider === "grok") {
    try {
      return await callGrok(
        "Ты — дерзкий школьный авторитет ШкЕТ. Роастишь учеников по-дружески, остроумно и молодежно.",
        [{ role: "user", content: `Выдай один смешной, дерзкий и саркастичный школьный подкол/роаст для ученика по имени "${name}". Придумай ему смешную кличку на основе имени и весело высмей его школьную лень, увлечение играми или списывание. Это должно быть без жесткого мата, но смешно и жизненно, в стиле дружеского подкола.` }]
      );
    } catch (err) {
      return getMockInsult(name);
    }
  }

  try {
    const response = await generateContentWithRetry({
      contents: `Выдай один смешной, дерзкий и саркастичный школьный подкол/роаст для ученика по имени "${name}". Придумай ему смешную кличку на основе имени и весело высмей его школьную лень, увлечение играми или списывание. Это должно быть без жесткого мата, но смешно и жизненно, в стиле дружеского подкола.`,
      config: {
        systemInstruction: "Ты — дерзкий школьный авторитет ШкЕТ. Роастишь учеников по-дружески, остроумно и молодежно.",
      },
    });
    return response.text || getMockInsult(name);
  } catch (err) {
    return getMockInsult(name);
  }
}

/**
 * Chat with the AI using a voice message or video note
 */
export async function chatWithVoiceOrVideo(
  userId: string,
  base64Data: string,
  mimeType: string,
  isVideo: boolean
): Promise<string> {
  const user = dbInstance.findUser(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const styles = dbInstance.getStyles();
  const activeStyle = styles.find((s) => s.id === user.currentStyleId) || styles[0];
  const settings = dbInstance.getSettings();

  const isPremium = user.isPremium;
  const contextLimit = isPremium ? settings.contextDepthPremium : settings.contextDepthFree;

  // Retrieve message history
  const history = dbInstance.getMessages(userId).slice(-contextLimit);

  if (settings.aiProvider === "grok") {
    const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      const mockReply = `Слушай, бро! Голосовые сообщения и видеокружки временно недоступны при работе через Grok, так как нет активного ключа Gemini для расшифровки звука. Напиши текстом, без обид!`;
      dbInstance.saveMessage(userId, "user", `[${isVideo ? "Видеокружок" : "Голосовое сообщение"}]`);
      dbInstance.saveMessage(userId, "model", mockReply);
      return mockReply;
    }
    // Otherwise fall through to Gemini below to do audio/video transcription and response
  }

  // Construct Gemini parameters
  let systemPrompt = activeStyle.prompt;
  if (isPremium && user.premiumType !== "base" && user.customPrompt) {
    systemPrompt += `\nВНИМАНИЕ: Пользователь активировал персональный стиль. Дополнительное требование к твоему поведению: "${user.customPrompt}". Обязательно соблюдай его!`;
  }

  systemPrompt += `\n\nТебе прислали ${isVideo ? "круглое видеосообщение (видеокружок)" : "голосовое сообщение"}. Прослушай аудиозапись (и посмотри видео, если это кружок), пойми, что говорит/спрашивает пользователь, и ответь ему строго в своей роли! Твои знания предметов должны соответствовать школьной программе, а стиль речи — выбранной личности.`;

  try {
    const mediaPart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    // Prepare contents array matching history
    const contents = history.map((msg) => ({
      role: msg.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: msg.text }],
    }));
    contents.push({ role: "user" as const, parts: [mediaPart as any, { text: "Послушай это голосовое/видео и ответь мне." }] });

    const response = await generateContentWithRetry({
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.9,
      },
    });

    const aiText = response.text || "Слушай, бро, че-то я твой голос не разобрал. Попробуй еще раз сказать почётче!";
    dbInstance.saveMessage(userId, "user", `[${isVideo ? "Видеокружок" : "Голосовое сообщение"}]`);
    dbInstance.saveMessage(userId, "model", aiText);
    return aiText;
  } catch (err) {
    console.warn("Gemini audio/video analysis failed:", err);
    const mockReply = `Слышь, че-то связь глючит, не могу твоё голосовое щас воспроизвести. Напиши лучше текстом, бля!`;
    dbInstance.saveMessage(userId, "user", `[${isVideo ? "Видеокружок" : "Голосовое сообщение"}]`);
    dbInstance.saveMessage(userId, "model", mockReply);
    return mockReply;
  }
}

/**
 * Test AI Provider connections from the admin panel settings
 */
export async function testAiConnection(
  provider: "gemini" | "grok",
  config: { geminiApiKey?: string; grokApiKey?: string; grokModel?: string }
): Promise<string> {
  if (provider === "gemini") {
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Ключ GEMINI_API_KEY не задан ни в настройках, ни в переменных окружения (.env)");
    }
    const testAi = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    const response = await testAi.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Ответь строго одним словом 'УСПЕШНО' на русском языке, если ты меня слышишь.",
    });
    const text = response.text?.trim();
    if (!text) {
      throw new Error("Соединение установлено, но получен пустой ответ от модели.");
    }
    return text;
  } else if (provider === "grok") {
    const apiKey = config.grokApiKey || process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error("Ключ GROK_API_KEY не задан ни в настройках, ни в переменных окружения (.env)");
    }
    const modelToUse = config.grokModel || "grok-2-1212";
    const res = await fetch("https://api.xai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "user", content: "Ответь строго одним словом 'УСПЕШНО' на русском языке, если ты меня слышишь." }
        ],
        temperature: 0.1,
        max_tokens: 15,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Grok API вернул код ошибки ${res.status}: ${errorText}`);
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Соединение установлено, но от Grok API получен пустой ответ.");
    }
    return content;
  } else {
    throw new Error("Неизвестный провайдер ИИ");
  }
}


