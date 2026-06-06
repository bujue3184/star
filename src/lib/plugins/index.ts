/**
 * 插件系统统一导出
 */

export type { JudgePlugin, RoundControlPlugin, GameContext } from "./types";
export { pluginRegistry } from "./registry";
export { LLMJudge } from "./llm-judge";
export type { LLMJudgeConfig } from "./llm-judge";
export { MaxRoundsControl } from "./max-rounds-control";

// 在导入时自动注册内置插件
import { pluginRegistry } from "./registry";
import { LLMJudge } from "./llm-judge";
import { MaxRoundsControl } from "./max-rounds-control";

pluginRegistry.registerJudge("llm", new LLMJudge());
pluginRegistry.registerRoundControl("maxRounds", new MaxRoundsControl());
