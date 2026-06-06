import fs from "fs";

const raw = fs.readFileSync("spy2.json", "utf-8").replace(/^\uFEFF/, "");
const d = JSON.parse(raw);

console.log("=== 参赛者 ===");
for (const b of d.participants) {
  console.log(`  ${b.name} | 模型: ${b.model} | 分: ${b.finalScore}`);
  console.log(`    人设: ${b.basePrompt || "(无)"}`);
}

console.log("\n=== 全局规则 ===");
const r = d.globalRule;
console.log(`  裁判模型: ${r.plugins?.judge?.config?.model || "无"}`);
console.log(`  最大轮次: ${r.gameRules?.maxRounds} (实际跑了 ${d.currentRound})`);

const winner = d.participants.find((p: any) => p.id === d.winnerBotId);
console.log(`\n🏆 胜者: ${winner ? winner.name + " (" + winner.finalScore + "分)" : "无"}`);

console.log("\n" + "=".repeat(70));
console.log("📝 完整对话");
console.log("=".repeat(70));

for (const round of d.rounds) {
  if (round.roundNumber === 0) continue;
  console.log(`\n── 第 ${round.roundNumber} 轮 ──`);
  for (const m of round.messages) {
    const name = m.gameBot ? m.gameBot.name : m.role;
    console.log(`  [${name}] ${m.content.slice(0, 250)}`);
  }
}
