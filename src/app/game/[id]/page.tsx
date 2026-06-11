"use client";

/**
 * 游戏房间页面
 *
 * 3D 星空背景 + 侧边栏对话轮次 + 控制栏
 * 支持手动下一回合、上帝干预
 */

import { useEffect, useState, useCallback, use, useRef } from "react";
import dynamic from "next/dynamic";
import type { ThreeSceneHandle } from "@/components/three-scene";

const ThreeScene = dynamic(() => import("@/components/three-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a1a]">
      <div className="text-white/50 text-lg animate-pulse">加载星空中...</div>
    </div>
  ),
});

interface GameState {
  id: string;
  name: string;
  status: string;
  maxRounds: number;
  currentRound: number;
  winnerBotId: string | null;
  globalRule: any;
  participants: Array<{
    id: string;
    name: string;
    model: string;
    order: number;
    finalScore: number;
  }>;
  rounds: Array<{
    id: string;
    roundNumber: number;
    startedAt: string;
    finishedAt: string | null;
    messages: Array<{
      id: string;
      content: string;
      role: string;
      gameBot: { id: string; name: string } | null;
      createdAt: string;
    }>;
  }>;
}

export default function GameRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [godInput, setGodInput] = useState("");
  const [turnLoading, setTurnLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const sceneRef = useRef<ThreeSceneHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(384); // 默认 w-96 (384px)
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  // ── 流式输出状态 ──
  const [streamingBot, setStreamingBot] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const streamedRef = useRef(""); // 不使用 state 频繁更新
  // ── 手动模式 ──
  const [directLoading, setDirectLoading] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedBotName, setSelectedBotName] = useState("");
  const [godInstruction, setGodInstruction] = useState("");

  // ── 裁判建议 + 上帝结束 ──
  const [judgeSuggestion, setJudgeSuggestion] = useState<{
    winnerId: string;
    winnerName: string;
    reason: string;
  } | null>(null);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(384);

  // 侧边栏拖拽逻辑
  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isResizing.current = true;
      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      startX.current = clientX;
      startWidth.current = sidebarWidth;
      console.log(
        `[GameRoom] 开始拖拽: startX=${clientX}, startWidth=${startWidth.current}`
      );

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (ev: MouseEvent | TouchEvent) => {
        if (!isResizing.current) return;
        const currentX =
          "touches" in ev ? ev.touches[0].clientX : ev.clientX;
        const delta = startX.current - currentX; // 向右拖 → 宽度增加
        const newWidth = Math.max(
          280,
          Math.min(700, startWidth.current + delta)
        );
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        if (!isResizing.current) return;
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        console.log(
          `[GameRoom] 拖拽结束: finalWidth=${sidebarWidth}`
        );
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleMouseMove);
        window.removeEventListener("touchend", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleMouseMove, {
        passive: false,
      });
      window.addEventListener("touchend", handleMouseUp);
    },
    [sidebarWidth]
  );

  // 加载游戏状态
  const loadGame = useCallback(async () => {
    console.log(`[GameRoom] 加载游戏: id=${id}`);
    try {
      const res = await fetch(`/api/game/${id}`);
      if (!res.ok) throw new Error("游戏不存在");
      const data = await res.json();
      setGame(data);
      setLoading(false);
      console.log(
        `[GameRoom] ✅ 加载完成: status=${data.status}, 对话数=${data.rounds?.length || 0}`
      );
    } catch (e: any) {
      console.error("[GameRoom] ❌ 加载失败:", e.message);
      setError(e.message);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // 新消息自动滚动到底部
  useEffect(() => {
    if (sidebarContentRef.current) {
      sidebarContentRef.current.scrollTop = sidebarContentRef.current.scrollHeight;
    }
  }, [game?.rounds, streamingText]);

  // 开始游戏
  const handleStart = async () => {
    if (startLoading || turnLoading) return; // 防止重复点击
    console.log("[GameRoom] 开始游戏...");
    setStartLoading(true);
    setError("");
    // 点亮所有参与者为思考中
    if (game?.participants) {
      game.participants.forEach((p) => sceneRef.current?.setPlanetThinking(p.order));
    }
    try {
      const res = await fetch(`/api/game/${id}/start`, { method: "POST" });
      if (!res.ok) {
        // 如果已经是 IN_PROGRESS，当作成功处理
        if (res.status === 400) {
          const err = await res.json();
          if (err.error?.includes("already started")) {
            console.log("[GameRoom] ℹ️ 游戏已开始，刷新状态");
            sceneRef.current?.setPlanetThinking(null);
            setStartLoading(false);
            loadGame();
            return;
          }
          throw new Error(err.error);
        }
        throw new Error("开始失败");
      }
      console.log("[GameRoom] ✅ 游戏已开始");
      sceneRef.current?.setPlanetThinking(null);
      setStartLoading(false);
      loadGame();
      // 自动模式开始V4调度，手动模式等玩家操作
      const isGodMode = game?.globalRule?.gameRules?.godMode === true;
      if (!isGodMode) {
        setTimeout(() => handleNextTurn(), 500);
      }
    } catch (e: any) {
      console.error("[GameRoom] ❌ 开始失败:", e.message);
      sceneRef.current?.setPlanetThinking(null);
      setStartLoading(false);
      setError(e.message);
    }
  };

  // 流式执行下一回合
  const handleNextTurn = async () => {
    console.log("[GameRoom] 流式执行下一回合...");
    if (turnLoading) return;
    setTurnLoading(true);
    setError("");
    setStreamingText("");
    setStreamingBot(null);
    streamedRef.current = "";

    // 预创建轮次占位（确保 bot_done 能立即插入消息）
    if (game) {
      const nextRoundNum = game.currentRound + 1;
      setExpandedRound(nextRoundNum);
      setGame((prev) => {
        if (!prev) return prev;
        const exists = prev.rounds.some((r) => r.roundNumber === nextRoundNum);
        if (!exists) {
          return {
            ...prev,
            rounds: [...prev.rounds, {
              id: "round-" + nextRoundNum,
              roundNumber: nextRoundNum,
              startedAt: new Date().toISOString(),
              finishedAt: null,
              messages: [],
            }],
          };
        }
        return prev;
      });
    }

    try {
      const res = await fetch(`/api/game/${id}/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          godIntervention: godInput.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            if (line.startsWith("data: ")) dataStr = line.slice(6);
          }

          if (!eventType || !dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            switch (eventType) {
              case "thinking":
                // 切换高亮到当前 Bot
                sceneRef.current?.setPlanetThinking(null);
                if (data.botIndex !== undefined) {
                  sceneRef.current?.setPlanetThinking(data.botIndex);
                  // 显示气泡
                  sceneRef.current?.hideAllBubbles();
                  sceneRef.current?.setBubbleText(data.botIndex, "");
                  // 恒星显示 V4 指令
                  if (data.instruction) {
                    sceneRef.current?.showStarDirective("🎯 " + data.instruction);
                  }
                  // 确保该轮次在本地 state 中存在（用于即时展示）
                  if (data.roundNumber !== undefined && game) {
                    setGame((prev) => {
                      if (!prev) return prev;
                      const exists = prev.rounds.some((r) => r.roundNumber === data.roundNumber);
                      if (!exists) {
                        return {
                          ...prev,
                          rounds: [...prev.rounds, {
                            id: "stream-round-" + data.roundNumber,
                            roundNumber: data.roundNumber,
                            startedAt: new Date().toISOString(),
                            finishedAt: null,
                            messages: [],
                          }],
                        };
                      }
                      return prev;
                    });
                    setExpandedRound(data.roundNumber);
                  }
                  setStreamingBot(data.botName);
                  setStreamingText("");
                  streamedRef.current = "";
                  console.log(`[Room] 💭 ${data.botName} 开始思考`);
                }
                break;

              case "token":
                // 累积文本 + 更新气泡
                streamedRef.current += data.text || "";
                setStreamingText(streamedRef.current);
                if (data.botIndex !== undefined) {
                  sceneRef.current?.setBubbleText(data.botIndex, streamedRef.current);
                }
                break;

              case "bot_done":
                console.log(`[Room] ✅ ${data.botName} 发言完成`);
                // 气泡标记为完成
                if (data.botIndex !== undefined) {
                  sceneRef.current?.setBubbleDone(data.botIndex, data.content || streamedRef.current);
                }
                // 展开最新轮次
                if (game) {
                  const maxRound = Math.max(...game.rounds.map((r) => r.roundNumber));
                  setExpandedRound(maxRound);
                }
                // 立即将发言插入本地 state，不用等 loadGame()
                setStreamingBot(null);
                setStreamingText("");
                if (data.content) {
                  const msgRoundNum = data.roundNumber || 1;
                  const newMsg = {
                    id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                    roundId: "round-" + msgRoundNum,
                    gameBotId: "",
                    content: data.content,
                    role: "assistant",
                    createdAt: new Date().toISOString(),
                    gameBot: { id: "", name: data.botName || "" },
                    skillSnapshot: "{}",
                  };
                  setGame((prev) => {
                    if (!prev) return prev;
                    // 找到或创建该轮次
                    let rounds = prev.rounds;
                    let round = rounds.find((r) => r.roundNumber === msgRoundNum);
                    if (!round) {
                      round = {
                        id: "round-" + msgRoundNum,
                        roundNumber: msgRoundNum,
                        startedAt: new Date().toISOString(),
                        finishedAt: null,
                        messages: [],
                      };
                      rounds = [...rounds, round];
                    }
                    return {
                      ...prev,
                      rounds: rounds.map((r) =>
                        r.id === round!.id
                          ? { ...r, messages: [...r.messages, newMsg] }
                          : r
                      ),
                    };
                  });
                }
                break;

              case "directive":
                console.log("[Room] 🎬 导演指令:", data.phase);
                sceneRef.current?.showStarDirective("🎬 " + (data.phase || "讨论中"));
                break;

              case "judge_suggestion":
                // 裁判建议结束，显示确认弹窗
                sceneRef.current?.setPlanetThinking(null);
                sceneRef.current?.hideStarDirective();
                setStreamingBot(null);
                setStreamingText("");
                setTurnLoading(false);
                const suggName = game?.participants.find(p => p.id === data.winnerId)?.name || "";
                setJudgeSuggestion({
                  winnerId: data.winnerId,
                  winnerName: suggName,
                  reason: data.reason || "游戏已有结论",
                });
                console.log(`[Room] ⚖️ 裁判建议结束: ${suggName} - ${data.reason}`);
                loadGame();
                break;

              case "round_complete":
                sceneRef.current?.setPlanetThinking(null);
                sceneRef.current?.hideAllBubbles();
                sceneRef.current?.hideStarDirective();
                setStreamingBot(null);
                setStreamingText("");
                setGodInput("");
                console.log("[Room] ✅ 回合完成:", data);
                loadGame();
                break;

              case "error":
                console.error("[Room] ❌ 流错误:", data.error);
                sceneRef.current?.setPlanetThinking(null);
                setStreamingBot(null);
                break;
            }
          } catch (e) {
            // JSON 解析失败，跳过
          }
        }
      }
    } catch (e: any) {
      console.error("[GameRoom] ❌ 流式回合失败:", e.message);
      sceneRef.current?.setPlanetThinking(null);
      setStreamingBot(null);
      setStreamingText("");
      setError(e.message);
    } finally {
      setTurnLoading(false);
    }
  };

  // 上帝手动调用某模型发言
  const handleDirectInstruction = async () => {
    if (!selectedBotId || !godInstruction.trim() || directLoading) return;
    setDirectLoading(true);
    setStreamingText("");
    setStreamingBot(null);
    streamedRef.current = "";

    try {
      const res = await fetch(`/api/game/${id}/direct/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: selectedBotId, instruction: godInstruction.trim() }),
      });
      if (!res.ok) throw new Error("请求失败");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取流");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "", dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!eventType || !dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "token") {
              streamedRef.current += data.text || "";
              setStreamingText(streamedRef.current);
              if (data.botIndex !== undefined) {
                sceneRef.current?.setBubbleText(data.botIndex, streamedRef.current);
              }
            }
            if (eventType === "bot_done") {
              sceneRef.current?.hideAllBubbles();
              sceneRef.current?.hideStarDirective();
              setStreamingBot(null);
              setStreamingText("");
              setGodInstruction("");
              loadGame();
            }
            if (eventType === "thinking") {
              sceneRef.current?.setPlanetThinking(null);
              if (data.botIndex !== undefined) {
                sceneRef.current?.setPlanetThinking(data.botIndex);
                sceneRef.current?.hideAllBubbles();
                sceneRef.current?.setBubbleText(data.botIndex, "");
                if (selectedBotId) {
                  const bot = game?.participants.find(p => p.id === selectedBotId);
                  if (bot) sceneRef.current?.showStarDirective("🎯 " + godInstruction);
                }
              }
              setStreamingBot(data.botName);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      console.error("[GodMode] ❌ 指令失败:", e.message);
    } finally {
      setDirectLoading(false);
    }
  };

  // 结束游戏（确认裁判建议 / 上帝主动结束）
  const handleEndGame = async (action: "confirm_end" | "god_end") => {
    if (endGameLoading) return;
    setEndGameLoading(true);
    try {
      const res = await fetch(`/api/game/${id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          winnerBotId: judgeSuggestion?.winnerId,
          reason: judgeSuggestion?.reason || "上帝手动结束",
        }),
      });
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        if (err.error === "游戏已结束") {
          // 已结束当作成功
          setJudgeSuggestion(null);
          loadGame();
          return;
        }
      }
      if (!res.ok) throw new Error("结束失败");
      setJudgeSuggestion(null);
      loadGame();
      console.log(`[Room] ✅ 游戏已结束 (${action})`);
    } catch (e: any) {
      console.error("[Room] ❌ 结束失败:", e.message);
    } finally {
      setEndGameLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-[#0a0a1a]">
        <ThreeScene autoRotate={true} />
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-white/50 text-lg animate-pulse">
            加载游戏中...
          </div>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-[#0a0a1a]">
        <div className="glass-card p-8 text-center">
          <p className="text-red-400 text-lg mb-4">❌ {error}</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="glow-button"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!game) return null;

  const isWaiting = game.status === "WAITING";
  const isInProgress = game.status === "IN_PROGRESS";
  const isFinished = game.status === "FINISHED";
  const winner = game.participants.find((b) => b.id === game.winnerBotId);
  const godMode = game.globalRule?.gameRules?.godMode === true;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 3D 星空背景 */}
      <ThreeScene ref={sceneRef} autoRotate={true} />

      {/* 顶部控制栏 */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => (window.location.href = "/")}
            className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold text-white/90 drop-shadow-lg">
            ⭐ {game.name}
          </h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isFinished
                ? "bg-blue-500/20 text-blue-400"
                : isInProgress
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {isFinished ? "已结束" : isInProgress ? "进行中" : "等待中"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isWaiting && (
            <button
              onClick={handleStart}
              disabled={startLoading}
              className={`${startLoading ? "opacity-50 cursor-not-allowed" : ""} glow-button`}
            >
              {startLoading ? "⏳ 启动中..." : "🚀 开始游戏"}
            </button>
          )}

          {isInProgress && (
            <button
              onClick={() => handleEndGame("god_end")}
              disabled={endGameLoading}
              className="glass-card px-3 py-2 text-red-400/60 hover:text-red-400 border border-red-500/20 cursor-pointer text-sm"
            >
              ⛔ 结束游戏
            </button>
          )}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="glass-card px-3 py-2 text-white/60 hover:text-white cursor-pointer"
          >
            {sidebarOpen ? "▶" : "◀"} 对话
          </button>
        </div>
      </header>

      {/* 上帝干预（自动模式） */}
      {isInProgress && !godMode && (
        <div
          className="absolute bottom-6 left-6 z-10 pointer-events-none"
          style={{ right: sidebarOpen ? sidebarWidth + 24 : 24 }}
        >
          <div className="flex gap-2 pointer-events-auto max-w-xl">
            <input
              className="dark-input flex-1"
              value={godInput}
              onChange={(e) => setGodInput(e.target.value)}
              placeholder="上帝干预指令（可选）..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && godInput.trim()) handleNextTurn();
              }}
            />
            <button onClick={handleNextTurn} disabled={turnLoading} className="glow-button">
              {turnLoading ? "..." : "发送"}
            </button>
          </div>
        </div>
      )}

      {/* 手动模式：选手按钮 + 指令输入 */}
      {isInProgress && godMode && (
        <div
          className="absolute bottom-6 left-6 z-10 pointer-events-none"
          style={{ right: sidebarOpen ? sidebarWidth + 24 : 24 }}
        >
          <div className="pointer-events-auto glass-card p-4 space-y-3 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/50 text-xs">选择发言者：</span>
              {game?.participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedBotId(p.id);
                    setSelectedBotName(p.name);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    selectedBotId === p.id
                      ? "bg-accent text-white"
                      : "bg-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="dark-input flex-1"
                value={godInstruction}
                onChange={(e) => setGodInstruction(e.target.value)}
                placeholder={selectedBotId ? `输入对 ${selectedBotName} 的指令...` : "先选择发言者"}
                disabled={!selectedBotId}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedBotId && godInstruction.trim()) handleDirectInstruction();
                }}
              />
              <button
                onClick={handleDirectInstruction}
                disabled={!selectedBotId || !godInstruction.trim() || directLoading}
                className="glow-button"
              >
                {directLoading ? "..." : "🎯 指令"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 胜者显示 */}
      {isFinished && winner && (
        <div
          className="absolute bottom-6 left-6 z-10 pointer-events-none"
          style={{ right: sidebarOpen ? sidebarWidth + 24 : 24 }}
        >
          <div className="glass-card pointer-events-auto inline-block px-6 py-3">
            <span className="text-yellow-400 text-lg">🏆 胜者：</span>
            <span className="text-white font-bold text-lg">
              {winner.name}
            </span>
            <span className="text-white/40 ml-3">
              (得分: {winner.finalScore})
            </span>
          </div>
        </div>
      )}

      {/* ⚖️ 裁判建议弹窗 */}
      {judgeSuggestion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card pointer-events-auto max-w-md w-full mx-4 p-6 text-center">
            <div className="text-4xl mb-3">⚖️</div>
            <h3 className="text-xl font-bold text-white mb-2">
              裁判建议
            </h3>
            <p className="text-white/70 mb-1">
              {judgeSuggestion.reason}
            </p>
            {judgeSuggestion.winnerName && (
              <p className="text-yellow-400 text-lg font-bold mb-6">
                🏆 建议胜者：{judgeSuggestion.winnerName}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setJudgeSuggestion(null);
                  loadGame();
                }}
                className="px-5 py-2 rounded-lg bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                🔄 继续游戏
              </button>
              <button
                onClick={() => handleEndGame("confirm_end")}
                disabled={endGameLoading}
                className="glow-button"
              >
                {endGameLoading ? "处理中..." : "✅ 确认结束"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏对话 */}
      {sidebarOpen && (
        <aside
          ref={sidebarRef}
          className="absolute top-16 right-0 bottom-0 z-10 pointer-events-none"
          style={{ width: sidebarWidth }}
        >
          {/* 拖拽手柄 */}
          <div
            className="absolute left-0 top-0 bottom-0 z-20 w-2 cursor-col-resize pointer-events-auto group"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
          >
            {/* 可视拖拽条 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white/10 group-hover:bg-white/30 group-active:bg-accent transition-colors" />
          </div>

          <div className="h-full pointer-events-auto glass-card rounded-none border-r-0 overflow-y-auto" ref={sidebarContentRef}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white/60 text-xs uppercase tracking-widest">
                发言记录
              </h3>
              <span className="text-white/20 text-xs">
                {sidebarWidth}px
              </span>
            </div>

            <div className="p-3 space-y-2">
              {game.rounds.length === 0 && !streamingBot && (
                <p className="text-white/30 text-sm text-center py-8">
                  还没有发言记录
                </p>
              )}

              {[...game.rounds].reverse().map((round) => (
                <div key={round.id} className="rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedRound(
                        expandedRound === round.roundNumber
                          ? null
                          : round.roundNumber
                      )
                    }
                    className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-white/70 text-sm font-medium">
                      第 {round.roundNumber} 轮
                    </span>
                    <span className="text-white/30 text-xs">
                      {expandedRound === round.roundNumber ? "收起" : "展开"}
                    </span>
                  </button>

                  {expandedRound === round.roundNumber && (
                    <div className="space-y-2 p-3 bg-white/3">
                      {round.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg whitespace-pre-wrap ${
                            msg.role === "god"
                              ? "bg-yellow-500/10 border border-yellow-500/20"
                              : msg.role === "system"
                              ? "bg-purple-500/10 border border-purple-500/20"
                              : "bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white/50 text-xs">
                              {msg.gameBot?.name ||
                                (msg.role === "god"
                                  ? "👼 上帝"
                                  : msg.role === "system"
                                  ? "⚙️ 系统"
                                  : "系统")}
                            </span>
                          </div>
                          <p className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* ── 流式输出区域 ── */}
              {streamingBot && (
                <div className="rounded-lg overflow-hidden border border-green-500/30 bg-green-500/5">
                  <div className="flex items-center gap-2 p-3 bg-green-500/10">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-sm font-medium">
                      💬 {streamingBot} 发言中...
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="text-white/90 text-sm whitespace-pre-wrap leading-relaxed min-h-[2em]">
                      {streamingText || "⏳ 思考中..."}
                      <span className="inline-block w-1.5 h-4 bg-green-400/70 ml-0.5 animate-pulse" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
