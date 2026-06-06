/**
 * 游戏结束 API —— 玩家手动结束或确认裁判建议
 *
 * POST /api/game/:id/end
 * Body: { action: "confirm_end" | "god_end", winnerBotId?: string, reason?: string }
 *
 * 结束游戏的同时，让裁判生成最终总结。
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callModel } from "@/lib/model";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const session = await prisma.gameSession.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!session) {
    return NextResponse.json({ error: "游戏不存在" }, { status: 404 });
  }

  if (session.status === "FINISHED") {
    // 已结束也可以生成总结（用户手动触发）
    console.log("[EndGame] 游戏已结束，尝试生成总结");
  }

  let winnerBotId = body.winnerBotId || null;

  // 确定胜者
  if (body.action === "god_end") {
    const topBot = await prisma.gameBot.findFirst({
      where: { sessionId: id },
      orderBy: { finalScore: "desc" },
    });
    winnerBotId = topBot?.id || null;
  }

  // 结束游戏
  await prisma.gameSession.update({
    where: { id },
    data: { status: "FINISHED", endedAt: new Date(), winnerBotId },
  });

  // ── 生成裁判总结 ──
  try {
    const rule = JSON.parse(session.globalRule);
    const judgeConfig = rule.plugins?.judge?.config || {};
    const judgeModel = judgeConfig.model || "ollama/qwen:7b";

    // 获取完整对话记录
    const rounds = await prisma.round.findMany({
      where: { sessionId: id },
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

    const winnerName =
      session.participants.find((b) => b.id === winnerBotId)?.name || "未确定";
    const allNames = session.participants.map((b) => b.name).join("、");

    // 从全局规则中提取讨论主题
    const topic = rule.description || rule.promptTemplate || "";
    const topicShort = topic.replace(/\{topic\}/g, "").slice(0, 200);

    // 裁判总结 —— 只传对话和用户原始需求，让 V4 自由发挥
    const summaryPrompt = `以下是本次讨论的完整发言记录。

讨论主题：${topicShort}

全程发言：
${transcripts}

请根据以上讨论内容，完成用户要求的总结任务。`;

    const summary = await callModel({
      model: judgeModel,
      messages: [{ role: "user", content: summaryPrompt }],
      maxTokens: 1000,
      temperature: 0.5,
      apiKey: judgeConfig.apiKey || undefined,
      baseURL: judgeConfig.baseURL || undefined,
    });

    // 保存总结到最新轮次
    const latestRound = await prisma.round.findFirst({
      where: { sessionId: id },
      orderBy: { roundNumber: "desc" },
    });
    if (latestRound) {
      await prisma.message.create({
        data: {
          roundId: latestRound.id,
          content: summary,
          role: "system",
          skillSnapshot: "{}",
        },
      });
      console.log(`[EndGame] ✅ 裁判总结已保存`);
    }
  } catch (e: any) {
    console.error(`[EndGame] 生成总结失败: ${e.message}`);
  }

  return NextResponse.json({
    success: true,
    status: "FINISHED",
    winnerBotId,
    reason: body.reason || "游戏结束",
  });
}
