/**
 * 流式回合 API —— 使用 SSE (Server-Sent Events) 逐 token 推送
 *
 * POST /api/game/:id/turn/stream
 *
 * 前端消费方式：
 *   const res = await fetch(url, { method: 'POST', body: JSON.stringify({...}) });
 *   const reader = res.body.getReader();
 *   // 读取事件流...
 */

import { NextRequest } from "next/server";
import { nextTurnStream, type StreamEvent } from "@/lib/game-engine-stream";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const encoder = new TextEncoder();

  let closed = false;
  const send = (event: string, data: any) => {
    if (closed) return;
    try {
      const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return encoder.encode(msg);
    } catch {
      return new Uint8Array(0);
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      /** 安全地往流中写入数据，忽略"控制器已关闭"这类断连错误 */
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch (e: any) {
          // 浏览器断连或流已关闭，忽略错误
          if (e.message?.includes("Controller is already closed") || e.message?.includes("closed")) {
            closed = true;
          }
        }
      };

      const onEvent = async (evt: StreamEvent) => {
        if (closed) return;
        const chunk = send(evt.event, evt.data);
        if (chunk && chunk.length > 0) {
          safeEnqueue(chunk);
        }
      };

      try {
        await nextTurnStream(
          id,
          onEvent,
          {
            godIntervention: body.godIntervention,
            topic: body.topic,
          }
        );
      } catch (e: any) {
        console.error("[StreamRoute] 错误:", e.message);
        const errChunk = send("error", { error: e.message });
        if (errChunk && !closed) safeEnqueue(errChunk);
      } finally {
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
