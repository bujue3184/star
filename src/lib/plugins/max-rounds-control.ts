/**
 * MaxRoundsControl —— 最大轮次控制插件
 *
 * 当当前轮次达到设定的 maxRounds 时结束游戏。
 */

import type { RoundControlPlugin, GameContext } from "./types";

export class MaxRoundsControl implements RoundControlPlugin {
  async shouldEnd(context: GameContext): Promise<boolean> {
    return context.currentRound >= context.maxRounds;
  }
}
