/**
 * PlanetRing —— AI 形象星球
 *
 * 每个席位 = 3D 球体 + Logo Sprite（billboard，永远面向用户）+ 光晕
 * 贴图采用 Sprite 浮标方案，避免球面拉伸变形。
 *
 * 日志关键点：纹理加载、创建流程、动画状态
 */

import * as THREE from "three";

// ── AI 席位配置（5 个实际形象 + 1 个通用 AI） ──
const AI_SEATS = [
  { name: "DeepSeek", image: "/images/deepseek.png", color: 0x4a90d9, glowColor: 0x2e5fa1 },
  { name: "千问", image: "/images/千问.png", color: 0x00b4d8, glowColor: 0x0077b6 },
  { name: "Gemini", image: "/images/Gemini.png", color: 0x7c3aed, glowColor: 0x5b21b6 },
  { name: "GPT", image: "/images/GPT.png", color: 0x10b981, glowColor: 0x059669 },
  { name: "豆包", image: "/images/豆包.png", color: 0xff6b35, glowColor: 0xe05220 },
  { name: "AI · 通用", image: null, color: 0x8b5cf6, glowColor: 0x6d28d9 },
];

const RING_RADIUS = 12;
const PLANET_SIZE = 1.2;
const ORBIT_SPEED = 0.08;
const LOGO_SPRITE_SCALE = 2.2;

export interface PlanetData {
  index: number;
  name: string;
  color: number;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;       // 外围光晕
  logoSprite: THREE.Sprite; // AI 形象浮标
  label: THREE.Sprite;      // 名称标签
  thinkingLabel: THREE.Sprite; // "思考中..." 标签
  angle: number;
}

export interface CentralStar {
  mesh: THREE.Mesh;          // 恒星主体
  glow: THREE.Sprite;        // 外围光晕
  corona: THREE.Sprite;      // 日冕射线效果
  pulsePhase: number;
}

export function createPlanetRing(): {
  group: THREE.Group;
  planets: PlanetData[];
  centralStar: CentralStar;
  update: (time: number) => void;
  cleanup: () => void;
  setPlanetThinking: (index: number | null) => void;
} {
  console.log("[PlanetRing] 开始创建 AI 形象星球...");

  const group = new THREE.Group();
  const planets: PlanetData[] = [];
  const loader = new THREE.TextureLoader();

  // ══════════════════════════════════════════════
  //  辅助：圆形渐变纹理（用于光晕 Sprite）
  // ══════════════════════════════════════════════
  function createGlowTexture(color: THREE.Color): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;

    const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    const r = (color.r * 255) | 0;
    const g = (color.g * 255) | 0;
    const b = (color.b * 255) | 0;
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    gradient.addColorStop(0.3, `rgba(${r},${g},${b},0.2)`);
    gradient.addColorStop(0.7, `rgba(${r},${g},${b},0.05)`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }

  // ══════════════════════════════════════════════
  //  辅助：文字标签纹理
  // ══════════════════════════════════════════════
  function createLabelTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 64);

    // 半透明背景圆角矩形
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, 8, 12, 240, 40, 16);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ══════════════════════════════════════════════
  //  辅助：AI Logo Sprite 纹理（TextureLoader + 圆形 alphaMap）
  //  ⚡ 使用 Three.js TextureLoader 标准方式加载，比 Image()+Canvas 更可靠
  // ══════════════════════════════════════════════
  function createLogoSprite(
    imageUrl: string | null,
    accentColor: THREE.Color,
    planetName: string
  ): THREE.Sprite {
    // 生成圆形 alpha 遮罩（所有 Logo 共用）
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = 128;
    alphaCanvas.height = 128;
    const actx = alphaCanvas.getContext("2d")!;
    const grad = actx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.7, "rgba(255,255,255,1)");
    grad.addColorStop(0.85, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    actx.fillStyle = grad;
    actx.fillRect(0, 0, 128, 128);
    const alphaMap = new THREE.CanvasTexture(alphaCanvas);

    if (imageUrl) {
      // ── 有实际图片：TextureLoader 加载 ──
      const texture = loader.load(
        imageUrl,
        () => console.log(`[PlanetRing] ✅ Logo加载成功: ${imageUrl}`),
        undefined,
        () => console.warn(`[PlanetRing] ⚠️ Logo加载失败: ${imageUrl}`)
      );
      texture.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.SpriteMaterial({
        map: texture,
        alphaMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        opacity: 0.95,
      });
      return new THREE.Sprite(mat);
    } else {
      // ── 无图片：Canvas 绘制首字母图标 ──
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const cx = size / 2;
      const r = 100;

      // 背景光晕
      const bg = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
      const cr = (accentColor.r * 255) | 0;
      const cg = (accentColor.g * 255) | 0;
      const cb = (accentColor.b * 255) | 0;
      bg.addColorStop(0, `rgba(${cr},${cg},${cb},0.3)`);
      bg.addColorStop(1, `rgba(${cr},${cg},${cb},0.05)`);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.fill();

      // 首字母
      const letter = planetName.charAt(0).toUpperCase();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `bold ${r * 0.7}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, cx, cx + 2);

      // "AI" 小字
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = `${r * 0.18}px Arial, sans-serif`;
      ctx.fillText("AI", cx, cx + r * 0.45);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        alphaMap,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
      });
      return new THREE.Sprite(mat);
    }
  }

  // ══════════════════════════════════════════════
  //  辅助：Canvas roundRect polyfill
  // ══════════════════════════════════════════════
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ══════════════════════════════════════════════
  //  创建 6 个席位
  // ══════════════════════════════════════════════
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const seat = AI_SEATS[i];
    const color = new THREE.Color(seat.color);
    const glowCol = new THREE.Color(seat.glowColor);

    console.log(`[PlanetRing] 席位 ${i + 1}: ${seat.name}, color=#${color.getHexString()}`);

    // ── ① 星球主体（3D 球体） ──
    const geo = new THREE.SphereGeometry(PLANET_SIZE, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.25,
      specular: new THREE.Color(0x333355),
      shininess: 40,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      RING_RADIUS * Math.cos(angle),
      0,
      RING_RADIUS * Math.sin(angle)
    );
    mesh.userData.planetIndex = i;
    group.add(mesh);

    // ── ② 外围光晕 ──
    const glowTex = createGlowTexture(glowCol);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(5.5, 5.5, 1);
    glow.position.copy(mesh.position);
    group.add(glow);

    // ── ③ AI 形象 Logo Sprite（billboard，永远面向相机） ──
    const logoSprite = createLogoSprite(seat.image, glowCol, seat.name);
    logoSprite.scale.set(LOGO_SPRITE_SCALE, LOGO_SPRITE_SCALE, 1);

    // 浮在球体前方（沿径向向外偏移，加大间距避免穿模）
    const radialOffset = PLANET_SIZE * 3.0;
    logoSprite.position.set(
      mesh.position.x + radialOffset * Math.cos(angle),
      mesh.position.y,
      mesh.position.z + radialOffset * Math.sin(angle)
    );
    group.add(logoSprite);

    // ── ④ 名称标签 ──
    const labelTex = createLabelTexture(seat.name);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTex,
      transparent: true,
      depthWrite: false,
    });
    const label = new THREE.Sprite(labelMat);
    label.position.set(
      mesh.position.x,
      mesh.position.y - PLANET_SIZE - 1.8,
      mesh.position.z
    );
    label.scale.set(3.2, 0.8, 1);
    group.add(label);

    // ── ⑤ "思考中..." 标签（默认隐藏） ──
    const thinkingTex = (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 80;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 256, 80);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      roundRect(ctx, 20, 10, 216, 60, 20);
      ctx.fill();
      ctx.fillStyle = "#ffdd44";
      ctx.font = "bold 22px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡ 思考中...", 128, 44);
      return new THREE.CanvasTexture(canvas);
    })();
    const thinkingMat = new THREE.SpriteMaterial({
      map: thinkingTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const thinkingLabel = new THREE.Sprite(thinkingMat);
    thinkingLabel.position.set(
      mesh.position.x,
      mesh.position.y + PLANET_SIZE + 2.5,
      mesh.position.z
    );
    thinkingLabel.scale.set(3.5, 1.1, 1);
    thinkingLabel.visible = false;
    group.add(thinkingLabel);

    // ── ⑥ 连接线（中心到球体） ──
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array([
      0, 0, 0,
      mesh.position.x, mesh.position.y, mesh.position.z,
    ]);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    group.add(line);

    planets.push({
      index: i,
      name: seat.name,
      color: seat.color,
      mesh,
      glow,
      logoSprite,
      label,
      thinkingLabel,
      angle,
    });

    console.log(`[PlanetRing] ✅ 席位 ${i + 1} 创建完成`);
  }

  console.log(`[PlanetRing] ✅ 全部 ${AI_SEATS.length} 个 AI 形象星球创建完成`);

  // ══════════════════════════════════════════════
  //  中心恒星（裁判席）
  // ══════════════════════════════════════════════
  console.log("[PlanetRing] 创建中心恒星（裁判席）...");

  const starGroup = new THREE.Group();

  // ① 恒星主体 —— 大号金色球体
  const starGeo = new THREE.SphereGeometry(2.0, 48, 48);
  const starMat = new THREE.MeshPhongMaterial({
    color: 0xffaa44,
    emissive: 0xff8800,
    emissiveIntensity: 0.8,
    shininess: 10,
  });
  const starMesh = new THREE.Mesh(starGeo, starMat);
  starMesh.userData.isCentralStar = true;
  starGroup.add(starMesh);

  // ② 内部光晕（小范围高亮）
  const innerGlowTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,200,100,0.8)");
    g.addColorStop(0.3, "rgba(255,150,50,0.4)");
    g.addColorStop(0.6, "rgba(255,100,0,0.1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  })();
  const innerGlowMat = new THREE.SpriteMaterial({
    map: innerGlowTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const innerGlow = new THREE.Sprite(innerGlowMat);
  innerGlow.scale.set(6, 6, 1);
  starGroup.add(innerGlow);

  // ③ 外光晕（大范围扩散）
  const outerGlowTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,180,80,0.3)");
    g.addColorStop(0.4, "rgba(255,120,40,0.1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  })();
  const outerGlowMat = new THREE.SpriteMaterial({
    map: outerGlowTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const outerGlow = new THREE.Sprite(outerGlowMat);
  outerGlow.scale.set(14, 14, 1);
  starGroup.add(outerGlow);

  // ④ 日冕射线（十字光晕）
  const coronaTex = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    // 四向射线
    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate((i * Math.PI) / 2);
      ctx.translate(-128, -128);
      const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 120);
      g.addColorStop(0, "rgba(255,200,100,0)");
      g.addColorStop(0.3, "rgba(255,180,80,0.15)");
      g.addColorStop(0.7, "rgba(255,150,50,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      // 水平拉伸的椭圆
      ctx.beginPath();
      ctx.ellipse(128, 128, 110, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return new THREE.CanvasTexture(canvas);
  })();
  const coronaMat = new THREE.SpriteMaterial({
    map: coronaTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.set(20, 20, 1);
  starGroup.add(corona);

  group.add(starGroup);

  const centralStar: CentralStar = {
    mesh: starMesh,
    glow: innerGlow,
    corona,
    pulsePhase: 0,
  };

  console.log("[PlanetRing] ✅ 中心恒星创建完成");

  // ── Thinking 状态管理 ──
  let thinkingIndex: number | null = null;

  /**
   * 设置某个星球为"思考中"状态
   * @param index 星球索引（0-5），传 null 清除所有
   */
  function setPlanetThinking(index: number | null) {
    thinkingIndex = index;
    for (const p of planets) {
      const isThinking = p.index === index;
      p.thinkingLabel.visible = isThinking;

      if (isThinking) {
        // 高亮星球
        (p.mesh.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.8;
        p.glow.material.opacity = 0.9;
        console.log(`[PlanetRing] 💭 ${p.name} 开始思考`);
      } else {
        // 恢复默认
        (p.mesh.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.25;
        p.glow.material.opacity = 0.6;
      }
    }
    if (index === null) {
      console.log("[PlanetRing] 💭 思考结束，恢复所有星球");
    }
  }

  // ══════════════════════════════════════════════
  //  动画循环
  // ══════════════════════════════════════════════
  let frameCount = 0;

  function update(time: number) {
    frameCount++;

    for (const planet of planets) {
      // 球体自转
      planet.mesh.rotation.y += 0.008;
      planet.mesh.rotation.x += 0.004;

      // 公转
      planet.angle += ORBIT_SPEED * 0.016;
      const x = RING_RADIUS * Math.cos(planet.angle);
      const z = RING_RADIUS * Math.sin(planet.angle);

      // 更新位置
      planet.mesh.position.set(x, 0, z);
      planet.glow.position.set(x, 0, z);
      planet.label.position.set(x, -PLANET_SIZE - 1.8, z);
      planet.thinkingLabel.position.set(
        x,
        planet.mesh.position.y + PLANET_SIZE + 2.5,
        z
      );

      // Logo Sprite 沿径向浮在球前方（加大间距避免穿模）
      const logoOffset = PLANET_SIZE * 3.0;
      planet.logoSprite.position.set(
        x + logoOffset * Math.cos(planet.angle),
        0,
        z + logoOffset * Math.sin(planet.angle)
      );

      // 更新连接线（mesh + glow + logoSprite + label + thinkingLabel = 5）
      const lineIdx = group.children.indexOf(planet.mesh) + 5;
      const line = group.children[lineIdx] as THREE.Line;
      if (line && line.geometry) {
        const pos = line.geometry.attributes.position.array as Float32Array;
        pos[3] = x;
        pos[5] = z;
        line.geometry.attributes.position.needsUpdate = true;
      }

      // 光晕脉冲（思考中加速）
      const isThinking = planet.index === thinkingIndex;
      if (isThinking) {
        // 快速脉冲 + 呼吸
        planet.glow.material.opacity = 0.6 + 0.4 * Math.sin(time * 3.0);
        planet.glow.scale.setScalar(5.5 + Math.sin(time * 2.5) * 1.0);
        (planet.mesh.material as THREE.MeshPhongMaterial).emissiveIntensity =
          0.5 + 0.5 * Math.sin(time * 3.0);
        planet.thinkingLabel.material.opacity =
          0.7 + 0.3 * Math.sin(time * 2.0);
      } else {
        planet.glow.material.opacity =
          0.4 + 0.2 * Math.sin(time * 0.5 + planet.index);
      }
    }

    // ── 恒星动画：脉动 + 自转 + 光晕呼吸 ──
    centralStar.mesh.rotation.y += 0.005;
    centralStar.mesh.rotation.x += 0.003;
    const pulse = 0.85 + 0.15 * Math.sin(time * 0.8);
    centralStar.mesh.scale.setScalar(pulse);
    (centralStar.mesh.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.6 + 0.4 * Math.sin(time * 0.7);
    centralStar.glow.material.opacity = 0.7 + 0.3 * Math.sin(time * 0.5);
    centralStar.glow.scale.setScalar(5 + Math.sin(time * 0.6) * 0.8);
    centralStar.corona.material.opacity = 0.2 + 0.15 * Math.sin(time * 0.3);
    centralStar.corona.rotation.z = time * 0.02;

    if (frameCount % 300 === 0) {
      console.log(
        `[PlanetRing] 动画运行中: frame=${frameCount}, planets=${planets.length}`
      );
    }
  }

  function cleanup() {
    console.log("[PlanetRing] 清理资源...");
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        child.material.dispose();
        if (child.material.map) child.material.map.dispose();
      }
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  }

  return { group, planets, centralStar, update, cleanup, setPlanetThinking };
}
