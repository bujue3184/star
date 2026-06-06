/**
 * ModelProvider 接口定义 —— 统一所有 AI 模型调用
 *
 * 支持本地模型（Ollama）和云端模型（OpenAI / DeepSeek 等）
 */

export interface ModelCallParams {
  model: string; // "ollama/deepseek-r1:8b", "openai/gpt-4", "deepseek/deepseek-chat"
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseURL?: string;
}

export interface ModelProvider {
  /** 调用模型并返回文本响应 */
  call(params: ModelCallParams): Promise<string>;

  /** 判断该 Provider 是否能处理指定 model 标识 */
  supports(model: string): boolean;
}

/** 根据 model 标识解析出对应的 Provider 名称 */
export function parseProvider(model: string): string {
  const [provider] = model.split("/", 1);
  return provider || "ollama";
}

/** 从 model 标识中提取模型名称（去掉前缀） */
export function parseModelName(model: string): string {
  const parts = model.split("/");
  return parts[1] || parts[0];
}
