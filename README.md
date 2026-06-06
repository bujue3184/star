# 星际辩台 ⭐ —— AI 多模型回合制讨论平台

基于 Three.js + Next.js 的 3D 星空辩论/讨论平台。支持本地 Ollama 模型和云端 API（DeepSeek/OpenAI/豆包/千问），由 DeepSeek V4 担任导演动态调度。

## 快速开始

### 前置要求

- Node.js 18+
- Ollama（如需使用本地模型）
- npm

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/your-username/star
cd star

# 2. 安装依赖
npm install

# 3. 初始化数据库
npx prisma db push

# 4. （可选）配置 API 密钥
# 复制 .env 文件，填入你的密钥
# cp .env.example .env

# 5. 启动
npx next dev -p 3000
```

浏览器打开 `http://localhost:3000`

### 使用 Docker

```bash
docker compose up -d
```

---

## 功能特性

### 3D 星空场景
- 2500 颗粒子星空背景
- 6 大星球席位（AI 形象贴图）
- 中心恒星（裁判席）
- CSS2D 对话气泡（发言实时显示在星球头顶）

### AI 模型支持（5 家厂商）
| 厂商 | 标识 | 类型 |
|------|------|------|
| Ollama 本地模型 | `ollama/*` | deepseek-r1, qwen, gemma 等 |
| OpenAI | `openai/*` | GPT-4o, GPT-4o-mini |
| DeepSeek | `deepseek/*` | deepseek-chat, deepseek-reasoner |
| 火山引擎/豆包 | `volcengine/*` | doubao-pro, doubao-lite |
| 阿里云/千问 | `dashscope/*` | qwen-plus, qwen-max |

### V4 导演统筹
- DeepSeek V4 动态调度每位选手发言
- 每次只调一人，像真人对话
- V4 根据上下文决定谁发言、说什么方向
- 讨论完成时弹窗让玩家确认结束

### 流式 SSE 输出
- 逐 token 实时推送
- 星球气泡 + 侧边栏同步更新
- 当前发言星球高亮

---

## 项目结构

```
star/
├── prisma/schema.prisma          # 数据模型
├── src/
│   ├── app/
│   │   ├── page.tsx               # 首页：3D 场景 + 席位配置
│   │   ├── game/[id]/page.tsx    # 游戏房间
│   │   └── api/                   # REST API 集
│   ├── components/
│   │   ├── three/                 # Three.js 3D 组件
│   │   │   ├── star-field.ts      # 星空粒子
│   │   │   ├── planet-ring.ts     # 星球/恒星
│   │   │   ├── scene-manager.ts   # 场景引擎
│   │   │   └── speech-bubble.ts   # 对话气泡
│   │   ├── three-scene.tsx        # React 3D 容器
│   │   ├── global-config-modal.tsx # 恒星配置弹窗
│   │   └── bot-config-modal.tsx   # 席位配置弹窗
│   └── lib/
│       ├── game-engine.ts         # 回合引擎
│       ├── game-engine-stream.ts  # 流式回合引擎
│       ├── prompt-merger.ts       # Prompt 合并器
│       ├── model/                 # AI 模型调用层
│       └── plugins/               # 插件系统
├── 开发日志V1.0.md                 # 开发日志
└── README.md
```

---

## 配置说明

### 环境变量

```env
# 数据库
DATABASE_URL="file:./prisma/dev.db"

# API 密钥（可选，可在界面中输入）
OPENAI_API_KEY="sk-xxx"
DEEPSEEK_API_KEY="sk-xxx"
VOLCENGINE_API_KEY="xxx"
DASHSCOPE_API_KEY="sk-xxx"
```

### Ollama 模型推荐

| 模型 | 大小 | 推荐用途 |
|------|------|----------|
| deepseek-r1:8b | 5.2 GB | 主力选手，推理能力强 |
| qwen:7b | 4.5 GB | 常规讨论 |
| gemma3:4b | 3.3 GB | 轻量选手 |

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/game` | 游戏列表 |
| `POST` | `/api/game` | 创建游戏 |
| `POST` | `/api/game/:id/start` | 开始游戏 |
| `POST` | `/api/game/:id/turn/stream` | 流式下一回合 |
| `POST` | `/api/game/:id/end` | 结束游戏 |
| `GET` | `/api/models` | 探测可用模型 |

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) |
| 3D 渲染 | Three.js + CSS2DRenderer |
| 样式 | Tailwind CSS 4 |
| 数据库 | Prisma 5 + SQLite |
| AI 调用 | Ollama + REST API |
| 流式传输 | SSE (Server-Sent Events) |
