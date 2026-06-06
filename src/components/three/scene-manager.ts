/**
 * SceneManager —— Three.js 场景生命周期管理
 *
 * 新增 CSS2DRenderer + 对话气泡系统
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { createStarField } from "./star-field";
import { createPlanetRing, type PlanetData, type CentralStar } from "./planet-ring";
import { createBubble, type BubbleHandle } from "./speech-bubble";

export interface SceneManagerOptions {
  container: HTMLElement;
  onPlanetClick?: (planetIndex: number) => void;
  onStarClick?: () => void;
}

export class SceneManager {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private labelRenderer!: CSS2DRenderer; // CSS2D 叠加层
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private starField!: ReturnType<typeof createStarField>;
  private planetRing!: ReturnType<typeof createPlanetRing>;

  private bubbles: BubbleHandle[] = []; // 6 个星球的气泡
  private starBubble: BubbleHandle | null = null; // 恒星气泡
  private starBubbleObject: THREE.Object3D | null = null;
  private bubbleObjects: THREE.Object3D[] = [];

  private animFrameId = 0;
  private startTime = 0;
  private frameCount = 0;
  private lastLogTime = 0;

  private container: HTMLElement;
  private onPlanetClick?: (planetIndex: number) => void;
  private onStarClick?: () => void;

  constructor(opts: SceneManagerOptions) {
    this.container = opts.container;
    this.onPlanetClick = opts.onPlanetClick;
    this.onStarClick = opts.onStarClick;
  }

  init() {
    console.log("[SceneManager] 初始化 Three.js 场景...");

    // ── 场景 ──
    this.scene = new THREE.Scene();

    // ── 相机 ──
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(18, 12, 22);
    this.camera.lookAt(0, 0, 0);

    // ── WebGL 渲染器 ──
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // ── CSS2D 渲染器（对话气泡层） ──
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.top = "0";
    this.labelRenderer.domElement.style.left = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none"; // 点击穿透
    this.container.appendChild(this.labelRenderer.domElement);

    // ── 控制器 ──
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.maxDistance = 60;
    this.controls.minDistance = 8;
    this.controls.target.set(0, 0, 0);

    // ── 灯光 ──
    this.scene.add(new THREE.AmbientLight(0x222244, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
    const pl1 = new THREE.PointLight(0x4488ff, 0.5, 50);
    pl1.position.set(-10, 5, -10);
    this.scene.add(pl1);
    const pl2 = new THREE.PointLight(0xff4488, 0.3, 50);
    pl2.position.set(10, -5, 10);
    this.scene.add(pl2);

    // ── 星空 ──
    this.starField = createStarField();
    this.scene.add(this.starField.points);

    // ── 星球环 ──
    this.planetRing = createPlanetRing();
    this.scene.add(this.planetRing.group);

    // ── 对话气泡（每个星球绑定一个） ──
    const colorPalette = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa06cd5, 0x2ecc71, 0x3498db];
    for (let i = 0; i < 6; i++) {
      const planet = this.planetRing.planets[i];
      // 气泡初始位置在星球上方
      const pos = planet.mesh.position.clone().add(new THREE.Vector3(0, 4, 0));
      const { object, handle } = createBubble(planet.name, colorPalette[i], pos);
      this.bubbles.push(handle);
      this.bubbleObjects.push(object);
      this.scene.add(object);
    }

    // ── 中心恒星气泡（显示 V4 导演指令） ──
    const starPos = new THREE.Vector3(0, 5, 0);
    const { object: starObj, handle: starHandle } = createBubble("🎬 导演", 0xffaa44, starPos);
    this.starBubble = starHandle;
    this.starBubbleObject = starObj;
    this.scene.add(starObj);

    // ── 事件绑定 ──
    window.addEventListener("resize", this.handleResize);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    this.renderer.domElement.addEventListener("touchstart", this.handleTouchStart, { passive: false });

    // ── 启动 ──
    this.startTime = performance.now();
    this.animate();
    console.log("[SceneManager] ✅ 初始化完成（含 CSS2D 对话气泡）");
  }

  // ── 对话气泡控制 ──

  /** 显示某个星球的气泡并设置文本 */
  setBubbleText(index: number, text: string) {
    if (index >= 0 && index < this.bubbles.length) {
      this.bubbles[index].show();
      this.bubbles[index].setSpeaking(true);
      this.bubbles[index].setText(text);
    }
  }

  /** 追加文本到气泡 */
  appendBubbleText(index: number, text: string, fullText: string) {
    if (index >= 0 && index < this.bubbles.length) {
      this.bubbles[index].setText(fullText);
    }
  }

  /** 隐藏所有气泡（含恒星） */
  hideAllBubbles() {
    for (const b of this.bubbles) b.hide();
    this.starBubble?.hide();
  }

  /** 显示恒星气泡（V4 导演指令） */
  showStarDirective(text: string) {
    this.starBubble?.show();
    this.starBubble?.setText(text);
    this.starBubble?.setSpeaking(true);
  }

  /** 隐藏恒星气泡 */
  hideStarDirective() {
    this.starBubble?.hide();
    this.starBubble?.setSpeaking(false);
  }

  /** 设置气泡为发言完成状态 */
  setBubbleDone(index: number, finalText: string) {
    if (index >= 0 && index < this.bubbles.length) {
      this.bubbles[index].setText(finalText);
      this.bubbles[index].setSpeaking(false);
    }
  }

  // ── 原有方法 ──

  private handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };

  private handlePointerDown = (clientX: number, clientY: number) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const interactables = [
      ...this.planetRing.planets.map((p) => p.mesh),
      this.planetRing.centralStar.mesh,
    ];
    const intersects = this.raycaster.intersectObjects(interactables);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.isCentralStar) {
        this.onStarClick?.();
        return;
      }
      const index = hit.userData.planetIndex as number;
      if (index !== undefined) this.onPlanetClick?.(index);
    }
  };

  private handleClick = (event: MouseEvent) => this.handlePointerDown(event.clientX, event.clientY);
  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    event.preventDefault();
    this.handlePointerDown(event.touches[0].clientX, event.touches[0].clientY);
  };

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.frameCount++;
    const elapsed = (performance.now() - this.startTime) / 1000;

    this.starField.update(elapsed);
    this.planetRing.update(elapsed);

    // 同步恒星气泡位置
    if (this.starBubbleObject) {
      this.starBubbleObject.position.set(0, 5, 0);
    }

    // 同步气泡位置到星球位置
    for (let i = 0; i < 6; i++) {
      const planetPos = this.planetRing.planets[i].mesh.position;
      this.bubbleObjects[i].position.copy(planetPos);
      this.bubbleObjects[i].position.y += 4; // 悬浮在星球上方
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  getPlanets(): PlanetData[] { return this.planetRing.planets; }
  setPlanetThinking(index: number | null) { this.planetRing.setPlanetThinking(index); }
  setAutoRotate(enabled: boolean) { this.controls.autoRotate = enabled; }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener("resize", this.handleResize);
    if (this.renderer.domElement) {
      this.renderer.domElement.removeEventListener("click", this.handleClick);
      this.renderer.domElement.removeEventListener("touchstart", this.handleTouchStart);
    }
    for (const b of this.bubbles) b.dispose();
    this.starBubble?.dispose();
    this.starField.cleanup();
    this.planetRing.cleanup();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.labelRenderer.domElement.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
    }
  }
}
