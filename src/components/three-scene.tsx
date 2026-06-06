"use client";

/**
 * ThreeScene —— Three.js 场景的 React 容器组件
 *
 * 使用 useEffect 管理 SceneManager 生命周期。
 * 通过 forwardRef 暴露 setPlanetThinking / setAutoRotate 方法给父组件。
 *
 * 日志关键点：组件挂载/卸载、props 变化
 */

import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { SceneManager } from "./three/scene-manager";

export interface ThreeSceneHandle {
  setPlanetThinking: (index: number | null) => void;
  setAutoRotate: (enabled: boolean) => void;
  setBubbleText: (index: number, text: string) => void;
  appendBubbleText: (index: number, text: string, fullText: string) => void;
  setBubbleDone: (index: number, finalText: string) => void;
  hideAllBubbles: () => void;
  showStarDirective: (text: string) => void;
  hideStarDirective: () => void;
}

interface ThreeSceneProps {
  /** 点击星球回调 */
  onPlanetClick?: (index: number) => void;
  /** 点击恒星（裁判席）回调 */
  onStarClick?: () => void;
  /** 是否启用自动旋转 */
  autoRotate?: boolean;
  /** 容器 className */
  className?: string;
}

const ThreeScene = forwardRef<ThreeSceneHandle, ThreeSceneProps>(
  function ThreeScene(
    { onPlanetClick, onStarClick, autoRotate = true, className = "" },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const managerRef = useRef<SceneManager | null>(null);

    const handlePlanetClick = useCallback(
      (index: number) => {
        console.log(`[ThreeScene] 星球点击事件上报: index=${index}`);
        onPlanetClick?.(index);
      },
      [onPlanetClick]
    );

    const handleStarClick = useCallback(() => {
      console.log("[ThreeScene] 恒星点击事件上报");
      onStarClick?.();
    }, [onStarClick]);

    useEffect(() => {
      if (!containerRef.current) {
        console.warn("[ThreeScene] ❌ containerRef 为空，无法初始化");
        return;
      }

      console.log("[ThreeScene] 开始初始化 Three.js 场景...");
      const manager = new SceneManager({
        container: containerRef.current,
        onPlanetClick: handlePlanetClick,
        onStarClick: handleStarClick,
      });

      manager.init();
      managerRef.current = manager;

      console.log("[ThreeScene] ✅ Three.js 场景初始化完成");

      return () => {
        console.log("[ThreeScene] 组件卸载，销毁场景...");
        manager.destroy();
        managerRef.current = null;
      };
    }, [handlePlanetClick, handleStarClick]);

    // 暴露给父组件的方法
    useImperativeHandle(
      ref,
      () => ({
        setPlanetThinking(index: number | null) {
          managerRef.current?.setPlanetThinking(index);
        },
        setAutoRotate(enabled: boolean) {
          managerRef.current?.setAutoRotate(enabled);
        },
        setBubbleText(index: number, text: string) {
          managerRef.current?.setBubbleText(index, text);
        },
        appendBubbleText(index: number, _text: string, fullText: string) {
          managerRef.current?.appendBubbleText(index, _text, fullText);
        },
        setBubbleDone(index: number, finalText: string) {
          managerRef.current?.setBubbleDone(index, finalText);
        },
        hideAllBubbles() {
          managerRef.current?.hideAllBubbles();
        },
        showStarDirective(text: string) {
          managerRef.current?.showStarDirective(text);
        },
        hideStarDirective() {
          managerRef.current?.hideStarDirective();
        },
      }),
      []
    );

    // 响应 autoRotate props 变化
    useEffect(() => {
      if (managerRef.current) {
        managerRef.current.setAutoRotate(autoRotate);
      }
    }, [autoRotate]);

    return (
      <div
        ref={containerRef}
        className={`three-scene-container ${className}`}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
        }}
      />
    );
  }
);

export default ThreeScene;
