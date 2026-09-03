/* ===== Daily Planner 每日计划器 =====
 * 根据时间预算 + 用户设置 + 学生模型, 生成每天的优先级计划:
 *
 *   1. 关键 SRS 复习 (到期词) —— 最高优先, 不可跳过
 *   2. 当前路径任务 (今日一课)
 *   3. 弱项技能训练 (学生模型中最弱的技能)
 *   4. 高价值输入 (听力/阅读)
 *   5. 高价值输出 (口语/写作)
 *
 * 时间预算: 30/60/90/120/180/240 分钟 (默认 240, 可自定义)
 * 强度 (intensity) 调节任务量与时间分配:
 *   light 0.6x / standard 1.0x / intensive 1.4x / extreme 1.8x
 * 严格度 (strictness) 调节难度判定 (relaxed~extreme)
 *
 * 存储: settings (localStorage), 与进度分开 (可独立备份)。
 */
window.EM = window.EM || {};

EM.planner = {
  INTENSITY_OPTIONS: [
    { id: 'light',     label: '轻松',  mult: 0.6, desc: '每天 20-30 分钟, 保持节奏' },
    { id: 'standard',  label: '标准',  mult: 1.0, desc: '推荐, 平衡输入与输出' },
    { id: 'intensive', label: '强化',  mult: 1.4, desc: '增加训练量与难度' },
    { id: 'extreme',   label: '极限',  mult: 1.8, desc: '高强度冲刺 (注意疲劳)' }
  ],

  STRICTNESS_OPTIONS: [
    { id: 'relaxed',  label: '宽松',  desc: '答对就算掌握, 快速推进' },
    { id: 'standard', label: '标准',  desc: '需要答对且能回忆' },
    { id: 'strict',   label: '严格',  desc: '多次答对才算掌握, 复习更多' },
    { id: 'extreme',  label: '极严',  desc: '要求完全巩固, 复习负担最重' }
  ],

  // 当前设置 (带默认值)
  settings() {
    const s = EM.progress.getSettings();
    return {
      dailyMinutes: s.dailyMinutes || 240,
      adaptiveMode: s.adaptiveMode || 'auto',
      intensity: s.intensity || 'standard',
      strictness: s.strictness || 'standard'
    };
  },

  intensity() {
    return this.INTENSITY_OPTIONS.find(o => o.id === this.settings().intensity) || this.INTENSITY_OPTIONS[1];
  },

  strictness() {
    return this.STRICTNESS_OPTIONS.find(o => o.id === this.settings().strictness) || this.STRICTNESS_OPTIONS[1];
  },

  // 建议时间分配 (分钟, 依据预算×强度)
  allocation() {
    const s = this.settings();
    const mult = this.intensity().mult;
    let budget = Math.round(s.dailyMinutes * mult);

    const srsStats = (typeof EM.srs !== 'undefined') ? EM.srs.stats() : { due: 0, dueSoon: 0 };
    const dueCount = srsStats.due + (srsStats.dueSoon || 0);

    // 1. SRS: 每张到期卡约 0.5 分钟, 上限 40% 预算
    const srsMin = Math.min(Math.round(dueCount * 0.5), Math.round(budget * 0.4));
    // 2. 路径任务: 25%
    const pathMin = Math.max(10, Math.round(budget * 0.25));
    // 3. 弱项: 20% (无弱项时归入输入)
    const weakMin = Math.round(budget * 0.20);
    // 4. 输入 (听/读): 15%
    const inputMin = Math.max(5, Math.round(budget * 0.15));
    // 5. 输出 (说/写): 10%
    const outputMin = Math.max(5, Math.round(budget * 0.10));

    const total = srsMin + pathMin + weakMin + inputMin + outputMin;
    return { budget, dueCount, srsMin, pathMin, weakMin, inputMin, outputMin, total };
  },

  // 生成今日计划块 (供首页渲染)
  today() {
    const s = this.settings();
    const alloc = this.allocation();
    const blocks = [];

    // 1. 关键 SRS 复习
    if (alloc.dueCount > 0) {
      blocks.push({
        id: 'srs', icon: '🧠', title: `复习 ${alloc.dueCount} 个到期词`,
        desc: '间隔重复 · 巩固长期记忆', minutes: alloc.srsMin,
        priority: 1, module: 'vocabulary', action: 'review'
      });
    } else {
      blocks.push({
        id: 'srs', icon: '🧠', title: '今日无到期复习词',
        desc: '记忆稳固 · 可继续学新词', minutes: 0,
        priority: 1, module: 'vocabulary', action: 'review'
      });
    }

    // 2. 当前路径任务
    const step = EM.path.currentStep();
    if (step) {
      blocks.push({
        id: 'path', icon: '📍', title: step.title,
        desc: `第 ${step.step + 1} 课 · ${EM.LEVELS[step.level].cn}`,
        minutes: alloc.pathMin, priority: 2,
        module: step.module, submodule: step.submodule, action: 'start'
      });
    }

    // 3. 弱项技能
    const weak = EM.student.weakest(40, 2);
    if (weak.length && s.adaptiveMode === 'auto') {
      const w = weak[0];
      blocks.push({
        id: 'weak', icon: '⚠️', title: `强化弱项: ${w.label}`,
        desc: `当前能力 ${w.score}/100 · 针对性训练`,
        minutes: alloc.weakMin, priority: 3, module: 'test', action: 'weak'
      });
    }

    // 4. 输入
    blocks.push({
      id: 'input', icon: '👂', title: '听力 / 阅读输入',
      desc: '真实材料沉浸 · 提升理解速度', minutes: alloc.inputMin,
      priority: 4, module: 'listening', action: 'input'
    });

    // 5. 输出
    blocks.push({
      id: 'output', icon: '🗣️', title: '口语 / 写作输出',
      desc: '主动使用 · 把知识变成能力', minutes: alloc.outputMin,
      priority: 5, module: 'speaking', action: 'output'
    });

    return { settings: s, alloc, blocks, date: new Date().toISOString().slice(0, 10) };
  },

  // 计划块点击动作
  run(block) {
    if (!block || block.minutes === 0) return;
    if (block.id === 'srs') {
      EM.router.navigate('vocabulary');
      setTimeout(() => { if (EM.vocabulary && EM.vocabulary.startReview) EM.vocabulary.startReview(); }, 600);
    } else if (block.id === 'path') {
      EM.router.navigateWithSubmodule(block.module, block.submodule);
    } else if (block.id === 'weak') {
      EM.router.navigate('test');
    } else if (block.id === 'input') {
      // 输入: 优先听, 也可读
      EM.router.navigate('listening');
    } else if (block.id === 'output') {
      EM.router.navigate('speaking');
    }
  },

  // 严格度 → 评分阈值 (SRS/测验判定"掌握"的最低等级)
  passGrade() {
    const id = this.strictness().id;
    return id === 'relaxed' ? 1 : (id === 'extreme' ? 3 : 2);
  }
};