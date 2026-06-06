/**
 * OllamaProvider —— 调用本地 Ollama 模型
 *
 * 支持流式输出 (streamCall) 和非流式 (call) 两种模式。
 * 自动剥离推理模型的"思考过程"（如 deepseek-r1 的 标签、qwen3.6/gemma4 的思维链前缀）
 */

import { ModelProvider, ModelCallParams, parseModelName } from "./provider";

const OLLAMA_TIMEOUT = 300_000;
const REASONING_MODELS = ["deepseek-r1", "deepseek-r1:8b"];

/**
 * 剥离推理模型的思考过程，只保留正式输出
 */
function stripThinking(raw: string, modelName: string): string {
  let text = raw;

  // 1. deepseek-r1: 剥离 <think>...</think> 标签内的内容
  if (REASONING_MODELS.includes(modelName)) {
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (text) return text;
  }

  // 2. qwen3.6 / gemma4 等: 剥离 "Here's a thinking process:" / "Thinking Process:" 前缀
  //    这些模型把整个思维链当作输出，没有分割标签
  const thinkingPrefixes = [
    "here's a thinking process",
    "thinking process",
    "here's my thinking",
    "let me think",
  ];
  const lower = text.toLowerCase().trim();
  for (const prefix of thinkingPrefixes) {
    if (lower.startsWith(prefix)) {
      // 尝试查找"正式回答"的分界标记
      // 有些模型在思维链后用 \n\n---\n\n 或 \n\nAnswer:\n\n 分隔
      const separators = ["\n---\n", "\n\n---\n\n", "answer:", "response:", "final answer:"];
      for (const sep of separators) {
        const idx = text.toLowerCase().indexOf(sep);
        if (idx > 0 && idx < text.length * 0.7) {
          // 分隔符在前 70% 位置之后才是正式回答
          const after = text.slice(idx + sep.length).trim();
          if (after.length > 10) return after;
        }
      }
      // 找不到分隔符，整段都是思维链，返回空
      console.warn(`[OllamaProvider] ⚠️ ${modelName} 仅输出思维链，无正式回答`);
      return `[${modelName} 思考中...]`;
    }
  }

  return text;
}

export class OllamaProvider implements ModelProvider {
  private baseURL: string;

  constructor(baseURL = "http://localhost:11434") {
    this.baseURL = baseURL;
  }

  supports(model: string): boolean {
    return model.startsWith("ollama/");
  }

  /** 非流式调用 */
  async call(params: ModelCallParams): Promise<string> {
    const modelName = parseModelName(params.model);
    let full = "";
    for await (const chunk of this.streamCall(params)) {
      full += chunk;
    }
    const cleaned = stripThinking(full, modelName);
    return cleaned || `[${modelName} 未产生输出]`;
  }

  /** 流式调用 —— 返回 AsyncGenerator，剥离思维链后逐 token 产出 */
  async *streamCall(
    params: ModelCallParams
  ): AsyncGenerator<string, void, undefined> {
    const modelName = parseModelName(params.model);
    const isReasoning = REASONING_MODELS.includes(modelName);
    const maxTokens = isReasoning ? 4096 : params.maxTokens ?? 2048;

    // 检查模型大小
    try {
      const infoRes = await fetch(`${this.baseURL}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
        signal: AbortSignal.timeout(5000),
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        const sizeGB = (info.size || 0) / 1024 / 1024 / 1024;
        if (sizeGB > 10) {
          console.warn(`[OllamaProvider] ⚠️ ${modelName} 大小 ${sizeGB.toFixed(1)}GB`);
        }
      }
    } catch { /* ignore */ }

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: params.messages,
          keep_alive: "0",
          options: { temperature: params.temperature ?? 0.7, num_predict: maxTokens },
          stream: true,
        }),
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
      });
    } catch (e: any) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        throw new Error(`Ollama ${modelName} 超时 (${OLLAMA_TIMEOUT / 1000}秒)`);
      }
      throw new Error(`Ollama 请求失败: ${e.message}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error (${response.status}): ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取流式响应");

    const decoder = new TextDecoder();
    let buffer = "";
    // deepseek-r1 的思维链跟踪（初始 false，看到 <think> 才启用）
    let inThinkTag = false;
    const isChain = createThinkingChainDetector();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const data = JSON.parse(trimmed);
            const rawToken = data.message?.content
              || data.message?.reasoning_content
              || data.message?.thinking
              || "";

            if (!rawToken) {
              if (data.done) break;
              continue;
            }

            // deepseek-r1: 跟踪 <think> 标签状态
            if (isReasoning) {
              // 处理 <think> 开头
              const thinkStart = rawToken.indexOf("<think>");
              const thinkEnd = rawToken.indexOf("</think>");

              if (thinkStart >= 0) {
                inThinkTag = true;
                // <think> 前可能有内容
                const before = rawToken.slice(0, thinkStart).trim();
                if (before) yield before;
              }

              if (thinkEnd >= 0) {
                inThinkTag = false;
                // </think> 后有正式回答内容，提取并产出
                const after = rawToken.slice(thinkEnd + 7).trim();
                if (after) yield after;
                continue; // 已处理完此 token
              }

              if (inThinkTag) continue; // 跳过思考内容
            }

            // 非推理模型才检测思维链（推理模型已通过 inThinkTag 处理）
            if (!isReasoning && isChain(rawToken)) continue;

            yield rawToken;

            if (data.done) {
              if (!data.message?.content && isReasoning) {
                console.warn(`[OllamaProvider] ⚠️ ${modelName} 返回 done 但 content 为空`);
              }
              break;
            }
          } catch { /* skip malformed JSON lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/** 创建思维链检测器（每个流式调用独立实例） */
function createThinkingChainDetector() {
  let detected = false;
  return function isThinkingChain(token: string): boolean {
    if (detected) return false;

    // 只检测开头是否是思维链关键词
    const thinkingStarts = ["here's a thinking", "thinking process", "let me think"];
    const lower = token.toLowerCase().trim();

    if (thinkingStarts.some((p) => lower.includes(p))) return true;

    // 超过一定长度还没看到思维链关键词，判定为正式内容
    if (token.length > 5) {
      // 如果包含正式回答的特征，退出检测
      if (/[：，。；、？]/.test(token) || /[\u4e00-\u9fff]{2,}/.test(token)) {
        detected = true;
        return false;
      }
    }

    // 短 token 且没有匹配思维链关键词，放行
    if (token.length <= 3) return false;

    return true;
  };
}
