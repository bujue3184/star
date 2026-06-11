import fs from "fs";

const raw = fs.readFileSync("game.json", "utf-8").replace(/^\uFEFF/, "");
const d = JSON.parse(raw);

console.log("judge: " + d.globalRule.plugins.judge.config.model);
console.log("");
console.log("participants:");
for (const b of d.participants) {
  console.log("  " + b.name + " | " + b.model + " | order=" + b.order + " | prompt: " + (b.basePrompt || "(none)").slice(0, 60));
}

console.log("");
console.log("=== messages ===");
for (const round of d.rounds) {
  if (round.roundNumber === 0) continue;
  console.log("-- round " + round.roundNumber + " --");
  let n = 1;
  for (const m of round.messages) {
    if (m.gameBot) {
      const txt = m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
      console.log(n + ". [" + m.gameBot.name + "] " + txt.replace(/\n/g, " "));
      n++;
    }
  }
}
