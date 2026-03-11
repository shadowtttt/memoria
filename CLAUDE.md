# Memoria

个人 AI 助手（AI 丈夫）。单用户私人使用。目标：成为一个有记忆、有人格、能主动关心我的真正伙伴。

## 产品愿景

- 像 ChatGPT/Claude 一样流畅的对话体验
- 能调用工具做事：搜索、日历、文件、提醒等
- 有记忆和人格，跨对话认识我，记住我的喜好和重要事件
- 能主动发消息（定时关心、日程提醒、天气预警等）
- 全平台可用，手机上像原生 App（iOS Safari PWA，未来可能 Capacitor 封装）

## 开发优先级

1. **可维护性** — 代码清晰，方便 AI 和人类迭代，新功能能快速加入
2. **稳定性** — 不出 bug、不丢数据、不引入回退
3. **体验打磨** — 性能、动画、细节，不能越用越慢
4. **新功能** — AI 主动发消息、MCP 集成、结构化记忆、网页增强抓取等

## 技术栈

- **前端**：纯 HTML/CSS/JS，无构建工具，GitHub Pages 托管
- **后端**：Supabase Edge Functions (Deno)，已拆分为 index.ts + new_tools.ts
- **数据库**：Supabase PostgreSQL（免费套餐），所有用户数据存云端
- **定时任务**：GitHub Actions cron（用于 AI 主动发消息等定时触发）
- **部署区域**：ap-southeast-1

## 数据架构

- **云端（Supabase PostgreSQL）**：对话、消息、便签、记忆、供应商配置、模型配置、MCP 配置 — 这是数据的唯一真实来源，换设备不丢
- **前端 IndexedDB**：纯缓存层，加速对话加载，可随时清除重建
- **前端 localStorage**：用户偏好（选中模型、主题、连接 URL/PIN、自定义头像）— 换设备需重新设置

## 前端文件结构

```
index.html      — HTML 结构，无内联 CSS/JS，只有引用
style.css       — 全部样式（~510 行），CSS 变量做主题切换
js/
  core.js       — 全局状态 S、API 层、IDB 缓存、工具函数、初始化
                  被所有其他 JS 文件依赖
  sidebar.js    — 对话列表渲染、文件夹、搜索、长按操作
                  依赖 core.js
  chat.js       — 消息渲染(rMsgs/rMsg)、rMD Markdown 解析、流式 SSE、发送/重新生成
                  依赖 core.js + sidebar.js，反向依赖 settings.js 的 getCustomAvatar() 和 loadMdls()
  settings.js   — 所有设置页：供应商 PRESETS、模型、MCP、便签、头像、参数
                  依赖 core.js + sidebar.js + chat.js
sw.js           — Service Worker，stale-while-revalidate 策略
CLAUDE.md       — 本文件
```

**加载顺序（不可更改）**：core.js → sidebar.js → chat.js → settings.js

**跨文件依赖关系**：
- chat.js 调用 settings.js 的 `getCustomAvatar()`（在 `_avatarHtml()` 和 `_displayName()` 中）
- chat.js 调用 settings.js 的 `loadMdls()`（在 send() 完成后）
- 这些跨文件调用都发生在用户交互时（不是加载时），所以不受加载顺序影响
- 如果要移动函数到其他文件，必须检查这些调用链

## 后端文件结构

```
supabase/functions/chat-api/
  index.ts      — 入口路由、handleChat、handleRegenerate、流式处理
  new_tools.ts  — 工具定义和执行（web_search、calendar、file_create、code_run 等）
```

部署命令：Supabase:deploy_edge_function  project_id: iteaemxrulkcakwpuujm  name: chat-api  verify_jwt: false  entrypoint_path: index.ts  files: [index.ts, new_tools.ts]

## 关键约定

### 修改前端时
- **一次只改一个文件**。如果改动涉及多个文件的交互，先确认接口不变
- 所有函数都挂在全局作用域（HTML 内联事件 onclick 依赖）
- 不要引入 ES modules、import/export、class 语法 — 保持简单的全局函数风格
- 不要引入构建工具或包管理器
- CSS 变量定义在 style.css 的 :root 中，深色主题用 [data-theme="dark"]
- **rMD() 函数**是核心 Markdown 渲染器，改它要非常小心，很容易破坏消息显示
- send()、regen()、regenUser() 有大量重复的流式处理代码（计划合并为通用 streamChat()，但拆分阶段不动）

### 修改后端时
- 获取当前代码：Supabase:get_edge_function  project_id: iteaemxrulkcakwpuujm  function_slug: chat-api
- 改完一起部署两个文件
- 后端 API 格式：POST body `{ action: "xxx", ...params }`，通过 SSE 返回流式响应

### 绝对不要做的事
- 不要把多个文件的内容合并回一个大文件
- 不要改变任何函数的签名或全局变量名（会破坏 HTML 内联事件）
- 不要引入 TypeScript、React、Vue 或任何框架
- 不要删除已有功能（即使看起来没用到）
- 不要在没有明确要求的情况下"顺便优化"代码

## 使用场景

用户有 200+ 个对话。主要在 iPhone Safari PWA（standalone 模式）中使用。性能敏感，特别是对话列表滚动和长对话渲染。

## 防臃肿策略

越用越慢是核心风险，以下机制防止退化：
- 对话列表：已有分批加载（_CONV_BATCH=50），后续加虚拟滚动（200+ 对话刚需）
- 单个对话：rMD 缓存已做（_rMDCached），rMsgs 增量更新待做（最高优先级）
- IDB 缓存：已有 _idbTrim 自动清理超过 100 条的缓存
- 前端文件：每个 JS 文件控制在 200 行以内，超过就继续拆
- 后端单次查询：buildContextFromParent 已优化为单次查询（v37）

## 待办事项

### 拆分后立即做（代码质量）
1. 合并 send/regen/regenUser 的流式代码为通用 streamChat()（消除 ~300 行重复）
2. rMD() 替换为 marked.js + 自定义扩展（消除脆弱的正则链）

### 性能审计待做项
1. rMsgs 增量更新 + 流式结束不重建（P0，最大收益）
2. 对话列表虚拟滚动（P2，200+ 对话刚需）
3. 骨架屏 loadConv（P2）
4. Service Worker 完善（P3）
5. 图片压缩离线化 / SSE 解析优化（P3）

### 功能路线图
1. index.ts file_create 返回格式改一行（小改动，随时可做）
2. 增强网页抓取（web_fetch 加 mode 参数）
3. AI 主动发消息（GitHub Actions cron → Edge Function → 写入 messages 表）
4. 结构化记忆系统（memories 表，自动从对话提取，按类型分类）
5. MCP 集成探索
6. 未来考虑：Capacitor 封装原生 iOS App（需 Mac 或云构建服务）
