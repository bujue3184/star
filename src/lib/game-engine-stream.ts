/**
 * GameEngineStream —— 流式游戏回合控制器
 *
 * 与 nextTurn 逻辑相同，但使用 SSE 流式输出每个 token。
 * 每处理一个 Bot 都发送事件，前端实时更新。
 */

import { prisma } from "./prisma";
import { getProvider } from "./model";
import { OllamaProvider } from "./model/ollama-provider";
import { mergePrompt } from "./prompt-merger";
//import { pluginRegistry } from "./plugins";
import type { GlobalRule, BotConfig, ChatMessage } from "./prompt-merger";


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const MODEL_SWITCH_DELAY = 3000;

export interface StreamEvent {
  event: "thinking" | "token" | "bot_done" | "round_complete" | "judge_suggestion" | "directive" | "error";
  data: any;
}

/**
 * 流式执行下一回合
 * 通过 onEvent 回调发送事件，前端实时渲染
 */
export async function nextTurnStream(
  sessionId: string,
  onEvent: (evt: StreamEvent) => Promise<void>,
  opts: { godIntervention?: string; topic?: string } = {}
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: { orderBy: { order: "asc" } },
      rounds: {
        include: { messages: true },
        orderBy: { roundNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!session) throw new Error("Session not found");
  if (session.status !== "IN_PROGRESS")
    throw new Error("Game is not in progress");

  if (session.currentRound >= session.maxRounds) {
    await endGame(sessionId);
    await onEvent({ event: "round_complete", data: { finished: true, reason: "max_rounds_reached" } });
    return;
  }

  const globalRule: GlobalRule = JSON.parse(session.globalRule);

  // 历史消息
  const recentMessages = await prisma.message.findMany({
    where: { round: { sessionId } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { gameBot: true },
  });
  recentMessages.reverse();

  const chatHistory: ChatMessage[] = recentMessages
    .filter((m) => m.role !== "system") // 系统消息不传给模型，避免泄漏
    .map((m) => ({
    role: m.role === "god" ? "god" : "user",
    content: m.gameBot
      ? `【${m.gameBot.name} 发言】：${m.content}`
      : `[上帝]：${m.content}`,
  }));

  // 创建新回合
  const round = await prisma.round.create({
    data: { sessionId, roundNumber: session.currentRound + 1 },
  });

  // ── V4 自由讨论模式 ──
  // 每次 V4 指定一个人发言 → 执行 → 再调 V4 指定下一个 → 直到结束
  const judgeConfig = globalRule.plugins?.judge?.config || {};
  const { LLMJudge } = await import("./plugins/llm-judge");
  const judge = new LLMJudge(judgeConfig);

  const participants = session.participants.map((p) => ({
    id: p.id, name: p.name, model: p.model,
    basePrompt: p.basePrompt,
    skillSnapshots: JSON.parse(p.skillSnapshots || "[]"),
  }));

  let conversationCount = 0;
  const MAX_CONVERSATIONS = Math.max(session.maxRounds * 2, 10);

  while (conversationCount < MAX_CONVERSATIONS) {
    // V4 决定下一位谁发言
    const plan = await judge.orchestrate({
      sessionId, participants, globalRule,
      currentRound: conversationCount + 1,
      maxRounds: MAX_CONVERSATIONS,
    });

    // V4 认为可以结束 → 给前端发裁判建议，让玩家确认
    if (plan.endGame || plan.bots.length === 0) {
      await onEvent({
        event: "judge_suggestion",
        data: {
          winnerId: plan.winnerId || null,
          reason: plan.reason || "导演认为讨论已充分",
          roundNumber: conversationCount,
        },
      });
      // 标记回合完成但不结束游戏
      await prisma.round.update({
        where: { id: round.id },
        data: { finishedAt: new Date() },
      });
      await onEvent({ event: "round_complete", data: { finished: false, roundNumber: conversationCount, roundId: round.id } });
      return;
    }

    // 执行 V4 指定的第一个人
    const item = plan.bots[0];

    conversationCount++;

    const bot = session.participants.find((p) => p.id === item.botId);
    if (!bot) continue;

    await onEvent({ event: "thinking", data: { botIndex: bot.order, botName: bot.name, instruction: item.instruction } });

    const botConfig: BotConfig = {
      name: bot.name,
      basePrompt: bot.basePrompt,
      skillSnapshots: JSON.parse(bot.skillSnapshots),
    };

    const merged = mergePrompt({
      globalRule,
      bot: botConfig,
      godIntervention: opts.godIntervention,
      chatHistory,
      topic: opts.topic,
    });

    const systemPrompt = merged.system;
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt || "请自由发言。" },
      ...merged.messages,
      { role: "user", content: `你是【${bot.name}】。🎯 导演指令：${item.instruction}\n\n请以【${bot.name}】的身份，根据导演的要求发言。` },
    ];

    // 流式调用模型
    let fullContent = "";
    try {
      const provider = getProvider(bot.model);

      if (provider instanceof OllamaProvider) {
        // Ollama 流式调用
        for await (const token of provider.streamCall({
          model: bot.model,
          messages,
          temperature: 0.8,
          maxTokens: 1024,
          apiKey: bot.apiKey || undefined,
          baseURL: bot.baseURL || undefined,
        })) {
          fullContent += token;
          await onEvent({ event: "token", data: { botIndex: bot.order, text: token, botName: bot.name } });
        }
      } else {
        // 非 Ollama（云端）仍用非流式
        const content = await provider.call({
          model: bot.model,
          messages,
          temperature: 0.8,
          maxTokens: 1024,
          apiKey: bot.apiKey || undefined,
          baseURL: bot.baseURL || undefined,
        });
        fullContent = content;
        await onEvent({ event: "token", data: { botIndex: bot.order, text: content, botName: bot.name } });
      }

      // Bot 完成 → 保存到 DB
      await prisma.message.create({
        data: {
          roundId: round.id,
          gameBotId: bot.id,
          content: fullContent || `[${bot.name} 未产生输出]`,
          skillSnapshot: JSON.stringify({ system: systemPrompt, messages: merged.messages }),
          role: "assistant",
        },
      });

      await onEvent({
        event: "bot_done",
        data: { botIndex: bot.order, botName: bot.name, content: fullContent },
      });

      // 记录到 chatHistory 供下个 Bot 参考
      chatHistory.push({
        role: "user",
        content: `【${bot.name} 发言】：${fullContent}`,
      });

      // 模型切换间隔
      if (bot.model.startsWith("ollama/")) {
        await sleep(MODEL_SWITCH_DELAY);
      }
    } catch (error: any) {
      console.error(`[StreamEngine] Bot ${bot.name} 失败:`, error.message);
      await prisma.message.create({
        data: {
          roundId: round.id,
          gameBotId: bot.id,
          content: `[模型调用失败] ${error.message}`,
          skillSnapshot: "{}",
          role: "assistant",
        },
      });
      await onEvent({ event: "error", data: { botIndex: bot.order, error: error.message } });
      // 模型调用失败时，记录到历史让 V4 知道
      chatHistory.push({
        role: "user",
        content: `【系统提示】${bot.name} 未能产生有效回复，请换一个选手发言。`,
      });
    }
  } // end while

  // 达到最大对话次数，发送裁判建议让玩家确认
  await onEvent({
    event: "judge_suggestion",
    data: {
      winnerId: null,
      reason: "达到最大对话次数，导演建议结束",
      roundNumber: conversationCount,
    },
  });
  await prisma.round.update({
    where: { id: round.id },
    data: { finishedAt: new Date() },
  });
  await onEvent({ event: "round_complete", data: { finished: false, reason: "达到最大对话次数", roundNumber: conversationCount, roundId: round.id } });
  return;

}

async function endGame(sessionId: string) {
  const winner = await prisma.gameBot.findFirst({
    where: { sessionId },
    orderBy: { finalScore: "desc" },
  });
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: "FINISHED",
      endedAt: new Date(),
      winnerBotId: winner?.id ?? null,
    },
  });
}
