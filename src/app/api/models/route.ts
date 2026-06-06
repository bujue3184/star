/**
 * Models API —— AI 模型探测
 *
 * GET /api/models          - 探测本地 Ollama 模型列表
 * POST /api/models/test    - 测试模型连通性
 */

import { NextRequest, NextResponse } from "next/server";

const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";

// GET /api/models - 获取可用模型列表
export async function GET() {
  console.log("[Models API] 探测 Ollama 模型...");

  const models: Array<{
    name: string;
    provider: string;
    local: boolean;
    size: string;
  }> = [];

  // 1. 探测本地 Ollama
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const m of data.models || []) {
        models.push({
          name: `ollama/${m.name}`,
          provider: "ollama",
          local: true,
          size: formatSize(m.size),
        });
      }
      console.log(`[Models API] ✅ Ollama 返回 ${data.models?.length || 0} 个模型`);
    }
  } catch (e: any) {
    console.log(`[Models API] ⚠️ Ollama 连接失败: ${e.message}`);
  }

  // 2. 云端模型预设
  const cloudModels = [
    // OpenAI
    { name: "openai/gpt-4o", provider: "openai" },
    { name: "openai/gpt-4o-mini", provider: "openai" },
    // DeepSeek
    { name: "deepseek/deepseek-chat", provider: "deepseek" },
    { name: "deepseek/deepseek-reasoner", provider: "deepseek" },
    // 豆包（火山引擎）
    { name: "volcengine/doubao-1-5-pro-32k-250115", provider: "volcengine" },
    { name: "volcengine/doubao-1-5-lite-32k-250115", provider: "volcengine" },
    { name: "volcengine/doubao-seed-2-0-lite-260428", provider: "volcengine" },
    // 千问（阿里云 DashScope）
    { name: "dashscope/qwen-plus", provider: "dashscope" },
    { name: "dashscope/qwen-max", provider: "dashscope" },
    { name: "dashscope/qwen-turbo", provider: "dashscope" },
  ];

  for (const m of cloudModels) {
    models.push({
      name: m.name,
      provider: m.provider,
      local: false,
      size: "云端",
    });
  }

  return NextResponse.json({ models });
}

// POST /api/models/test - 测试模型连通性
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { model, apiKey, baseURL } = body;

  console.log(`[Models API] 测试模型: ${model}`);

  try {
    if (model.startsWith("ollama/")) {
      // 测试本地 Ollama 模型
      const modelName = model.replace("ollama/", "");
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: "回复 OK",
          stream: false,
          options: { num_predict: 10 },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return NextResponse.json({ success: true, model });
    } else {
      // 测试云端模型
      const prefix = model.split("/")[0];
      const provider = prefix;
      const apiBase = baseURL || getCloudBaseURL(prefix);
      const envKey = `${prefix.toUpperCase()}_API_KEY`;
      const key = apiKey || process.env[envKey];

      if (!key) {
        return NextResponse.json(
          { success: false, error: "未配置 API Key" },
          { status: 400 }
        );
      }

      const modelName = model.split("/").slice(1).join("/");
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "OK" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return NextResponse.json({ success: true, model });
    }
  } catch (e: any) {
    console.error(`[Models API] ❌ 测试失败: ${e.message}`);
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 400 }
    );
  }
}

/** 获取云端模型 Base URL */
function getCloudBaseURL(prefix: string): string {
  const map: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    volcengine: "https://ark.cn-beijing.volces.com/api/v3",
    dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
  return map[prefix] || `https://api.${prefix}.com/v1`;
}

function formatSize(bytes: number): string {
  if (!bytes) return "未知";
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
