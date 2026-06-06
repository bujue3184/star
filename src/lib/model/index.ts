/**
 * ModelProvider 统一入口
 */

export type { ModelProvider, ModelCallParams } from "./provider";
export { parseProvider, parseModelName } from "./provider";
export { OllamaProvider } from "./ollama-provider";
export { OpenAIProvider } from "./openai-provider";

import type { ModelProvider } from "./provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";

/** 全局已注册 Provider 列表 */
const providers: ModelProvider[] = [
  new OllamaProvider(),
  new OpenAIProvider(),
];

/** 注册一个自定义 Provider */
export function registerProvider(provider: ModelProvider) {
  providers.push(provider);
}

/** 根据 model 标识找到对应的 Provider */
export function getProvider(model: string): ModelProvider {
  for (const p of providers) {
    if (p.supports(model)) return p;
  }
  // 默认用 Ollama
  return providers[0];
}

/** 调用模型 */
export async function callModel(
  params: Parameters<ModelProvider["call"]>[0]
): Promise<string> {
  const provider = getProvider(params.model);
  return provider.call(params);
}
