/**
 * 上帝直接指令 API —— 玩家手动指定某个模型发言
 *
 * POST /api/game/:id/direct/stream
 * Body: { botId: string, instruction: string }
 *
 * 返回 SSE 流，与 /turn/stream 相同的事件格式
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/model";
import { OllamaProvider } from "@/lib/model/ollama-provider";
import { mergePrompt } from "@/lib/prompt-merger";
import type { BotConfig, GlobalRule, ChatMessage } from "@/lib/prompt-merger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { botId, instruction } = body;

  if (!botId || !instruction) {
    return new Response("Missing botId or instruction", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const send = (event: string, data: any) => {
    if (closed) return;
    try {
      return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { return new Uint8Array(0); }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try { controller.enqueue(chunk); }
        catch { closed = true; }
      };

      const session = await prisma.gameSession.findUnique({
        where: { id },
        include: { participants: { orderBy: { order: "asc" } } },
      });

      if (!session || session.status !== "IN_PROGRESS") {
        safeEnqueue(send("error", { error: "游戏未在进行中" })!);
        closed = true;
        controller.close();
        return;
      }

      const bot = session.participants.find((p) => p.id === botId);
      if (!bot) {
        safeEnqueue(send("error", { error: "未找到该选手" })!);
        closed = true;
        controller.close();
        return;
      }

      const globalRule: GlobalRule = JSON.parse(session.globalRule);

      // 获取历史消息
      const recentMessages = await prisma.message.findMany({
        where: { round: { sessionId: id } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { gameBot: true },
      });
      recentMessages.reverse();

      const chatHistory: ChatMessage[] = recentMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "god" ? "god" : "user",
          content: m.gameBot ? `【${m.gameBot.name} 发言】：${m.content}` : `[上帝]：${m.content}`,
        }));

      safeEnqueue(send("thinking", { botIndex: bot.order, botName: bot.name })!);

      const botConfig: BotConfig = {
        name: bot.name,
        basePrompt: bot.basePrompt,
        skillSnapshots: JSON.parse(bot.skillSnapshots || "[]"),
      };

      const merged = mergePrompt({
        globalRule,
        bot: botConfig,
        chatHistory,
      });

      const systemPrompt = merged.system;
      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt || "请自由发言。" },
        ...merged.messages,
        { role: "user", content: `【上帝指令】${instruction}\n\n请根据上帝的指令发言。` },
      ];

      let fullContent = "";
      try {
        const provider = getProvider(bot.model);
        if (provider instanceof OllamaProvider) {
          for await (const token of provider.streamCall({
            model: bot.model, messages,
            temperature: 0.8, maxTokens: 1024,
            apiKey: bot.apiKey || undefined,
            baseURL: bot.baseURL || undefined,
          })) {
            fullContent += token;
            safeEnqueue(send("token", { botIndex: bot.order, text: token, botName: bot.name })!);
          }
        } else {
          const content = await provider.call({
            model: bot.model, messages,
            temperature: 0.8, maxTokens: 1024,
            apiKey: bot.apiKey || undefined,
            baseURL: bot.baseURL || undefined,
          });
          fullContent = content;
          safeEnqueue(send("token", { botIndex: bot.order, text: content, botName: bot.name })!);
        }

        // 保存到 DB
        const round = await prisma.round.findFirst({
          where: { sessionId: id },
          orderBy: { roundNumber: "desc" },
        });
        if (round) {
          await prisma.message.create({
            data: {
              roundId: round.id,
              gameBotId: bot.id,
              content: fullContent || `[${bot.name} 未产生输出]`,
              skillSnapshot: JSON.stringify({ system: systemPrompt }),
              role: "assistant",
            },
          });
        }

        safeEnqueue(send("bot_done", { botIndex: bot.order, botName: bot.name, content: fullContent })!);
      } catch (e: any) {
        safeEnqueue(send("error", { botIndex: bot.order, error: e.message })!);
      }

      safeEnqueue(send("round_complete", { finished: false })!);
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
