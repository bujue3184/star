"use client";

/**
 * BotConfigModal —— 席位配置弹窗
 *
 * 点击星球时弹出，配置该席位的 AI 模型、API Key、技能等。
 */

import { useState, useEffect } from "react";

export interface BotConfig {
  name: string;
  model: string;
  apiKey: string;
  baseURL: string;
  basePrompt: string;
  skills: Array<{ name: string; type: "ROLE_PLAY" | "TASK"; content: string }>;
  configured: boolean;
}

interface Props {
  open: boolean;
  index: number;
  onClose: () => void;
  config: BotConfig;
  onSave: (config: BotConfig) => void;
}

/** 默认 Bot 配置 */
export function defaultBotConfig(index: number): BotConfig {
  const names = ["DeepSeek", "千问", "Gemini", "GPT", "豆包", "AI"];
  const defaults = [
    "你是一个擅长逻辑推理的分析者，观点鲜明，论据充分。",
    "你是一个充满创意的思考者，善于从不同角度思考问题。",
    "你是一个严谨的学者型分析者，注重事实和数据。",
    "你是一个富有激情的表达者，语言感染力强。",
    "你是一个幽默风趣的参与者，善于用轻松的方式表达观点。",
    "你是一个全面型思考者，能够灵活应对各种论点。",
  ];
  return {
    name: names[index] || `Bot ${index + 1}`,
    model: index < 3 ? `ollama/${["qwen:7b", "gemma3:4b", "deepseek-r1:8b"][index]}` : "ollama/qwen:7b",
    apiKey: "",
    baseURL: "",
    basePrompt: defaults[index] || "",
    skills: [],
    configured: false,
  };
}

export default function BotConfigModal({
  open,
  index,
  onClose,
  config,
  onSave,
}: Props) {
  const [form, setForm] = useState<BotConfig>(config);
  const [models, setModels] = useState<
    Array<{ name: string; local: boolean; size: string }>
  >([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillContent, setNewSkillContent] = useState("");

  // 同步外部 config
  useEffect(() => {
    setForm(config);
    setTestResult(config.configured ? "ok" : "idle");
  }, [config]);

  // 加载模型列表
  useEffect(() => {
    if (!open) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        console.log(`[BotConfig] 加载 ${(data.models || []).length} 个模型`);
      })
      .catch((e) => console.warn("[BotConfig] 模型加载失败:", e));
  }, [open]);

  if (!open) return null;

  const update = (partial: Partial<BotConfig>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const isCloudModel = form.model.startsWith("openai/") || form.model.startsWith("deepseek/") || form.model.startsWith("volcengine/") || form.model.startsWith("dashscope/");

  // 测试模型连通性
  const handleTest = async () => {
    console.log(`[BotConfig] 测试模型连通性: ${form.model}`);
    setTesting(true);
    setTestResult("idle");
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.model,
          apiKey: form.apiKey || undefined,
          baseURL: form.baseURL || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult("ok");
        console.log(`[BotConfig] ✅ 模型连通成功`);
      } else {
        setTestResult("fail");
        console.warn(`[BotConfig] ❌ 模型连通失败: ${data.error}`);
      }
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  // 添加技能
  const addSkill = () => {
    if (!newSkillName.trim() || !newSkillContent.trim()) return;
    const skill = {
      name: newSkillName.trim(),
      type: "TASK" as const,
      content: newSkillContent.trim(),
    };
    update({ skills: [...form.skills, skill] });
    setNewSkillName("");
    setNewSkillContent("");
    setShowSkillEditor(false);
  };

  // 删除技能
  const removeSkill = (i: number) => {
    update({ skills: form.skills.filter((_, idx) => idx !== i) });
  };

  const handleSave = () => {
    const saved = { ...form, configured: true };
    console.log(`[BotConfig] 保存席位 ${index + 1}:`, saved);
    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4 p-6">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🪐 席位 {index + 1} · 配置
          </h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* 参与者名称 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              参与者名称
            </label>
            <input
              className="dark-input"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="输入参与者名称"
            />
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">模型</label>
            <div className="flex gap-2">
              <select
                className="dark-input flex-1"
                value={form.model}
                onChange={(e) => update({ model: e.target.value })}
              >
                {models.length === 0 && (
                  <option value="ollama/qwen:7b">加载中...</option>
                )}
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.local ? `(${m.size})` : "☁️"}
                  </option>
                ))}
              </select>
              <button
                onClick={handleTest}
                disabled={testing}
                className={`glass-card px-3 py-2 text-sm cursor-pointer ${
                  testResult === "ok"
                    ? "text-green-400 border-green-500/30"
                    : testResult === "fail"
                    ? "text-red-400 border-red-500/30"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {testing ? "..." : testResult === "ok" ? "✅" : testResult === "fail" ? "❌" : "测试"}
              </button>
            </div>
          </div>

          {/* API Key（云端模型） */}
          {isCloudModel && (
            <div>
              <label className="block text-white/60 text-sm mb-1.5">
                API Key
              </label>
              <input
                className="dark-input"
                type="password"
                value={form.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="输入 API Key"
              />
            </div>
          )}

          {/* Base URL（云端模型） */}
          {isCloudModel && (
            <div>
              <label className="block text-white/60 text-sm mb-1.5">
                Base URL（可选）
              </label>
              <input
                className="dark-input"
                value={form.baseURL}
                onChange={(e) => update({ baseURL: e.target.value })}
                placeholder={form.model.startsWith("deepseek/") ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1"}
              />
            </div>
          )}

          {/* 基础提示词 */}
          <div>
            <label className="block text-white/60 text-sm mb-1.5">
              基础提示词（角色设定）
            </label>
            <textarea
              className="dark-input resize-none"
              rows={3}
              value={form.basePrompt}
              onChange={(e) => update({ basePrompt: e.target.value })}
              placeholder="设定该参与者的角色和性格..."
            />
          </div>

          {/* 技能列表 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-white/60 text-sm">附加技能</label>
              <button
                onClick={() => setShowSkillEditor(!showSkillEditor)}
                className="text-xs text-accent hover:text-white transition-colors cursor-pointer"
              >
                {showSkillEditor ? "取消" : "+ 添加技能"}
              </button>
            </div>

            {/* 技能编辑器 */}
            {showSkillEditor && (
              <div className="space-y-2 p-3 rounded-lg bg-white/5 mb-3">
                <input
                  className="dark-input text-sm"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="技能名称"
                />
                <textarea
                  className="dark-input text-sm resize-none"
                  rows={2}
                  value={newSkillContent}
                  onChange={(e) => setNewSkillContent(e.target.value)}
                  placeholder="技能内容（指令）"
                />
                <button
                  onClick={addSkill}
                  className="glow-button text-sm w-full"
                >
                  添加
                </button>
              </div>
            )}

            {/* 技能列表 */}
            <div className="space-y-1.5">
              {form.skills.length === 0 && (
                <p className="text-white/20 text-xs">暂无附加技能</p>
              )}
              {form.skills.map((skill, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between p-2 rounded-lg bg-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-white/70 text-sm font-medium">
                      {skill.name}
                    </span>
                    <p className="text-white/40 text-xs truncate">
                      {skill.content}
                    </p>
                  </div>
                  <button
                    onClick={() => removeSkill(i)}
                    className="text-red-400/50 hover:text-red-400 ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-between items-center mt-8">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                form.configured ? "bg-green-400" : "bg-white/20"
              }`}
            />
            <span className="text-white/30 text-xs">
              {form.configured ? "已配置" : "未配置"}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-white/50 hover:text-white/80 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button onClick={handleSave} className="glow-button">
              💾 保存席位
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
