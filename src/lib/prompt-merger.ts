/**
 * PromptMerger —— 合并全局规则 + 个人技能 + 上帝指令 + 历史消息
 *
 * 输入：
 *   globalRule      - 结构化剧本 JSON
 *   bot             - 当前 Bot 配置（含 basePrompt 和 skillSnapshots）
 *   godIntervention - 上帝干预文本（可选）
 *   chatHistory     - 最近若干条消息
 *
 * 输出：
 *   最终的 { system, messages } 可直接传给 ModelProvider
 */

export interface BotConfig {
  name: string;
  basePrompt?: string | null;
  skillSnapshots: SkillSnapshot[];
}

export interface SkillSnapshot {
  id: string;
  name: string;
  type: "ROLE_PLAY" | "TASK";
  content: string;
}

export interface GlobalRule {
  name?: string;
  description?: string;
  gameRules?: {
    maxRounds?: number;
    minBots?: number;
    maxBots?: number;
    allowGodIntervention?: boolean;
  };
  plugins?: {
    judge?: { type: string; config?: Record<string, unknown> };
    roundControl?: { type: string; config?: Record<string, unknown> };
  };
  promptTemplate?: string;
}

export interface ChatMessage {
  role: string; // "user" | "assistant" | "god"
  content: string;
}

export interface MergedPrompt {
  system: string;
  messages: Array<{ role: string; content: string }>;
}

/**
 * 合并规则：
 * 1. 如果存在 ROLE_PLAY 技能，其 content 作为 system prompt 主体；
 *    否则用 bot.basePrompt。
 * 2. 将 globalRule 中的 promptTemplate 渲染（替换 {topic} 等变量）后追加到 system prompt。
 * 3. 将每个 TASK 技能的 content 作为附加指令追加。
 * 4. 如果存在 godIntervention，以最高优先级插入 system prompt 开头。
 * 5. 将历史消息格式化为 user/assistant 交替。
 */
export function mergePrompt(params: {
  globalRule: GlobalRule;
  bot: BotConfig;
  godIntervention?: string | null;
  chatHistory?: ChatMessage[];
  topic?: string;
}): MergedPrompt {
  const { globalRule, bot, godIntervention, chatHistory, topic } = params;

  const parts: string[] = [];

  // ── (4) 上帝干预 —— 最高优先级 ──
  if (godIntervention) {
    parts.push(`[上帝指令]：${godIntervention}\n`);
  }

  // ── (1) ROLE_PLAY 技能 或 basePrompt ──
  const rolePlay = bot.skillSnapshots.find((s) => s.type === "ROLE_PLAY");
  if (rolePlay) {
    parts.push(rolePlay.content);
  } else if (bot.basePrompt) {
    parts.push(bot.basePrompt);
  }

  // ── (2) Prompt Template ──
  if (globalRule.promptTemplate) {
    let template = globalRule.promptTemplate;
    if (topic) {
      template = template.replace(/\{topic\}/g, topic);
    }
    parts.push(template);
  }

  // ── (3) TASK 技能 ──
  const tasks = bot.skillSnapshots.filter((s) => s.type === "TASK");
  for (const task of tasks) {
    parts.push(`[附加指令]：${task.content}`);
  }

  // ── 组装 system prompt ──
  const system = parts.join("\n\n").trim();

  // ── (5) 历史消息 ──
  const messages: Array<{ role: string; content: string }> = [];

  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      if (msg.role === "god") {
        // 上帝消息不传给模型，只存档
        continue;
      }
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages };
}
