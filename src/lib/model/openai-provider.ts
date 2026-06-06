/**
 * OpenAIProvider —— 调用 OpenAI 兼容 API（支持多厂商）
 *
 * 自动路由：
 *   openai/*      → api.openai.com/v1               密钥: OPENAI_API_KEY
 *   deepseek/*    → api.deepseek.com/v1             密钥: DEEPSEEK_API_KEY
 *   volcengine/*  → ark.cn-beijing.volces.com/api/v3 密钥: VOLCENGINE_API_KEY
 *   dashscope/*   → dashscope.aliyuncs.com/compatible-mode/v1  密钥: DASHSCOPE_API_KEY
 */

import { ModelProvider, ModelCallParams, parseModelName } from "./provider";

/** 模型前缀 → API 配置映射 */
const API_ROUTES: Record<
  string,
  { defaultBaseURL: string; envKey: string }
> = {
  openai: {
    defaultBaseURL: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
  },
  deepseek: {
    defaultBaseURL: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
  },
  volcengine: {
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    envKey: "VOLCENGINE_API_KEY",
  },
  dashscope: {
    defaultBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envKey: "DASHSCOPE_API_KEY",
  },
};

const SUPPORTED_PREFIXES = Object.keys(API_ROUTES);

export class OpenAIProvider implements ModelProvider {
  supports(model: string): boolean {
    const prefix = model.split("/")[0];
    return SUPPORTED_PREFIXES.includes(prefix);
  }

  async call(params: ModelCallParams): Promise<string> {
    const prefix = params.model.split("/")[0];
    const modelName = parseModelName(params.model);
    const route = API_ROUTES[prefix];

    if (!route) {
      throw new Error(`未知的模型供应商: ${prefix}，支持: ${SUPPORTED_PREFIXES.join(", ")}`);
    }

    const baseURL = params.baseURL || route.defaultBaseURL;
    const apiKey =
      params.apiKey || process.env[route.envKey] || "";

    if (!apiKey) {
      throw new Error(
        `缺少 ${route.envKey}，请在 .env 文件中配置或通过界面输入`
      );
    }

    console.log(
      `[OpenAIProvider] 调用 ${prefix} API: model=${modelName}, baseURL=${baseURL}`
    );

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${prefix} API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}
