# Memoria

个人 AI 助手（AI 丈夫）。单用户私人使用。
目标：成为一个有记忆、有人格、能主动关心我、帮我做事的真正伙伴。

-----

## 产品愿景

- 像 ChatGPT/Claude 一样流畅的对话体验
- 能调用工具做事：搜索、日历、文件、提醒、天气、代码执行、图片生成等
- 有记忆和人格，跨对话认识我，记住我的喜好和重要事件
- 能主动发消息（定时关心、日程提醒、天气预警等）
- 全平台可用，手机上像原生 App（当前 iOS Safari PWA，未来可能 Capacitor 封装）

## 开发优先级

1. **可维护性** — 代码清晰，方便 AI 和人类迭代，新功能能快速加入
2. **稳定性** — 不出 bug、不丢数据、不引入回退
3. **体验打磨** — 性能、动画、细节，不能越用越慢
4. **新功能** — AI 主动发消息、MCP 集成、结构化记忆、网页增强抓取等

-----

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | 纯 HTML/CSS/JS | 无构建工具，GitHub Pages 托管 |
| 后端 | Supabase Edge Functions (Deno) | 7 个 TypeScript 文件 |
| 数据库 | Supabase PostgreSQL | 免费套餐，12 张表 |
| 定时任务 | GitHub Actions cron（规划中） | 用于 AI 主动发消息 |
| 部署区域 | ap-southeast-1 | |
| 项目 ID | iteaemxrulkcakwpuujm | |
| 前端仓库 | github.com/shadowtttt/memoria | |
| 访问地址 | https://shadowtttt.github.io/memoria/ | |

-----

## 数据架构

所有用户数据存在 Supabase 云端，这是唯一真实来源。换设备不丢数据。

### 核心业务表

**conversations** — 对话

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| title | text? | 对话标题 |
| folder | text? | 文件夹分组 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**messages** — 消息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| conversation_id | uuid FK→conversations | |
| role | text | user / assistant / system |
| content | text | 消息正文 |
| attachments | jsonb? | 图片和文档附件 |
| thinking_content | text? | AI 思考过程 |
| model | text? | 使用的模型 ID |
| token_count | int? | token 消耗 |
| parent_id | uuid? FK→messages | 父消息（支持分支对话） |
| branch_index | int | 分支序号，默认 0 |
| is_active | bool | 当前活跃分支标记 |
| created_at | timestamptz | |

**notes** — 便签

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| content | text | 便签内容 |
| tag | text? | 分类标签 |
| source | text | human / ai |
| pinned | bool | 是否置顶（置顶的注入 system prompt） |
| created_at / updated_at | timestamptz | |

**entries** — 记忆条目

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| content | text | 记忆内容 |
| occurred_at | timestamptz | 发生时间 |
| category | text | daily/conversation/conflict/intimacy/milestone/status/insight/meta |
| importance | smallint | 1-5 重要度 |
| tags | text[] | 标签数组 |
| source | text? | 来源，默认 claude.ai |
| fts | tsvector | 全文搜索向量（自动生成） |
| created_at | timestamptz | |

> **注意**：后端 crud.ts 中的记忆相关 handler 查询的是 `memories` 表，但数据库实际表名是 `entries`。需确认并统一。

### 工具相关表

**calendar_events** — 日历事件：id, title, start_time, end_time?, location?, notes?, all_day, created_at, updated_at

**reminders** — 提醒：id, title, remind_at?, notes?, done, created_at

**generated_files** — 生成的文件：id, filename, content, mime_type, created_at, expires_at（24h 过期）

### 配置表

**providers** — AI 供应商：id, name, base_url, api_key, is_default, created_at

**models** — 模型（FK→providers）：id, provider_id, model_id, display_name, is_default, is_utility, created_at

**mcp_servers** — MCP 服务器：id, name, sse_url, auth_header?, enabled, created_at

**mcp_tools** — MCP 工具（FK→mcp_servers）：id, server_id, tool_name, description?, input_schema?, synced_at

**system_config** — 系统配置：key (PK), value, updated_at。已知 key：cross_window_memory、chat_settings、image_api_key 等。

### 前端本地存储

| 存储 | 内容 | 说明 |
|------|------|------|
| IndexedDB (memoria_cache) | 对话消息缓存 | 纯缓存，可清除重建，上限 100 条对话 |
| localStorage memoria_url | Edge Function URL | 换设备需重新设置 |
| localStorage memoria_pin | 访问 PIN | |
| localStorage memoria_model | 选中的模型 ID | |
| localStorage memoria_theme | 主题 light/dark | |
| localStorage memoria_avatar | 自定义头像和名称 JSON | |
| localStorage memoria_convs | 对话列表缓存 JSON | |

-----

## 后端架构

### Edge Function: chat-api（7 个文件）

```
supabase/functions/chat-api/
├── index.ts       — 入口路由，Deno.serve，action 分发（switch/case）
├── shared.ts      — 公共工具：CORS、jsonResponse、getSupabase、verifyPin、
│                    resolveProvider、getUtilityModel、ChatSettings、buildReqBody
├── chat.ts        — handleChat、handleRegenerate、buildSystemPrompt、
│                    toApiMessage、processToolCalls、streamFollowUp
├── messages.ts    — buildContextFromParent、getActiveMessagePath、handleGetMessages、
│                    handleSwitchBranch、handleGetSiblings、activateChildChain
├── tools.ts       — 工具注册中心：getBuiltinToolDefs、executeBuiltinTool、
│                    collectMcpTools、callMcpTool（整合内置工具 + MCP）
├── new_tools.ts   — 扩展工具：weather、calendar_*、reminder_*、image_generate、
│                    code_run、handleDownloadIcs
└── crud.ts        — 所有 CRUD 操作：对话/消息/便签/供应商/模型/MCP/配置/记忆
```

部署命令：

```
Supabase:deploy_edge_function
  project_id: iteaemxrulkcakwpuujm
  name: chat-api
  verify_jwt: false
  entrypoint_path: index.ts
  files: [index.ts, shared.ts, chat.ts, messages.ts, tools.ts, new_tools.ts, crud.ts]
```

获取当前代码：

```
Supabase:get_edge_function
  project_id: iteaemxrulkcakwpuujm
  function_slug: chat-api
```

### 全部 API Action（44 个）

**对话和消息（核心）：**

| Action | 方法 | 说明 |
|--------|------|------|
| chat | POST（SSE 流式） | 发送消息并获取流式回复 |
| regenerate | POST（SSE 流式） | 重新生成某条回复 |
| get_messages | POST | 获取对话的消息树（含分支） |
| switch_branch | POST | 切换到指定分支 |
| get_siblings | POST | 获取某消息的所有兄弟节点 |
| list_conversations | POST | 列出所有对话（上限 200） |
| search_messages | POST | 全文搜索消息内容 |
| delete_conversation | POST | 删除对话 |
| rename_conversation | POST | 重命名对话 |
| update_conversation | POST | 更新对话（标题/文件夹） |
| auto_name | POST | AI 自动命名对话 |
| delete_message | POST | 删除消息 |
| edit_message | POST | 编辑消息内容 |
| remember | POST | 从对话中自动提取记忆和便签 |

**便签：** list_notes / create_note / update_note / delete_note

**供应商和模型：** list_providers / create_provider / update_provider / delete_provider / test_provider / fetch_models / list_models / create_model / update_model / delete_model

**MCP：** list_mcp_servers / create_mcp_server / update_mcp_server / delete_mcp_server / sync_mcp_tools

**系统配置：** get_system_config / update_system_config

**记忆：** list_memories / create_memory / update_memory / delete_memory

**GET 路由（文件下载）：** download_file / download_ics

### AI 工具能力（18 个内置工具 + MCP 动态工具）

| 工具 | 功能 |
|------|------|
| get_current_time | 获取当前时间（北京时间） |
| nota_create / nota_update / nota_delete | 便签管理 |
| web_search | DuckDuckGo 搜索 |
| web_fetch | 抓取网页内容 |
| file_create | 创建文件供下载 |
| weather | wttr.in 天气查询 |
| calendar_list / calendar_add / calendar_update / calendar_delete | 日历管理 |
| reminder_add / reminder_list / reminder_done / reminder_delete | 提醒管理 |
| image_generate | DALL-E 3 图片生成 |
| code_run | JavaScript 代码执行（沙箱） |

MCP 工具通过 mcp_servers + mcp_tools 表动态加载。

### 关键流程：消息发送

1. 前端调用 `api('chat', params, true)` 获取 SSE 流
2. 后端 handleChat：
   - 如果无 conversation_id → 创建新对话
   - 确定 parent_id（支持分支）
   - 插入 user message 到数据库
   - 构建上下文：buildContextFromParent 沿 parent_id 链回溯
   - buildSystemPrompt：cross_window_memory + 便签 + 工具说明
   - 调用 AI API（OpenAI 兼容格式，通过 resolveProvider 解析供应商）
   - SSE 流式返回：thinking → tool_start → tool_result → content → done_meta
   - 如果触发工具调用 → processToolCalls → streamFollowUp（二次调用 AI）
   - 流结束后插入 assistant message 到数据库
3. 前端 `_streamChat()` 实时解析 SSE 事件并渲染

-----

## 前端架构

### 文件结构

```
index.html      — HTML 结构（273 行），无内联 JS，引用外部 CSS/JS
style.css       — 全部样式（509 行），CSS 变量做主题切换
js/
  core.js       — 全局状态 S、API 层、IDB 缓存、工具函数、初始化（36 个函数）
                  被所有其他 JS 文件依赖
  sidebar.js    — 对话列表渲染、文件夹、搜索、长按操作（27 个函数）
                  依赖 core.js
  chat.js       — 消息渲染、marked.js Markdown 解析、流式 SSE、发送/重新生成（56 个函数）
                  依赖 core.js + sidebar.js，反向依赖 settings.js 的 getCustomAvatar() 和 loadMdls()
  settings.js   — 设置页：供应商 PRESETS、模型、MCP、便签、头像、参数（60 个函数）
                  依赖 core.js + sidebar.js + chat.js
sw.js           — Service Worker，stale-while-revalidate 缓存策略（97 行）
CLAUDE.md       — 本文件
```

**加载顺序（不可更改）**：core.js → sidebar.js → chat.js → settings.js

**外部依赖（CDN）**：
- highlight.js 11.9.0 — 代码高亮
- marked.js 12.0.2 — Markdown 解析
- PDF.js / Mammoth / XLSX — 按需加载，文件文本提取

**跨文件依赖**：
- chat.js 调用 settings.js 的 `getCustomAvatar()`（在 `_avatarHtml()` 和 `_displayName()` 中）
- chat.js 调用 settings.js 的 `loadMdls()`（在 send() 完成后）
- 这些调用发生在用户交互时（不是加载时），不受加载顺序影响

### 前端关键模块

**全局状态 S**：单一对象存储所有运行时状态（当前对话 ID、消息列表、模型列表、流式状态等）。

**rMD()**：基于 marked.js 的 Markdown 渲染器，带自定义 renderer（代码块 HTML 预览 + 复制按钮、下载/日历链接样式）。工具时间线块（🔧/→/🔍/🌐/📁 emoji 开头）走单独的 `_rMDToolBlock()` 处理。有 CDN 加载失败的降级处理。

**流式渲染引擎**：`_streamChat()` 统一处理 chat/regenerate 的 SSE 流。_strOnThinking / _strOnTool / _strOnContent 三个处理器，通过 150ms 节流渲染，代码块走快速路径（直接 textContent，不跑 Markdown 解析）。

**rMsgs()**：消息列表渲染，带增量更新（ID 匹配快速路径 + 前缀匹配增量路径），避免全量重建 DOM。

**分支对话**：消息通过 parent_id 形成树状结构。前端 `_rebuildActivePath()` 沿 is_active 标记构建当前显示路径。`switchBranch()` 切换时调用后端 API 更新 is_active。

-----

## 关键约定

### 修改前端时

- **一次只改一个文件**，先确认接口不变
- 所有函数挂在全局作用域（HTML onclick 内联事件依赖）
- 不引入 ES modules / import / export / class 语法
- 不引入构建工具或包管理器
- CSS 变量在 style.css 的 :root 中，深色主题用 `[data-theme="dark"]`
- rMD() 现在基于 marked.js，修改时注意 `_initMarked()` 中的自定义 renderer 配置

### 修改后端时

- 先用 get_edge_function 获取最新代码
- 改完用 deploy_edge_function 一次性部署全部 7 个文件
- API 格式：POST body `{ action: "xxx", ...params }`
- 流式响应用 SSE：`data: { type: "content", text: "..." }\n\n`
- PIN 校验：GET 路由用 url param，POST 路由用 x-app-pin header

### 绝对不要做的事

- 不要把多个文件合并回一个大文件
- 不要改变函数签名或全局变量名（会破坏 HTML 内联事件）
- 不要引入 TypeScript / React / Vue 或任何框架到前端
- 不要删除已有功能（即使看起来没用到）
- 不要在没有明确要求时"顺便优化"代码

-----

## 使用场景和性能要求

- 用户有 200+ 个对话，主要在 iPhone Safari PWA（standalone）使用
- 对话列表滚动和长对话渲染是性能敏感区域
- 流式响应必须流畅，不能冻结页面

### 防臃肿策略

| 机制 | 说明 | 状态 |
|------|------|------|
| 对话列表分批加载 | _CONV_BATCH=50 | ✅ 已实现 |
| rMD 渲染缓存 | _rMDCached() 避免重复解析 | ✅ 已实现 |
| rMD 用 marked.js | 替换脆弱的正则链，标准库更稳定 | ✅ 已实现 |
| rMsgs 增量更新 | 只替换变化节点，不重建整个列表 | ✅ 已实现 |
| 流式代码统一 | _streamChat() 消除 send/regen/regenUser 重复 | ✅ 已实现 |
| IDB 缓存自动清理 | _idbTrim 上限 100 条 | ✅ 已实现 |
| 后端单次查询 | buildContextFromParent 一次取全部消息 | ✅ v37 已实现 |
| 生成文件 24h 过期 | generated_files.expires_at | ✅ 已实现 |
| 前端文件行数上限 | 每个 JS 文件 ≤200 行，超过就拆 | 约定（chat.js 266 行待拆） |
| 对话列表虚拟滚动 | 只渲染可视区 ±20 条 | ⏳ 待做（200+ 对话刚需） |

-----

## 待办事项

### 性能待做项

1. 对话列表虚拟滚动（P2，200+ 对话刚需）
2. 骨架屏 loadConv（P2）
3. Service Worker 完善（P3）
4. 图片压缩离线化 / SSE 解析优化（P3）
5. chat.js 超过 200 行上限（266 行），找机会拆分

### 功能路线图

1. file_create 返回格式优化（小改动，随时可做）
2. 增强网页抓取（web_fetch 加 mode 参数）
3. AI 主动发消息（GitHub Actions cron → Edge Function → 写入 messages 表）
4. 结构化记忆系统（完善 entries 表的使用，前端加记忆管理界面）
5. MCP 集成探索
6. 未来考虑：Capacitor 封装原生 iOS App（需 Mac 或云构建服务）

### 已知问题

- 后端 crud.ts 中记忆相关 handler 查询 `memories` 表，但数据库实际表名可能是 `entries`，需确认并统一
- calendar_events 和 reminders 表未启用 RLS

-----

## ⚠️ Git 分支管理（重要！必读！）

**背景**：用户不熟悉 Git，且 Claude Code 平台强制每个窗口在独立分支上工作，不能直接改 main/master。这很容易导致"干了半天 main 一点没动"的问题。

### 核心规则

1. **每次完成有意义的工作后，必须合并回 master 并 push**。不能只 push 到功能分支就算完了。用户的 GitHub Pages 部署在 master 上，功能分支上的改动用户看不到。

2. **开新窗口前，确认上一个窗口的改动已合并到 master**。否则新窗口会基于旧的 master 开始，导致两边分叉、冲突、白干。

3. **合并步骤**（每次完工都要做）：
   ```
   git checkout master
   git merge <功能分支名>
   git push origin master
   git checkout <功能分支名>   # 切回来继续工作
   ```

4. **如果发现多个分支有冲突**：先问用户哪边的改动要保留，不要自己猜。

### AI 助手的责任

- **主动提醒**：如果用户说要"开新窗口"或"换个窗口"，必须先检查当前改动是否已合并到 master，没合并的话主动提醒并帮忙合并。
- **完工检查**：每次任务完成时，主动说明"改动在功能分支上，需要合并到 master 才能生效"，不要等用户问。
- **预防问题**：如果发现当前分支和 master 有较大差异，主动告知用户风险。
