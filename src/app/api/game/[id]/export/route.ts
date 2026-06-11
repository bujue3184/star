/**
 * 游戏导出 API —— 以 Markdown 格式导出游戏全过程
 *
 * GET /api/game/:id/export
 *
 * 返回 Content-Type: text/markdown 的完整游戏记录
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await prisma.gameSession.findUnique({
    where: { id },
    include: {
      participants: { orderBy: { order: "asc" } },
      rounds: {
        include: {
          messages: {
            include: { gameBot: { select: { name: true, model: true } } },
          },
        },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "游戏不存在" }, { status: 404 });
  }

  try {
    const rule = typeof session.globalRule === "string"
      ? JSON.parse(session.globalRule)
      : session.globalRule;

    const md = buildMarkdown(session, rule);

    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="star-debate-${session.id}.md"`,
      },
    });
  } catch (e: any) {
    console.error("[Export] ❌ 生成 markdown 失败:", e);
    return NextResponse.json({ error: `导出失败: ${e.message}` }, { status: 500 });
  }
}

function buildMarkdown(session: any, rule: any): string {
  const lines: string[] = [];

  // ── 标题 ──
  lines.push(`# ⭐ 星际辩台 · 游戏记录\n`);
  lines.push(`> 导出时间：${new Date().toLocaleString("zh-CN")}\n`);

  // ── 基本信息 ──
  lines.push("## 📋 基本信息\n");
  lines.push(`| 字段 | 内容 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 游戏名称 | ${session.name || "未命名"} |`);
  lines.push(`| 游戏主题 | ${rule.description || rule.promptTemplate || "未设置"} |`);
  lines.push(`| 游戏状态 | ${statusLabel(session.status)} |`);
  lines.push(`| 最大轮次 | ${session.maxRounds} |`);
  lines.push(`| 实际轮次 | ${session.currentRound} |`);
  lines.push(`| 创建时间 | ${new Date(session.createdAt).toLocaleString("zh-CN")} |`);
  if (session.endedAt) {
    lines.push(`| 结束时间 | ${new Date(session.endedAt).toLocaleString("zh-CN")} |`);
  }
  if (session.winnerBotId) {
    const winner = session.participants.find((p: any) => p.id === session.winnerBotId);
    lines.push(`| 胜者 | **${winner?.name || "未知"}** |`);
  }
  lines.push("");

  // ── 通用规则 ──
  if (rule.gameRules) {
    lines.push("## ⚙️ 游戏规则\n");
    if (rule.gameRules.godMode) lines.push("- 模式：**上帝模式**（玩家手动调度）");
    else lines.push("- 模式：**V4 导演模式**（AI 自动调度）");
    if (rule.gameRules.allowGodIntervention) lines.push("- 上帝干预：允许");
    lines.push("");
  }

  // ── 选手配置 ──
  lines.push("## 🤖 选手配置\n");
  for (let i = 0; i < session.participants.length; i++) {
    const bot = session.participants[i];
    lines.push(`### ${i + 1}. ${bot.name}\n`);
    lines.push(`| 字段 | 内容 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 模型 | \`${bot.model}\` |`);
    lines.push(`| 角色设定 | ${bot.basePrompt || "（无）"} |`);
    lines.push(`| API Base URL | ${bot.baseURL || "（默认）"} |`);

    const skills = JSON.parse(bot.skillSnapshots || "[]");
    if (skills.length > 0) {
      lines.push(`| 技能数量 | ${skills.length} |`);
      lines.push("");
      for (let j = 0; j < skills.length; j++) {
        const s = skills[j];
        lines.push(`**技能 ${j + 1}：${s.name}**（${s.type === "ROLE_PLAY" ? "角色扮演" : "任务指令"}）\n`);
        lines.push("```");
        lines.push(s.content);
        lines.push("```\n");
      }
    } else {
      lines.push("");
    }
    lines.push("");
  }

  // ── 对话记录 ──
  lines.push("## 💬 对话记录\n");

  for (const round of session.rounds) {
    const msgs = round.messages || [];
    if (msgs.length === 0) continue;

    if (round.roundNumber === 0) {
      lines.push(`### 🎬 开场\n`);
    } else {
      lines.push(`### 第 ${round.roundNumber} 轮\n`);
    }

    for (const msg of msgs) {
      if (msg.role === "system") {
        lines.push(`> **⚖️ 系统消息**：${msg.content}\n`);
      } else if (msg.gameBot) {
        const speaker = msg.gameBot.name;
        lines.push(`**${speaker}**\n`);
        lines.push(`${msg.content}\n`);
      } else if (msg.role === "god") {
        lines.push(`> **👑 上帝**：${msg.content}\n`);
      } else {
        lines.push(`${msg.content}\n`);
      }
    }
  }

  // ── 页脚 ──
  lines.push("---\n");
  lines.push(`*由 ⭐ 星际辩台 自动生成*\n`);

  return lines.join("\n");
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    WAITING: "⏳ 等待中",
    IN_PROGRESS: "🔄 进行中",
    FINISHED: "✅ 已结束",
  };
  return map[status] || status;
}
