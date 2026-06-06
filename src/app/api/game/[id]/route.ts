/**
 * Game Session API
 *
 * GET   /api/game/:id       - 获取游戏详情
 * POST  /api/game/:id/start - 开始游戏
 * POST  /api/game/:id/turn  - 执行下一回合
 * DELETE /api/game/:id      - 删除游戏
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startGame, nextTurn, getGameState } from "@/lib/game-engine";

// GET /api/game/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const state = await getGameState(id);

  if (!state) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}

// DELETE /api/game/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.gameSession.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
