/**
 * Game API
 *
 * GET  /api/game        - 获取游戏列表
 * POST /api/game        - 创建新游戏
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/game - 获取所有游戏
export async function GET() {
  const sessions = await prisma.gameSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, rounds: true } },
    },
  });

  return NextResponse.json(sessions);
}

// POST /api/game - 创建新游戏
export async function POST(request: NextRequest) {
  const body = await request.json();

  // 解析请求体
  const { name, globalRule, bots } = body;

  if (!name || !bots || !Array.isArray(bots) || bots.length < 2) {
    return NextResponse.json(
      { error: "需要至少 2 个 Bot 参与游戏" },
      { status: 400 }
    );
  }

  // 解析全局规则
  const rule: {
    gameRules?: { maxRounds?: number };
    [key: string]: unknown;
  } = typeof globalRule === "string" ? JSON.parse(globalRule) : globalRule;

  const maxRounds = rule.gameRules?.maxRounds ?? 3;

  // 创建游戏会话
  const session = await prisma.gameSession.create({
    data: {
      name,
      globalRule: JSON.stringify(rule),
      maxRounds,
      status: "WAITING",
      participants: {
        create: bots.map((bot: any, index: number) => ({
          name: bot.name || `Bot ${index + 1}`,
          model: bot.model || "ollama/qwen:7b",
          order: bot.order ?? index, // 使用前端传入的席位顺序，不依赖数组索引
          basePrompt: bot.basePrompt || null,
          apiKey: bot.apiKey || null,
          baseURL: bot.baseURL || null,
          skillSnapshots: JSON.stringify(bot.skillSnapshots || []),
        })),
      },
    },
    include: { participants: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(session, { status: 201 });
}
