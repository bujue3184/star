/**
 * SpeechBubble —— 星球对话气泡
 *
 * 使用 CSS2DRenderer 在 3D 场景中叠加 HTML 气泡。
 * 每个星球绑定一个，位置随星球公转自动更新。
 */

import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

/** 气泡样式 —— 全局单例 style 标签 */
let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .sb-container {
      position: absolute;
      pointer-events: none;
      z-index: 10;
      transition: opacity 0.3s ease;
    }
    .sb-bubble {
      background: rgba(10, 10, 30, 0.85);
      border: 1px solid rgba(100, 150, 255, 0.3);
      border-radius: 12px;
      padding: 10px 14px;
      min-width: 180px;
      max-width: 280px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: #e0e0ff;
      font-size: 13px;
      line-height: 1.5;
      font-family: var(--font-sans, Arial, sans-serif);
      word-wrap: break-word;
      white-space: pre-wrap;
      position: relative;
      transition: all 0.3s ease;
    }
    /* 气泡小三角 */
    .sb-bubble::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 24px;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid rgba(10, 10, 30, 0.85);
    }
    .sb-bubble.speaking {
      border-color: rgba(80, 200, 120, 0.6);
      box-shadow: 0 4px 20px rgba(80, 200, 120, 0.15);
    }
    .sb-bubble .sb-name {
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 4px;
      opacity: 0.7;
    }
    .sb-bubble .sb-text {
      min-height: 1.2em;
    }
    .sb-cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: rgba(80, 200, 120, 0.8);
      margin-left: 2px;
      animation: sb-blink 0.8s step-end infinite;
      vertical-align: text-bottom;
    }
    @keyframes sb-blink {
      50% { opacity: 0; }
    }
    .sb-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

export interface BubbleHandle {
  /** 设置气泡文本（流式追加） */
  setText: (text: string) => void;
  /** 显示气泡 */
  show: () => void;
  /** 隐藏气泡 */
  hide: () => void;
  /** 设置为正在发言状态（绿色边框 + 光标） */
  setSpeaking: (speaking: boolean) => void;
  /** 设置主题色 */
  setColor: (color: string) => void;
  /** 销毁 */
  dispose: () => void;
}

/**
 * 创建一个对话气泡，绑定到 3D 坐标
 * @param name 角色名
 * @param color 主题色（十六进制）
 * @param position 初始位置
 */
export function createBubble(
  name: string,
  color: number,
  position: THREE.Vector3
): { object: CSS2DObject; handle: BubbleHandle } {
  injectStyles();

  const hexColor = "#" + new THREE.Color(color).getHexString();

  // ── 容器 ──
  const container = document.createElement("div");
  container.className = "sb-container sb-hidden";
  container.style.left = "-140px"; // 居中偏移（max-width/2 ≈ 140）
  container.style.top = "-10px";

  // ── 气泡 ──
  const bubble = document.createElement("div");
  bubble.className = "sb-bubble";
  bubble.style.borderColor = hexColor + "44";

  const nameEl = document.createElement("div");
  nameEl.className = "sb-name";
  nameEl.style.color = hexColor;
  nameEl.textContent = name;

  const textEl = document.createElement("div");
  textEl.className = "sb-text";

  const cursor = document.createElement("span");
  cursor.className = "sb-cursor";

  bubble.appendChild(nameEl);
  bubble.appendChild(textEl);
  container.appendChild(bubble);

  // ── CSS2DObject ──
  const object = new CSS2DObject(container);
  object.position.copy(position);

  const handle: BubbleHandle = {
    setText(text: string) {
      textEl.innerHTML = "";
      if (text) {
        const span = document.createElement("span");
        span.textContent = text;
        textEl.appendChild(span);
      }
      textEl.appendChild(cursor);
    },

    show() {
      container.classList.remove("sb-hidden");
    },

    hide() {
      container.classList.add("sb-hidden");
    },

    setSpeaking(speaking: boolean) {
      bubble.classList.toggle("speaking", speaking);
    },

    setColor(c: string) {
      bubble.style.borderColor = c + "44";
      nameEl.style.color = c;
    },

    dispose() {
      container.remove();
    },
  };

  return { object, handle };
}
