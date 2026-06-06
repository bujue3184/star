import { callModel } from "../src/lib/model";

async function main() {
  console.log("🧪 Testing Ollama connection...\n");

  const models = [
    { label: "Qwen 7B", model: "ollama/qwen:7b" },
    { label: "DeepSeek R1 8B", model: "ollama/deepseek-r1:8b" },
    { label: "Gemma 3 4B", model: "ollama/gemma3:4b" },
  ];

  for (const { label, model } of models) {
    try {
      const res = await callModel({
        model,
        messages: [
          {
            role: "user",
            content: `Reply with exactly: "Hello from ${label}! I am ready."`,
          },
        ],
        maxTokens: 100,
      });
      console.log(`✅ ${label}: ${res.trim()}`);
    } catch (e: any) {
      console.log(`❌ ${label}: ${e.message}`);
    }
  }
}

main();
