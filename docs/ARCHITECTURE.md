# 架构设计文档

本文档描述「英语大师 English360」的架构、数据模型、核心引擎设计与已知取舍。
目标：**学习效果 > 功能数量 > UI 炫技**；本地能力优先，AI 作为增强层；
所有关键功能真实可运行，不允许“假功能”。

## 1. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | 原生 JavaScript（无构建） | 纯静态站点直接部署 GitHub Pages；零依赖、零构建失败、离线友好 |
| 语言 | ES2017+（模板字符串/async） | 现代浏览器（iOS Safari 14+）全部支持 |
| 存储 | localStorage + 导出/导入 JSON | 见「数据层」；schema 带版本号，可平滑迁移 IndexedDB |
| PWA | manifest + Service Worker + PNG 图标 | 可安装、standalone、离线核心学习 |
| 语音 | Web Speech API（TTS + 可选识别） | iOS Safari 兼容（所有发音由用户点击触发） |
| AI | OpenAI 兼容 HTTP 接口（Provider 抽象） | 不绑定单一厂商；Key 仅存本地 |

## 2. 模块结构

```
index.html ── 路由容器 / 设置弹窗
├── js/tts.js          语音合成（点击触发，iOS 兼容）
├── js/progress.js     进度存储 / 导入导出 / 连续天数
├── js/app.js          路由 / 学习路径 / 首页 / 进度页 / 设置
├── js/srs.js          ★ 间隔重复引擎
├── js/student.js      ★ 学生模型（10 技能维度）
├── js/errors.js       ★ 错误银行
├── js/planner.js      ★ 每日计划器 + 自适应设置
├── js/achievements.js ★ XP / 成就引擎
├── js/phonics.js      自然拼读
├── js/vocabulary.js   词汇（学习/翻卡/测验/搜索/复习）
├── js/grammar.js      语法
├── js/listening.js    听力
├── js/speaking.js     口语
├── js/reading.js      阅读
├── js/media.js        音视频
├── js/writing.js      写作
├── js/test.js         自适应测试 + 毕业测试 + 错题强化
├── js/dictionary.js   查询中心
└── js/rag.js          RAG 智能问答 + AI Provider
data/*.json            内置课程数据（词汇 55k / 语法 87+ / 拼读 / 对话 / 文章 / 路径）
sw.js                  Service Worker（离线缓存）
manifest.json          PWA manifest
```

## 3. 数据层

### 3.1 localStorage keys

| key | 内容 | 大小 |
|---|---|---|
| `englishMaster_progress` | 进度 + 学生模型 + 错误银行 + 成就 + XP + 学习历史 | 小 |
| `englishMaster_settings` | 语音/主题/AI/自适应设置 | 小 |
| `englishMaster_srs` | SRS 卡片表 `{schemaVersion, cards:{[word]:{ease,interval,reps,lapses,step,dueAt,...}}}` | 每词 ~150B |
| `englishMaster_*` 其他 | 各模块临时状态 | 小 |

`progress` 结构（节选）：
```jsonc
{
  "version": 2, "level": 0, "pathStep": 0, "completedSteps": [],
  "streak": 0, "totalStudyTime": 0, "xp": 0,
  "student": { "schemaVersion": 1, "skills": { "vocabulary": {"score":0,"n":0,"recent":[]}, ... } },
  "errors": { "schemaVersion": 1, "items": { "vocabulary:table": {"count":2,"resolved":false,...} } },
  "achievements": [], "weaknesses": {}, "graduation": {}, "dayHistory": []
}
```

### 3.2 导出 / 导入

导出文件 = `{schemaVersion, progress, settings, srs, exportedAt}`，可跨设备恢复全部学习状态。

### 3.3 为什么是 localStorage 而不是 IndexedDB？

- 当前架构无构建、无依赖，localStorage 零学习成本、API 同步简单；
- SRS 每卡约 150 字节，1 万词约 1.5MB，远低于 5MB 上限；
- 数据 schema 全部带版本号，未来迁移 IndexedDB（如 Dexie）只需替换读写层，模块代码不变。

## 4. 核心引擎

### 4.1 SRS 间隔重复（SM-2 变体）

- **学习步**：新词 10 分钟后 → 1 天后，答对（grade≥2）推进，答错回到第 0 步；
- **复习态**：grade 0=遗忘（interval 重置 1 天，ease-0.2）/ 1=困难（×1.2）/ 2=认识（×ease）/ 3=简单（×ease×1.3）；
- ease 范围 [1.3, 3.0]，interval 封顶 180 天；
- 每日到期词进入「复习」队列与「今日计划 P1」。

### 4.2 学生模型

每个技能：`score`（加权移动平均，新样本权重 ≤0.5）、`n`（样本数）、`recent`（最近 20 次窗口，用于趋势）。
数据来源（真实表现，非打卡）：

| 技能 | 来源 |
|---|---|
| vocabulary | 词汇测验正确率 / SRS 复习正确率 |
| grammar | 语法练习正确率 / 语法测试 |
| listening | 听力测验正确率 / 音视频课 |
| speaking | 口语跟读匹配率 / 情景对话完成 |
| reading | 阅读测验得分 |
| writing | 造句相似度 / 短文与自由写作 |
| pronunciation / fluency | 跟读得分 |
| naturalness | 造句 / 对话 |
| retention | SRS 成熟词占比 |

### 4.3 错误银行

`add(category, item)` 记录频次/首末次时间/连续答错；`correct()` 连续答对 ≥2 次标记已纠正。
未纠正错误进入「错题强化」测试（按严重度排序，复用测试模块题目生成器）。

### 4.4 每日计划器

```
预算 = 设置分钟数 × 强度系数 (0.6/1.0/1.4/1.8)
P1 SRS 到期复习（≤40% 预算）
P2 当前路径任务（25%）
P3 弱项技能训练（20%，自动模式且有弱项时）
P4 听力/阅读输入（15%）
P5 口语/写作输出（10%）
```
时间不足时系统自动优先 P1/P2，不会产生“没完成 4 小时”的虚假失败感。

### 4.5 XP / 成就

XP 只奖励真实行为：学词 2、复习 1-3、测验答对 3、听力 15、阅读 15、口语 10、写作 20、拼读 2、语法 5、测试 15、打卡 5、完成一课 20。
18 个成就全部由真实里程碑触发（词数/拼读/语法/听读说写次数/连续天数/复习次数/测试/毕业），每成就 +50 XP。

## 5. PWA 设计

- **manifest**：`start_url: "./"`、`display: standalone`、PNG 图标（192/512/maskable）+ `apple-touch-icon`（iOS 专用）；
- **Service Worker**（`sw.js`）：
  - 安装时预缓存应用外壳（HTML/CSS/JS/icons/manifest）；
  - 导航请求 network-first（绕过 HTTP 缓存）保证更新，离线回退缓存 index.html；
  - 数据/静态资源 cache-first + 后台更新：首次访问后离线可用；
  - 缓存名带版本号（`english-master-v2`），升级时自动清理旧缓存；
- **iOS 兼容**：
  - 所有 TTS 由用户点击触发（iOS 自动播放限制）；
  - `-webkit-tap-highlight-color`、`100dvh`、safe-area 由 CSS 处理；
  - 语音识别不支持时自动降级（口语自评）。

## 6. AI Provider 层

`js/rag.js` 内建 Provider 预设（Agnes/OpenAI/DeepSeek/Qwen/Doubao/SiliconFlow/Azure/自定义），
统一走 OpenAI 兼容 `/chat/completions`。API Key 仅存 localStorage，**不进入代码/静态文件**。

安全提示：纯前端直连第三方 API 时，Key 暴露在用户浏览器（仅影响用户自己）。
如需防滥用（多人共用站点），应增加后端代理（见「未来方向」），Key 存服务端。

## 7. 自适应设置（用户可控）

| 设置 | 取值 | 作用 |
|---|---|---|
| 每日分钟数 | 30/60/90/120/180/240 | 计划器预算 |
| 自适应模式 | auto / manual | 是否自动安排弱项训练 |
| 强度 | light/standard/intensive/extreme | 计划量 ×0.6~1.8，测试题数 8~14 |
| 严格度 | relaxed/standard/strict/extreme | “掌握”的最低评分（SRS grade 1~3） |

系统**不偷偷修改**用户设置；设置与目标冲突时会提示影响。

## 8. 已知限制与未来方向

| 限制 | 影响 | 方案/替代 |
|---|---|---|
| iOS 无语音识别 | 口语无法自动评分 | 降级自评；后续接入语音上传到云端评测 |
| 19.5MB vocabulary.json | 首次加载慢 | SW 缓存后离线秒开；可拆分为按级别懒加载 |
| localStorage 5MB | 极端词量下可能紧张 | 数据带 schema，迁移 IndexedDB 即可 |
| 无后端 | 无账号/云同步/AI 代理 | 预留 Sync Adapter + 可选安全代理（Supabase/Firebase/自建） |
| 评估多用已学材料 | 迁移能力验证不足 | 里程碑评估（Day30/90/180/270/360）逐步加入 unseen 材料 |

## 9. 开发与测试

- 无构建/无 npm：`python3 -m http.server 8000` 即可；
- `tools/validate_json.py` 校验数据文件；
- `tools/audit_all.py` 内容审计（词汇/语法覆盖）；
- 每次改动后人工走查：首页计划 → 词汇复习 → 测试错题强化 → 进度页 → 设置。