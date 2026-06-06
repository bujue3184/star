import { NextRequest, NextResponse } from "next/server";
import { nextTurn } from "@/lib/game-engine";

const TURN_TIMEOUT = 600_000; // 10 分钟，适配大模型（qwen3.6:latest 加载慢）

// POST /api/game/:id/turn
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // 用 Promise.race 实现超时，避免前端无限等待
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`回合超时 (${TURN_TIMEOUT / 1000}秒)`)),
      TURN_TIMEOUT
    )
  );

  try {
    const result = await Promise.race([
      nextTurn(id, {
        godIntervention: body.godIntervention,
        topic: body.topic,
      }),
      timeoutPromise,
    ]);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[Turn API] ❌ 回合失败:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
