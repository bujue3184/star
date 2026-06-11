传统的API调用是被动响应：你发请求，模型回消息。
主动触发是：模型在后台持续“思考”，当它判断某个条件达成时（例如“现在轮到我反击了”“我发现了矛盾点”），主动通过WebSocket向服务器发送一条消息，服务器再广播给所有客户端。

这种模式打破了“请求-响应”的枷锁，让AI获得了一定的“发言自主权”。

🔌 二、技术架构：WebSocket + 后台任务
需要三个核心组件：

1. 持久化的WebSocket连接
每个AI角色（或每个席位）在启动时，与服务器建立一个WebSocket连接，并保持长期在线。

typescript
// 前端（每个AI席位）
const ws = new WebSocket('ws://localhost:3000/api/ai/gpt');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'invitation_to_speak') {
    // 收到“可以发言了”的邀请，调用模型生成回复
    generateAndSendReply(msg.context);
  }
};
2. 服务器端的“触发器”服务
服务器维护一个触发器定时器，每秒检查所有AI的状态（当前轮次、是否有未读消息、是否有紧急事件等）。当条件满足时，服务器向对应AI的WebSocket发送一个invitation_to_speak事件，并附带当前上下文。

typescript
// 伪代码：触发器服务
setInterval(async () => {
  for (const ai of allActiveAIs) {
    if (ai.isIdle && gameContext.hasUnaddressedPoint(ai.id)) {
      ai.ws.send(JSON.stringify({
        type: 'invitation_to_speak',
        context: gameContext.getLatestMessages(5)
      }));
      ai.isIdle = false; // 标记为忙碌，避免重复触发
    }
  }
}, 1000); // 每秒扫描一次
3. AI模型主动生成回复
收到invitation_to_speak后，AI前端（或后端代理）调用模型API生成回复，然后把回复通过WebSocket发回服务器，服务器再广播给所有其他AI和观众。

typescript
// 收到邀请后
async function generateAndSendReply(context) {
  const reply = await callAIModel(context); // 调用本地或云端API
  ws.send(JSON.stringify({ type: 'reply', content: reply }));
}
🎮 三、在“星际辩台”中的具体应用
场景一：AI觉得被冤枉了，主动反驳
触发条件：某AI发现最近的对话中，有其他AI连续两次提到自己的名字 + 带有负面词汇（如“撒谎”“可疑”）。

实现：服务器触发器分析消息队列，检测到“target = 某AI && sentiment < 0”时，立即邀请该AI发言。

场景二：长时间沉默，主动刷存在感
触发条件：某AI超过90秒没有发言。

实现：触发器记录每个AI的最后发言时间，超时则发送invitation_to_speak，并附带提示“你很久没说话了，随便说点什么吧”。

场景三：结盟/背叛的密谋
触发条件：两个AI私聊窗口（可以用单独的WebSocket频道）中出现“联盟”“联手”等关键词。

实现：私聊消息也经过服务器，触发器检测到敏感词后，可以主动向第三方AI发送警告：“我怀疑XX和XX在密谋对付你”。

⚙️ 四、工程实现要点
1. 使用Redis存储实时状态
每个AI的lastSpeakTime, isIdle, pendingInvitation等状态用Redis存储，触发器服务可以水平扩展。

2. 避免“踩踏效应”
如果多个触发器同时邀请同一个AI，需要加锁或去重。可以在发送邀请后设置一个短暂的冷却时间（如5秒），期间不再重复邀请。

3. 模型侧需要特殊的System Prompt
为了让模型理解“被邀请发言”的含义，需要在它的Skill里加入这样的提示：

text
你正在参与一个实时辩论。当服务器向你发送【邀请发言】事件时，意味着轮到你表达了。请根据当前对话历史，发表你的观点。你可以质疑别人、申辩自己、或者提出新线索。不要重复别人刚说过的话。
4. 人类观众/上帝干预的集成
你也可以让人类观众通过WebSocket发送“上帝指令”（例如“让豆包立刻反驳GPT”），服务器收到后直接转换为对豆包的invitation_to_speak，并附加一条系统提示：“有人命令你必须反驳GPT上一句话”。

🚀 五、这个机制带来的新玩法
AI可以打断别人：如果某AI觉得对方在说谎，可以申请“紧急插话”。服务器可以允许高优先级AI（如裁判）随时打断。

情绪驱动的发言：检测到AI的“愤怒值”积累到一定程度，主动触发“爆发式发言”。

观众互动：观众投票“我想听XX说话”，服务器立即触发该AI。

📦 六、开源参考实现
可以参考以下开源项目快速上手：

Socket.IO：提供自动重连、房间管理的WebSocket框架，适合快速原型。

NestJS WebSocket Gateway：如果你用Node.js，它的WebSocket模块非常优雅。

LangChain的“Agent Executor with WebSocket”：社区已有示例，把LLM的“should_act”决策与WebSocket结合。

以下是 WebSocket + 模型主动触发机制 的完整时序图，涵盖了从连接建立、触发器扫描、主动邀请、模型推理到消息广播的全流程。
sequenceDiagram
    participant A as AI席位 (前端)
    participant WS as WebSocket服务器
    participant TG as 触发器服务 (每秒扫描)
    participant AI as 模型API (本地/云端)
    participant Others as 其他AI席位/观众

    Note over A,WS: 1. 建立连接
    A->>WS: WebSocket 连接请求
    WS-->>A: 连接确认，分配席位ID

    loop 每轮游戏/实时博弈
        Note over TG: 2. 触发器持续扫描状态
        TG->>WS: 获取所有AI的实时状态 (最后发言时间、未应答消息、情绪值等)
        WS-->>TG: 返回状态列表

        alt 条件满足 (如: 某AI超过90秒未发言)
            TG->>WS: 发送 invitation_to_speak 事件 (包含上下文)
            WS->>A: 推送 invitation_to_speak (携带最近5条消息)
        else 条件满足 (如: 某AI被连续点名)
            TG->>WS: 发送 invitation_to_speak (附带“你被质疑了”提示)
            WS->>A: 推送 invitation_to_speak + 警告消息
        end

        Note over A: 3. AI席位收到邀请
        A->>AI: 调用模型API (传入上下文 + 专属System Prompt)
        AI-->>A: 返回生成的回复文本

        A->>WS: 发送 reply 消息 (包含席位ID、回复内容)
        WS->>Others: 广播 reply (所有其他AI/观众)
        WS->>TG: 更新该AI的最后发言时间，清除 pending 标志
    end

    opt 观众/上帝干预
        Others->>WS: 发送 god_intervention 指令 (例如 “让豆包立刻反驳GPT”)
        WS->>TG: 转换为紧急邀请
        TG->>WS: 触发对应AI的 invitation_to_speak (附加强制指令)
        WS->>A: 推送带优先级的 invitation
    end
WebSocket 连接
每个AI席位启动时与服务器建立长连接，保持在线状态。

触发器服务 (Trigger Service)

运行一个定时器（如每秒执行一次）。

从 Redis / 内存中读取每个 AI 的 lastActiveTime、pendingAccusations、context 等信息。

根据预设规则（如超时、被点名次数、情绪值阈值）生成 invitation_to_speak 事件。

邀请发言 (invitation_to_speak)

服务器通过 WebSocket 仅向满足条件的单个 AI 推送该事件。

事件负载中包含当前会话的最新消息（如最近5轮对话），以及可选的额外提示（“你被质疑了，请反驳”）。

AI 生成回复

AI 席位前端收到邀请后，调用本地或云端模型 API，传入：

专属 System Prompt（角色设定）

邀请附带的上下文

模型同步或异步返回生成的文本。

广播回复

AI 席位将回复通过 WebSocket 发回服务器。

服务器广播给所有其他 AI 席位和观众端（用于实时显示）。

同时更新触发器服务的状态（如重置该 AI 的 idle 计时器）。

上帝干预 (可选)

观众或裁判席通过 WebSocket 发送 god_intervention 指令。

服务器将其转换为高优先级的邀请，立即触发指定 AI 发言，并可覆盖当前发言顺序。

技术落地建议
WebSocket 库：推荐 Socket.IO（Node.js）或 websockets（Python），自带房间、自动重连。

状态存储：Redis 适合存储实时状态（lastSpeak: {ai_id: timestamp}），触发器服务可以订阅 Redis 的键空间通知。

避免重复邀请：在发送 invitation 后，立即将该 AI 的 pending 标记设为 true，并设置一个短期超时（如10秒）；若该 AI 未回复，再考虑重新邀请或跳过。

模型端适配：在 AI 的 System Prompt 中明确告知 “你会收到【邀请发言】事件，请直接输出你的观点，不要输出动作描述或角色标记”。






