/**
 * PluginRegistry —— 插件注册表
 *
 * 允许在运行时注册/获取裁判插件和轮次控制插件。
 * 内置实现：LLMJudge, MaxRoundsControl
 */

import type { JudgePlugin, RoundControlPlugin } from "./types";

class PluginRegistryInstance {
  private judges = new Map<string, JudgePlugin>();
  private roundControls = new Map<string, RoundControlPlugin>();

  /** 注册裁判插件 */
  registerJudge(name: string, impl: JudgePlugin): void {
    this.judges.set(name, impl);
  }

  /** 获取裁判插件 */
  getJudge(name: string): JudgePlugin | null {
    return this.judges.get(name) ?? null;
  }

  /** 注册轮次控制插件 */
  registerRoundControl(name: string, impl: RoundControlPlugin): void {
    this.roundControls.set(name, impl);
  }

  /** 获取轮次控制插件 */
  getRoundControl(name: string): RoundControlPlugin | null {
    return this.roundControls.get(name) ?? null;
  }

  /** 列出所有已注册的插件 */
  listPlugins(): {
    judges: string[];
    roundControls: string[];
  } {
    return {
      judges: Array.from(this.judges.keys()),
      roundControls: Array.from(this.roundControls.keys()),
    };
  }
}

export const pluginRegistry = new PluginRegistryInstance();
