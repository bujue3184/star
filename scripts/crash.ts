import fs from "fs";
const raw = fs.readFileSync("crash.json", "utf-8").replace(/^\uFEFF/, "");
const d = JSON.parse(raw);

console.log("=== participants ===");
for (const b of d.participants) {
  console.log("  seat " + b.order + " | " + b.name + " | " + b.model + " | prompt:" + (b.basePrompt || "none").slice(0, 40));
}

const r = d.globalRule;
console.log("\n=== judge ===");
console.log("  model: " + (r.plugins?.judge?.config?.model || "none") + ", apiKey:" + (r.plugins?.judge?.config?.apiKey ? "yes" : "no"));
console.log("  promptTemplate: " + (r.promptTemplate || "").slice(0, 200));

console.log("\n=== rounds ===");
for (const rd of d.rounds) {
  if (rd.roundNumber === 0) continue;
  console.log("-- round " + rd.roundNumber + " --");
  for (const m of rd.messages) {
    if (m.gameBot) {
      console.log("  [" + m.gameBot.name + "] len=" + m.content.length + " " + m.content.slice(0, 200));
    } else if (m.role === "system") {
      console.log("  [system] len=" + m.content.length + " " + m.content.slice(0, 300));
    }
  }
}

console.log("\n=== message stats ===");
for (const b of d.participants) {
  const msgs = d.rounds.flatMap((r: any) => r.messages).filter((m: any) => m.gameBot?.id === b.id);
  for (const m of msgs) {
    console.log("  " + b.name + " round " + m.round?.roundNumber + ": len=" + m.content.length + " starts with: " + m.content.slice(0, 80));
  }
}
