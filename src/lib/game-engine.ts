/**
 * GameEngine —— 游戏回合控制器
 *
 * 核心方法：
 *   startGame(sessionId)       - 开始游戏
 *   nextTurn(sessionId, opts)  - 执行下一回合
 */

import { prisma } from "./prisma";
import { getProvider } from "./model";
import { mergePrompt } from "./prompt-merger";
import { pluginRegistry } from "./plugins";
import type { GlobalRule, BotConfig, ChatMessage } from "./prompt-merger";
import type { GameContext } from "./plugins/types";

/** 延时工具：等待指定毫秒数，用于模型切换时给 Ollama 释放显存的时间 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 本地模型切换间隔（毫秒）—— 让 Ollama 卸载旧模型、加载新模型 */
const MODEL_SWITCH_DELAY = 3000;

interface NextTurnOptions {
  godIntervention?: string;
  topic?: string;
}

/**
 * 开始游戏：将状态从 WAITING 转为 IN_PROGRESS
 */
export async function startGame(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { participants: { orderBy: { order: "asc" } } },
  });

  if (!session) throw new Error("Session not found");
  if (session.status !== "WAITING") throw new Error("Game already started");

  // 设置状态为进行中
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "IN_PROGRESS", currentRound: 0 },
  });

  // 解析全局规则获取辩题
  const globalRule: GlobalRule = JSON.parse(session.globalRule);
  const topic =
    globalRule.promptTemplate?.replace(/\{topic\}/g, "").trim() ||
    "未指定辩题";

  // 创建第 0 轮（开场轮次）：显示辩题 + 裁判裁定发言顺序
  const round0 = await prisma.round.create({
    data: {
      sessionId,
      roundNumber: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  // 辩题消息
  const botList = session.participants
    .sort((a, b) => a.order - b.order)
    .map((b) => b.name)
    .join("、");
  await prisma.message.create({
    data: {
      roundId: round0.id,
      content: `📋 游戏主题：${topic}\n\n参赛者：${botList}\n\n裁判正在裁定发言顺序...`,
      role: "system",
      skillSnapshot: "{}",
    },
  });

  // 裁判裁定发言顺序（并存储到 globalRule.speakingOrder）
  const judgeModel = globalRule.plugins?.judge?.config?.model || "ollama/qwen:7b";
  let speakingOrderIds: string[] = [];

  try {
    const { callModel } = await import("./model");
    const orderResult = await callModel({
      model: judgeModel as string,
      messages: [
        {
          role: "system",
          content:
            "你是一个裁判。请将以下参与者随机排列成一个发言顺序。\n规则：每个名字必须来自名单，不能重复，不能遗漏。",
        },
        {
          role: "user",
          content: `参与者名单：${botList}\n\n请用以下格式输出（只输出数字+名字，不要多余内容）：\n1. DeepSeek\n2. Gemma\n3. 千问`,
        },
      ],
      maxTokens: 200,
      temperature: 0.9,
    });

    // 解析裁判返回的顺序：提取行首数字后的名字
    const nameLines = orderResult.split("\n").filter((l: string) => /^\d+\./.test(l.trim()));
    const orderedNames = nameLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());
    console.log(`[GameEngine] 裁判裁定顺序:`, orderedNames);

    // 匹配名字到 bot ID
    if (orderedNames.length === session.participants.length) {
      speakingOrderIds = orderedNames
        .map((name: string) => session.participants.find((b) => b.name === name)?.id)
        .filter(Boolean) as string[];
    }

    // 存储顺序到 globalRule
    const updatedRule = { ...globalRule, speakingOrder: speakingOrderIds };
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { globalRule: JSON.stringify(updatedRule) },
    });

    await prisma.message.create({
      data: {
        roundId: round0.id,
        content: `🎯 裁判裁定发言顺序：\n\n${orderResult}`,
        role: "system",
        skillSnapshot: "{}",
      },
    });
    console.log(`[GameEngine] ✅ 发言顺序已存储:`, speakingOrderIds);
  } catch (e: any) {
    console.warn(`[GameEngine] 裁判裁定顺序失败（不影响游戏）: ${e.message}`);
    // 使用默认顺序（按 order 字段）
    speakingOrderIds = session.participants.sort((a, b) => a.order - b.order).map((b) => b.id);
    const defaultOrder = session.participants
      .sort((a, b) => a.order - b.order)
      .map((b, i) => `${i + 1}. ${b.name}`)
      .join("\n");

    // 存储默认顺序
    const updatedRule = { ...globalRule, speakingOrder: speakingOrderIds };
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { globalRule: JSON.stringify(updatedRule) },
    });

    await prisma.message.create({
      data: {
        roundId: round0.id,
        content: `🎯 发言顺序（默认）：\n\n${defaultOrder}`,
        role: "system",
        skillSnapshot: "{}",
      },
    });
  }

  const updated = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { participants: { orderBy: { order: "asc" } } },
  });

  return updated;
}

/**
 * 执行下一回合
 *
 * 流程：
 * 1. 验证状态为 IN_PROGRESS
 * 2. 获取当前回合数，若已到 maxRounds 则结束
 * 3. 创建新 Round
 * 4. 按 order 顺序遍历每个 GameBot：
 *    a. 调用 PromptMerger 构建 prompt
 *    b. 通过 ModelProvider 调用模型
 *    c. 保存 Message
 * 5. 若有裁判插件，调用 onRoundEnd 获取分数
 * 6. 更新 Round 完成状态，递增 session.currentRound
 * 7. 调用轮次控制插件判断是否结束
 */
export async function nextTurn(
  sessionId: string,
  opts: NextTurnOptions = {}
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

  // 检查是否达到最大轮次
  if (session.currentRound >= session.maxRounds) {
    await endGame(sessionId);
    return { finished: true, reason: "max_rounds_reached" };
  }

  // 解析全局规则
  const globalRule: GlobalRule = JSON.parse(session.globalRule);

  // 获取最近的历史消息（最近 20 条）
  const recentMessages = await prisma.message.findMany({
    where: {
      round: { sessionId },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { gameBot: true },
  });
  recentMessages.reverse();

  const chatHistory: ChatMessage[] = recentMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({
    role: m.role === "god" ? "god" : "user",
    content: m.gameBot
      ? `【${m.gameBot.name} 发言】：${m.content}`
      : `[上帝]：${m.content}`,
  }));

  // 创建新回合
  const round = await prisma.round.create({
    data: {
      sessionId,
      roundNumber: session.currentRound + 1,
    },
  });

  // 按裁判裁定的发言顺序排列 Bot
  const globalRuleAny = globalRule as any;
  const speakingOrder = globalRuleAny.speakingOrder as string[] | undefined;
  let orderedBots = [...session.participants];
  if (speakingOrder && speakingOrder.length === session.participants.length) {
    orderedBots = speakingOrder
      .map((id) => session.participants.find((b) => b.id === id))
      .filter(Boolean) as typeof orderedBots;
    console.log(`[GameEngine] 按裁判顺序发言:`, orderedBots.map((b) => b.name));
  }

  // 按顺序让每个 Bot 发言
  for (const bot of orderedBots) {
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

    // 直接用 mergePrompt 产出的内容，不做任何额外规则添加
    const systemPrompt = merged.system;
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt || "请自由发言。" },
      ...merged.messages,
      { role: "user", content: `【${bot.name}】，现在轮到你发言了。${bot.basePrompt ? `请记住你的设定：${bot.basePrompt}` : "请自由发言。"}` },
    ];

    // 调用模型（传 API Key / Base URL）
    try {
      const provider = getProvider(bot.model);
      const content = await provider.call({
        model: bot.model,
        messages,
        temperature: 0.8,
        maxTokens: 1024,
        apiKey: bot.apiKey || undefined,
        baseURL: bot.baseURL || undefined,
      });

      // 保存发言
      await prisma.message.create({
        data: {
          roundId: round.id,
          gameBotId: bot.id,
          content,
          skillSnapshot: JSON.stringify({
            system: systemPrompt,
            messages: merged.messages,
          }),
          role: "assistant",
        },
      });

      // 添加到历史（供下一个 Bot 参考）
      chatHistory.push({
        role: "user",
        content: `【${bot.name} 发言】：${content}`,
      });

      // 模型切换间隔：释放显存，避免 8G 显存同时加载多个 OOM
      const isLastBot =
        orderedBots.indexOf(bot) ===
        orderedBots.length - 1;
      if (!isLastBot && bot.model.startsWith("ollama/")) {
        console.log(
          `[GameEngine] 等待 ${MODEL_SWITCH_DELAY}ms 释放 ${bot.model} 显存...`
        );
        await sleep(MODEL_SWITCH_DELAY);
      }
    } catch (error: any) {
      // 模型调用失败时记录错误消息
      await prisma.message.create({
        data: {
          roundId: round.id,
          gameBotId: bot.id,
          content: `[模型调用失败] ${error.message}`,
          skillSnapshot: "{}",
          role: "assistant",
        },
      });
    }
  }

  // 标记回合完成
  await prisma.round.update({
    where: { id: round.id },
    data: { finishedAt: new Date() },
  });

  // 更新当前回合数
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { currentRound: { increment: 1 } },
  });

  // 构建 GameContext
  const context: GameContext = {
    prisma,
    sessionId,
    currentRound: session.currentRound + 1,
    maxRounds: session.maxRounds,
  };

  // 从全局规则创建裁判实例（支持每场游戏独立配置模型和API Key）
  const judgeConfig = globalRule.plugins?.judge?.config || {};
  const { LLMJudge } = await import("./plugins/llm-judge");
  const judge = new LLMJudge(judgeConfig);
  if (judge) {
    try {
      const result = await judge.onRoundEnd(round.id, context);
      console.log(`Round ${round.roundNumber} scores:`, Object.fromEntries(result.scores));

      // 裁判建议提前结束？（不直接执行，留给玩家确认）
      if (result.action?.type === "suggest_end") {
        const suggestionMsg = `⚖️ 裁判建议：${result.action.reason || "游戏已有结论"}\n建议胜者：${result.action.winnerId ? (await prisma.gameBot.findUnique({ where: { id: result.action.winnerId } }))?.name : "待定"}`;
        await prisma.message.create({
          data: {
            roundId: round.id,
            content: suggestionMsg,
            role: "system",
            skillSnapshot: "{}",
          },
        });
        console.log(`[GameEngine] ⚖️ 裁判建议结束，等待玩家确认`);
      }
    } catch (e) {
      console.error("Judge plugin error:", e);
    }
  }
  // 执行轮次控制插件
  const controlType = globalRule.plugins?.roundControl?.type || "maxRounds";
  const control = pluginRegistry.getRoundControl(controlType);
  let shouldEnd = false;
  if (control) {
    try {
      shouldEnd = await control.shouldEnd(context);
    } catch (e) {
      console.error("RoundControl plugin error:", e);
    }
  }

  if (shouldEnd) {
    const winnerId = judge ? await judge.onGameEnd(sessionId, context) : null;
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: "FINISHED",
        endedAt: new Date(),
        winnerBotId: winnerId,
      },
    });
    return {
      finished: true,
      reason: "game_ended_by_plugin",
      roundNumber: round.roundNumber,
      winnerBotId: winnerId,
    };
  }

  return {
    finished: false,
    roundNumber: round.roundNumber,
    roundId: round.id,
  };
}

/**
 * 结束游戏
 */
async function endGame(sessionId: string) {
  // 找出分数最高的 Bot
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

/**
 * 获取游戏状态
 */
export async function getGameState(sessionId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: { orderBy: { order: "asc" } },
      rounds: {
        include: {
          messages: {
            include: { gameBot: { select: { id: true, name: true } } },
          },
        },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  if (!session) return null;

  return {
    ...session,
    globalRule: JSON.parse(session.globalRule),
  };
}
