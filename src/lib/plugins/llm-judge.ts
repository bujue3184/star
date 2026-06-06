/**
 * LLMJudge —— 基于 LLM 的裁判插件
 *
 * 不设打分机制。裁判的职责：
 * 1. 每轮结束后阅读所有发言，判断游戏是否应该提前结束
 * 2. 游戏结束时，根据全程对话判定胜者
 */

import type { JudgePlugin, GameContext, RoundEndResult } from "./types";
import { callModel } from "../model";
import { prisma } from "../prisma";

export interface LLMJudgeConfig {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

export class LLMJudge implements JudgePlugin {
  private config: LLMJudgeConfig;

  constructor(config: LLMJudgeConfig = {}) {
    this.config = {
      model: config.model || "ollama/qwen:7b",
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    };
  }

  /**
   * 每轮结束后调用 —— 仅做游戏进程裁定，不打分
   */
  async onRoundEnd(
    roundId: string,
    _context: GameContext
  ): Promise<RoundEndResult> {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        messages: {
          include: { gameBot: true },
          where: { role: "assistant" },
        },
        session: {
          include: {
            participants: true,
            rounds: {
              include: {
                messages: {
                  include: { gameBot: true },
                  where: { role: "assistant" },
                },
              },
              orderBy: { roundNumber: "asc" },
            },
          },
        },
      },
    });

    if (!round || !round.session) return { scores: new Map() };

    const model = this.config.model ?? "ollama/qwen:7b";
    const currentRound = round.session.currentRound;
    const maxRounds = round.session.maxRounds;

    // 前两轮不判定，给模型足够时间展开
    if (currentRound <= 1) {
      return { scores: new Map(), action: { type: "continue" } };
    }

    // 拼接全部历史发言（所有轮次）
    const allTranscripts = round.session.rounds
      .flatMap((r) => r.messages)
      .filter((m) => m.gameBot)
      .map((m) => `【${m.gameBot!.name}】：${m.content.slice(0, 300)}`)
      .join("\n\n");

    const participants = round.session.participants.map((b) => b.name).join("、");

    const prompt = `你是一个游戏裁判。以下是第 ${currentRound}/${maxRounds} 轮的发言记录。

参赛者：${participants}

历史发言：
${allTranscripts}

请判断游戏是否应该提前结束。
- 如果应该继续，输出：CONTINUE
- 如果应该结束，输出：END_GAME|胜者名字|结束原因`;

    try {
      const result = await callModel({
        model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 200,
        temperature: 0.3,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });

      // 提取裁定文本（剥离 markdown）
      const trimmed = result.replace(/```[\s\S]*?\n/, "").replace(/\n```/, "").trim();
      console.log(`[LLMJudge] 裁判裁定: ${trimmed.slice(0, 150)}`);

      if (trimmed.startsWith("END_GAME")) {
        const parts = trimmed.split("|");
        const winnerName = parts[1]?.trim();
        const reason = parts.slice(2).join("|").trim() || "裁判认为游戏已有结论";

        const winner = round.session.participants.find(
          (b: any) => b.name === winnerName
        );
        if (winner) {
          console.log(`[LLMJudge] 🏁 建议结束: ${winnerName} - ${reason}`);
          return {
            scores: new Map(),
            action: { type: "suggest_end", winnerId: winner.id, reason },
          };
        }
      }
    } catch (e: any) {
      console.error(`[LLMJudge] 裁定失败: ${e.message}`);
    }

    return { scores: new Map(), action: { type: "continue" } };
  }

  /**
   * 游戏结束时调用 —— 根据全程对话判定谁最应该获胜
   */
  async onGameEnd(
    sessionId: string,
    _context: GameContext
  ): Promise<string | null> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: true,
        rounds: {
          include: {
            messages: {
              include: { gameBot: true },
              where: { role: "assistant" },
            },
          },
          orderBy: { roundNumber: "asc" },
        },
      },
    });
    if (!session || session.participants.length === 0) return null;

    const model = this.config.model ?? "ollama/qwen:7b";

    // 拼接全程对话
    const allMsgs = session.rounds
      .flatMap((r) => r.messages)
      .filter((m) => m.gameBot)
      .map((m) => `【${m.gameBot!.name}】：${m.content.slice(0, 500)}`)
      .join("\n\n");

    const prompt = `你是一个游戏裁判。游戏已结束，请根据全程对话判定谁表现最好、应该获胜。

参赛者：${session.participants.map((b) => b.name).join("、")}

全程对话：
${allMsgs}

回答格式（只输出一行）：WINNER|胜者名字|获胜理由（简短）`;

    try {
      const result = await callModel({
        model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 200,
        temperature: 0.3,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });

      const trimmed = result.replace(/```[\s\S]*?\n/, "").replace(/\n```/, "").trim();
      console.log(`[LLMJudge] 终局裁定: ${trimmed.slice(0, 150)}`);

      if (trimmed.startsWith("WINNER")) {
        const name = trimmed.split("|")[1]?.trim();
        const winner = session.participants.find((b) => b.name === name);
        if (winner) return winner.id;
      }
    } catch (e: any) {
      console.error(`[LLMJudge] 终局裁定失败: ${e.message}`);
    }

    // 兜底：返回第一个参与者
    return session.participants[0]?.id ?? null;
  }

  /**
   * 统筹规划 —— V4 根据全局 prompt 和当前进度，决定下轮谁发言、说什么
   */
  async orchestrate(params: {
    sessionId: string;
    participants: Array<{
      id: string; name: string; model: string;
      basePrompt?: string | null;
    }>;
    globalRule: any;
    currentRound: number;
    maxRounds: number;
  }): Promise<{
    bots: Array<{ botId: string; instruction: string }>;
    phase: string;
    endGame?: boolean;
    winnerId?: string;
    reason?: string;
  }> {
    const model = this.config.model ?? "ollama/qwen:7b";

    // 获取全部历史发言
    const rounds = await prisma.round.findMany({
      where: { sessionId: params.sessionId },
      include: {
        messages: {
          include: { gameBot: { select: { name: true } } },
          where: { role: "assistant" },
        },
      },
      orderBy: { roundNumber: "asc" },
    });

    const transcripts = rounds
      .filter((r) => r.roundNumber > 0)
      .flatMap((r) => r.messages)
      .filter((m) => m.gameBot)
      .map((m) => `【${m.gameBot!.name}】：${m.content.slice(0, 500)}`)
      .join("\n\n");

    const topic = params.globalRule.promptTemplate || params.globalRule.description || "";
    const allNames = params.participants.map((p) => p.name).join("、");

    // 构建每位选手的角色概要（不含技能详情，技能只传给选手自己）
    const playerProfiles = params.participants
      .map((p) => {
        // 从 basePrompt 提取角色身份和游戏目标
        const bp = p.basePrompt || "";
        const roleMatch = bp.match(/你是[^。]+/);
        const goalMatch = bp.match(/你的[^。]*目标[^。]*。/);
        const summary = [roleMatch?.[0], goalMatch?.[0]].filter(Boolean).join("；");
        return `  ${p.name}${summary ? `：${summary}` : ""}`;
      })
      .join("\n");

    const prompt = `【游戏主题】
${topic}

【参与选手档案】（每位选手有独立的角色设定和技能，请据此调度对话）
${playerProfiles}

【当前进度】第 ${params.currentRound} 轮对话（总计不超过 ${params.maxRounds} 轮）

【已有发言】
${transcripts || "（尚无发言）"}

【你的职责】
你是一名讨论导演，负责调度整场讨论，推动剧情发展。

可用指令（每次只能输出一个）：
1. SPEAK|选手名|当前情况
   告诉该选手现在是什么局面、发言方向，不要替他写具体内容
   示例：SPEAK|DeepSeek|Gemini刚才质疑了你的方案，请回应

2. END|结束原因
   结束整场讨论

【规则】
- 只描述当前局面和发言方向，不要替选手写稿
- 根据上一位的发言决定下一位
- 可多次调用同一选手
- 游戏目标达成时才输出END`;

    try {
      const result = await callModel({
        model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 500,
        temperature: 0.5,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });

      const text = result.replace(/```[\s\S]*?\n/g, "").replace(/\n```/g, "").trim();
      console.log(`[LLMJudge] V4 统筹: ${text.slice(0, 300)}`);

      const lines = text.split("\n").filter((l) => l.trim());
      let phase = "讨论";
      const bots: Array<{ botId: string; instruction: string }> = [];

      for (const line of lines) {
        if (line.startsWith("PHASE|")) {
          phase = line.slice(6).trim();
        } else if (line.startsWith("SPEAK|")) {
          const parts = line.split("|");
          const name = parts[1]?.trim();
          const instruction = parts.slice(2).join("|").trim();
          const bot = params.participants.find((p) => p.name === name);
          if (bot && instruction) {
            bots.push({ botId: bot.id, instruction });
          }
        } else if (line.startsWith("END|")) {
          const parts = line.split("|");
          const reason = parts[1]?.trim() || "讨论完成";
          const winnerName = parts[2]?.trim();
          const winner = params.participants.find((p) => p.name === winnerName);
          return {
            bots: [],
            phase,
            endGame: true,
            winnerId: winner?.id,
            reason,
          };
        }
      }

      // 如果 V4 没安排任何人（可能格式不对），默认让所有人发言
      if (bots.length === 0) {
        for (const p of params.participants) {
          bots.push({ botId: p.id, instruction: "请自由发言" });
        }
      }

      return { bots, phase };
    } catch (e: any) {
      console.error(`[LLMJudge] 统筹失败: ${e.message}`);
      // 失败时默认让所有人发言
      return {
        bots: params.participants.map((p) => ({
          botId: p.id,
          instruction: "请自由发言",
        })),
        phase: "自由讨论",
      };
    }
  }
}
