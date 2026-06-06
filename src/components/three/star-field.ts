/**
 * StarField —— 星空粒子背景
 *
 * 2500 颗星星分布在球壳中，带闪烁和颜色渐变。
 * 日志关键点：粒子生成数、动画帧率
 */

import * as THREE from "three";

const STAR_COUNT = 2500;
const STAR_RADIUS_MIN = 100;
const STAR_RADIUS_MAX = 500;

export function createStarField(): {
  points: THREE.Points;
  update: (time: number) => void;
  cleanup: () => void;
} {
  console.log(`[StarField] 开始生成 ${STAR_COUNT} 颗星星...`);

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const baseSizes = new Float32Array(STAR_COUNT); // 原始大小（不随动画变化）
  const displaySizes = new Float32Array(STAR_COUNT); // 显示大小（动画更新）
  const colors = new Float32Array(STAR_COUNT * 3);
  const speeds = new Float32Array(STAR_COUNT); // 闪烁速度

  const colorPalette = [
    new THREE.Color(0xffffff), // 白
    new THREE.Color(0xaaccff), // 淡蓝
    new THREE.Color(0xffddaa), // 淡橙
    new THREE.Color(0xccddff), // 蓝白
    new THREE.Color(0xffccdd), // 粉白
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    // 球壳内随机位置
    const radius =
      STAR_RADIUS_MIN + Math.random() * (STAR_RADIUS_MAX - STAR_RADIUS_MIN);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    // 大小：0.3 ~ 2.0
    baseSizes[i] = 0.3 + Math.random() * 1.7;
    displaySizes[i] = baseSizes[i];

    // 颜色
    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // 闪烁速度
    speeds[i] = 0.5 + Math.random() * 2.0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(displaySizes, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // 星星材质 —— 圆形渐变纹理
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const starTexture = new THREE.CanvasTexture(canvas);

  const material = new THREE.PointsMaterial({
    size: 1.5,
    map: starTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true,
    opacity: 0.9,
  });

  const points = new THREE.Points(geometry, material);

  console.log(`[StarField] ✅ 生成完成: ${STAR_COUNT} 颗星星`);
  console.log(`[StarField] 范围半径: ${STAR_RADIUS_MIN} ~ ${STAR_RADIUS_MAX}`);

  // 闪烁动画
  let frameCount = 0;
  function update(time: number) {
    frameCount++;
    const sizeAttr = geometry.attributes.size;
    const array = sizeAttr.array as Float32Array;

    for (let i = 0; i < STAR_COUNT; i++) {
      const pulse = 0.6 + 0.4 * Math.sin(time * speeds[i] + i * 0.1);
      array[i] = baseSizes[i] * pulse;
    }
    sizeAttr.needsUpdate = true;

    if (frameCount % 300 === 0) {
      console.log(
        `[StarField] 动画运行中: frame=${frameCount}, time=${time.toFixed(1)}s`
      );
    }
  }

  function cleanup() {
    console.log("[StarField] 清理资源...");
    geometry.dispose();
    material.dispose();
    starTexture.dispose();
  }

  return { points, update, cleanup };
}
