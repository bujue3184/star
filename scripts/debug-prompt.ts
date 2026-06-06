/**
 * Prompt 调试脚本 —— 运行后查看发给每个模型的完整 prompt
 *
 * 使用方法: npx tsx scripts/debug-prompt.ts <gameId>
 */

import { prisma } from "../src/lib/prisma";

async function main() {
  const gameId = process.argv[2];
  if (!gameId) {
    console.error("请提供 gameId: npx tsx scripts/debug-prompt.ts <gameId>");
    process.exit(1);
  }

  const session = await prisma.gameSession.findUnique({
    where: { id: gameId },
    include: {
      participants: { orderBy: { order: "asc" } },
      rounds: {
        include: {
          messages: {
            include: { gameBot: { select: { name: true } } },
          },
        },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  if (!session) {
    console.error("Game not found");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("🎮 游戏:", session.name);
  console.log("状态:", session.status);
  console.log("=".repeat(60));

  // 解析全局规则
  const globalRule = JSON.parse(session.globalRule);
  console.log("\n📋 全局规则:");
  console.log(JSON.stringify(globalRule, null, 2));

  // 显示每个 round 的 messages
  for (const round of session.rounds) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📝 第 ${round.roundNumber} 轮`);
    console.log(`${"=".repeat(60)}`);

    for (const msg of round.messages) {
      const sender = msg.gameBot?.name || msg.role;
      console.log(`\n── [${sender}] ──`);
      console.log(msg.content.slice(0, 300));
      if (msg.content.length > 300) console.log("...（截断）");

      // 显示 skillSnapshot（如果存在且有内容）
      if (msg.skillSnapshot && msg.skillSnapshot !== "{}") {
        const snap = JSON.parse(msg.skillSnapshot);
        if (snap.system) {
          console.log("\n╔══ 实际发送的 System Prompt ══╗");
          console.log(snap.system);
          console.log("╚════════════════════════════════╝");
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
