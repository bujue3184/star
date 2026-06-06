/**
 * 插件系统类型定义 —— 裁判插件 & 轮次控制插件
 */

import type { PrismaClient } from "@prisma/client";

export interface GameContext {
  prisma: PrismaClient;
  sessionId: string;
  currentRound: number;
  maxRounds: number;
}

export interface RoundEndResult {
  scores: Map<string, number>;
  action?: {
    type: "continue" | "suggest_end";
    winnerId?: string;
    reason?: string;
  };
}

export interface JudgePlugin {
  /** 每轮结束后调用，返回分数 + 可选行动（提前结束游戏等） */
  onRoundEnd(roundId: string, context: GameContext): Promise<RoundEndResult>;

  /** 游戏结束时调用，返回胜者 Bot 的 id（或 null 表示无胜者） */
  onGameEnd(sessionId: string, context: GameContext): Promise<string | null>;
}

export interface RoundControlPlugin {
  /** 判断游戏是否应该结束 */
  shouldEnd(context: GameContext): Promise<boolean>;
}
