"use client";

/**
 * 首页 —— 星际辩台
 *
 * 全屏 Three.js 场景（星空 + 6 星球 + 中心恒星）
 * 点击恒星 → 全局配置弹窗
 * 点击星球 → 席位配置弹窗
 * 配置完成后 → 创建游戏
 */

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

const ThreeScene = dynamic(() => import("@/components/three-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a1a]">
      <div className="text-white/50 text-lg animate-pulse">加载星空中...</div>
    </div>
  ),
});

import GlobalConfigModal, {
  defaultGlobalConfig,
  type GlobalConfig,
} from "@/components/global-config-modal";
import BotConfigModal, {
  defaultBotConfig,
  type BotConfig,
} from "@/components/bot-config-modal";

interface GameSession {
  id: string;
  name: string;
  status: string;
  currentRound: number;
  maxRounds: number;
  _count: { participants: number; rounds: number };
}

// ── 席位的 AI 形象映射 ──
const SEAT_NAMES = ["DeepSeek", "千问", "Gemini", "GPT", "豆包", "AI · 通用"];

export default function Home() {
  // ── 游戏列表 ──
  const [games, setGames] = useState<GameSession[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  // ── 全局配置 ──
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(
    defaultGlobalConfig()
  );
  const [showGlobalModal, setShowGlobalModal] = useState(false);

  // ── 席位配置 ──
  const [botConfigs, setBotConfigs] = useState<BotConfig[]>(
    Array.from({ length: 6 }, (_, i) => defaultBotConfig(i))
  );
  const [showBotModal, setShowBotModal] = useState<number | null>(null);

  // ── 游戏创建 ──
  const [creating, setCreating] = useState(false);

  // ── 加载游戏列表 ──
  const loadGames = useCallback(async () => {
    console.log("[Home] 加载游戏列表...");
    try {
      const res = await fetch("/api/game");
      if (res.ok) {
        const data = await res.json();
        setGames(data);
        setGamesLoaded(true);
        console.log(`[Home] ✅ 加载了 ${data.length} 个游戏`);
      }
    } catch (e) {
      console.error("[Home] ❌ 加载游戏列表失败:", e);
    }
  }, []);

  // ── 首次加载历史对局 ──
  useEffect(() => {
    if (!gamesLoaded) {
      loadGames();
    }
  }, [gamesLoaded, loadGames]);

  // ── 点击星球 → 打开该席位配置 ──
  const handlePlanetClick = useCallback((index: number) => {
    console.log(`[Home] 星球 ${index + 1} (${SEAT_NAMES[index]}) 被点击`);
    setShowBotModal(index);
  }, []);

  // ── 点击恒星 → 打开全局配置 ──
  const handleStarClick = useCallback(() => {
    console.log("[Home] 恒星（裁判席）被点击");
    setShowGlobalModal(true);
  }, []);

  // ── 保存席位配置 ──
  const handleSaveBot = useCallback(
    (index: number, config: BotConfig) => {
      console.log(`[Home] 保存席位 ${index + 1} 配置`);
      setBotConfigs((prev) => {
        const next = [...prev];
        next[index] = config;
        return next;
      });
    },
    []
  );

  // ── 保存全局配置 ──
  const handleSaveGlobal = useCallback((config: GlobalConfig) => {
    console.log("[Home] 保存全局配置:", config.name);
    setGlobalConfig(config);
  }, []);

  // ── 统计已配置席位 ──
  const configuredCount = botConfigs.filter((b) => b.configured).length;
  const canStart = configuredCount >= 2;

  // ── 创建游戏 ──
  const handleCreateGame = async () => {
    console.log("[Home] 创建游戏...");
    setCreating(true);

    // 只取已配置的 Bot（保留原始席位顺序）
    const configuredBots = botConfigs
      .map((b, idx) => ({ ...b, seatOrder: idx }))
      .filter((b) => b.configured);

    const globalRule = {
      name: globalConfig.name,
      description: globalConfig.topic,
      gameRules: {
        maxRounds: globalConfig.maxRounds,
        minBots: 2,
        maxBots: 6,
        allowGodIntervention: globalConfig.allowGodIntervention,
      },
      plugins: {
        judge: {
          type: "llm",
          config: {
            model: globalConfig.judgeModel,
            apiKey: globalConfig.judgeApiKey || undefined,
            baseURL: globalConfig.judgeBaseURL || undefined,
            scoringDimensions: globalConfig.scoringDimensions,
          },
        },
        roundControl: {
          type: "maxRounds",
          config: { maxRounds: globalConfig.maxRounds },
        },
      },
      promptTemplate: globalConfig.promptTemplate.replace(
        "{topic}",
        globalConfig.topic
      ),
    };

    const bots = configuredBots.map((b) => ({
      name: b.name,
      model: b.model,
      basePrompt: b.basePrompt,
      apiKey: b.apiKey || undefined,
      baseURL: b.baseURL || undefined,
      order: b.seatOrder,  // 使用原始席位索引，保证星球闪烁正确
      skillSnapshots: b.skills.map((s) => ({
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: s.name,
        type: s.type,
        content: s.content,
      })),
    }));

    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: globalConfig.name, globalRule, bots }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "创建失败");
      }

      const game = await res.json();
      console.log(`[Home] ✅ 游戏创建成功: id=${game.id}`);

      // 跳转到游戏房间
      window.location.href = `/game/${game.id}`;
    } catch (e: any) {
      console.error("[Home] ❌ 创建失败:", e.message);
      alert("创建失败: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Three.js 场景 */}
      <ThreeScene
        onPlanetClick={handlePlanetClick}
        onStarClick={handleStarClick}
        autoRotate={true}
      />

      {/* 顶部导航栏 */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold tracking-wider text-white/90 drop-shadow-lg">
          ⭐ 星际辩台
        </h1>

        <nav className="flex items-center gap-3">
          <button
            onClick={loadGames}
            className="glass-card px-4 py-2 text-sm text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            ↻ 刷新
          </button>
        </nav>
      </header>

      {/* 中央提示（无任何配置时） */}
      {configuredCount === 0 && (
        <div className="absolute inset-0 z-5 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-white/20 text-lg mb-1">
              🌟 点击恒星配置全局剧本
            </p>
            <p className="text-white/15 text-sm">
              🪐 点击星球配置 AI 席位
            </p>
          </div>
        </div>
      )}

      {/* 底部状态栏 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="glass-card pointer-events-auto px-6 py-3 flex items-center gap-6">
          {/* 全局配置状态 */}
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">🌟</span>
            <span className="text-white/60 text-sm">
              {globalConfig.name}
            </span>
          </div>

          <div className="w-px h-6 bg-white/10" />

          {/* 席位状态 */}
          <div className="flex items-center gap-2">
            {botConfigs.map((b, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs cursor-pointer transition-colors ${
                  b.configured
                    ? "bg-green-500/30 text-green-400"
                    : "bg-white/10 text-white/30"
                }`}
                title={`${SEAT_NAMES[i]}: ${b.configured ? "已配置" : "未配置"}`}
                onClick={() => setShowBotModal(i)}
              >
                {i + 1}
              </span>
            ))}
          </div>

          <div className="w-px h-6 bg-white/10" />

          {/* 开始游戏按钮 */}
          <button
            onClick={handleCreateGame}
            disabled={!canStart || creating}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all cursor-pointer ${
              canStart
                ? "glow-button"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {creating
              ? "创建中..."
              : canStart
              ? `🚀 开始 (${configuredCount}席)`
              : `需要至少 2 席 (${configuredCount}/2)`}
          </button>
        </div>
      </div>

      {/* 历史对局列表 */}
      {games.length > 0 && (
        <div className="absolute top-16 left-6 z-10 pointer-events-none">
          <div className="glass-card pointer-events-auto max-h-60 overflow-y-auto p-3 w-56">
            <h4 className="text-white/40 text-xs uppercase tracking-widest mb-2">
              历史对局
            </h4>
            <div className="space-y-1">
              {games.slice(0, 5).map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => (window.location.href = `/game/${game.id}`)}
                >
                  <span className="text-white/60 text-sm truncate max-w-[120px]">
                    {game.name}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      game.status === "IN_PROGRESS"
                        ? "text-green-400"
                        : game.status === "FINISHED"
                        ? "text-blue-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {game.status === "IN_PROGRESS"
                      ? "进行"
                      : game.status === "FINISHED"
                      ? "结束"
                      : "等待"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 全局配置弹窗 ── */}
      <GlobalConfigModal
        open={showGlobalModal}
        onClose={() => setShowGlobalModal(false)}
        config={globalConfig}
        onSave={handleSaveGlobal}
      />

      {/* ── 席位配置弹窗 ── */}
      {showBotModal !== null && (
        <BotConfigModal
          open={true}
          index={showBotModal}
          onClose={() => setShowBotModal(null)}
          config={botConfigs[showBotModal]}
          onSave={(config) => handleSaveBot(showBotModal, config)}
        />
      )}
    </div>
  );
}
