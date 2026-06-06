import { NextRequest, NextResponse } from "next/server";
import { startGame } from "@/lib/game-engine";

// POST /api/game/:id/start
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await startGame(id);
    return NextResponse.json(session);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
