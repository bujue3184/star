"use client";

/**
 * GlobalConfigModal —— 全局剧本配置弹窗
 *
 * 点击中心恒星（裁判席）时弹出。
 * 配置：游戏名称、主题、最大轮次、裁判模型、裁判工作内容、Prompt模板
 */

import { useState, useEffect } from "react";

export interface GlobalConfig {
  name: string;
  topic: string;
  maxRounds: number;
  judgeModel: string;
  judgeApiKey: string;
  judgeBaseURL: string;
  scoringDimensions: string[];
  promptTemplate: string;
  allowGodIntervention: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: GlobalConfig;
  onSave: (config: GlobalConfig) => void;
}

/** 默认全局配置 */
export function defaultGlobalConfig(): GlobalConfig {
  return {
    name: "经典辩论赛",
    topic: "人工智能是否应该拥有权利？",
    maxRounds: 3,
    judgeModel: "ollama/qwen:7b",
    judgeApiKey: "",
    judgeBaseURL: "",
    scoringDimensions: ["逻辑性", "事实正确性", "说服力"],
    promptTemplate: "讨论主题：{topic}\n发言规则：简明扼要，有理有据。",
    allowGodIntervention: true,
  };
}

export default function GlobalConfigModal({
  open,
  onClose,
  config,
  onSave,
}: Props) {
  const [form, setForm] = useState<GlobalConfig>(config);
  const [models, setModels] = useState<string[]>([]);

  // 同步外部 config 变化
  useEffect(() => {
    setForm(config);
  }, [config]);

  // 加载可用模型
  useEffect(() => {
    if (!open) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        const names = (data.models || []).map((m: any) => m.name);
        setModels(names);
        console.log(`[GlobalConfig] 加载 ${names.length} 个模型`);
      })
      .catch((e) => console.warn("[GlobalConfig] 模型加载失败:", e));
  }, [open]);

  if (!open) return null;

  const update = (partial: Partial<GlobalConfig>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleSave = () => {
    console.log("[GlobalConfig] 保存全局配置:", form);
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4 p-6">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🌟 裁判席 · 全局剧本
          </h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* 游戏名称 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              游戏名称
            </label>
            <input
              className="dark-input"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="输入游戏名称"
            />
          </div>

          {/* 辩论主题 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              辩论主题
            </label>
            <textarea
              className="dark-input resize-none"
              rows={2}
              value={form.topic}
              onChange={(e) => update({ topic: e.target.value })}
              placeholder="输入辩论主题"
            />
          </div>

          {/* 最大轮次 */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-white/60 text-sm mb-1.5">
                最大轮次
              </label>
              <input
                type="number"
                className="dark-input"
                value={form.maxRounds}
                onChange={(e) =>
                  update({ maxRounds: Math.max(1, Number(e.target.value)) })
                }
                min={1}
                max={20}
              />
            </div>
            <div className="flex-1">
              <label className="block text-white/60 text-sm mb-1.5">
                上帝干预
              </label>
              <label className="flex items-center gap-2 h-[42px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowGodIntervention}
                  onChange={(e) =>
                    update({ allowGodIntervention: e.target.checked })
                  }
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-white/60 text-sm">启用</span>
              </label>
            </div>
          </div>

          {/* 裁判模型 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              裁判模型
            </label>
            <select
              className="dark-input"
              value={form.judgeModel}
              onChange={(e) => update({ judgeModel: e.target.value })}
            >
              {models.length === 0 && (
                <option value="ollama/qwen:7b">ollama/qwen:7b (默认)</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {models.length === 0 && (
              <p className="text-yellow-400/60 text-xs mt-1">
                ⚠️ 未检测到 Ollama，使用默认模型
              </p>
            )}
          </div>

          {/* 裁判 API Key（云端模型时需要） */}
          {form.judgeModel && !form.judgeModel.startsWith("ollama/") && (
            <>
              <div>
                <label className="block text-white/60 text-sm mb-1.5">
                  裁判 API Key
                </label>
                <input
                  className="dark-input"
                  type="password"
                  value={form.judgeApiKey}
                  onChange={(e) => update({ judgeApiKey: e.target.value })}
                  placeholder="输入 API Key（或使用 .env 环境变量）"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-1.5">
                  裁判 Base URL（可选）
                </label>
                <input
                  className="dark-input"
                  value={form.judgeBaseURL}
                  onChange={(e) => update({ judgeBaseURL: e.target.value })}
                  placeholder={
                    form.judgeModel.startsWith("deepseek/")
                      ? "https://api.deepseek.com/v1"
                      : form.judgeModel.startsWith("volcengine/")
                      ? "https://ark.cn-beijing.volces.com/api/v3"
                      : form.judgeModel.startsWith("dashscope/")
                      ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
                      : "https://api.openai.com/v1"
                  }
                />
              </div>
            </>
          )}

          {/* 裁判工作内容 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              裁判工作内容（将在每轮发给裁判）
            </label>
            <textarea
              className="dark-input resize-none"
              rows={2}
              value={form.scoringDimensions.join("、")}
              onChange={(e) =>
                update({
                  scoringDimensions: e.target.value
                    .split(/[,，、]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="逻辑性、事实正确性、说服力"
            />
          </div>

          {/* Prompt 模板 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              Prompt 模板（{`{topic}`} 会被替换为主题）
            </label>
            <textarea
              className="dark-input resize-none font-mono text-sm"
              rows={3}
              value={form.promptTemplate}
              onChange={(e) => update({ promptTemplate: e.target.value })}
            />
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/50 hover:text-white/80 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button onClick={handleSave} className="glow-button">
            ✅ 保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
