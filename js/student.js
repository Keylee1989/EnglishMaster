/* ===== Student Model 学生模型 =====
 * 持续记录用户各项真实能力, 而非只记"正确率"或"完成数"。
 *
 * 技能维度 (每项 0-100):
 *   vocabulary / grammar / listening / speaking / reading / writing
 *   pronunciation / fluency / naturalness / retention
 *
 * 每个技能维护:
 *   score   : 加权移动平均能力分 (0-100)
 *   n       : 样本数 (≥5 后分数才可信)
 *   recent  : 最近 20 次表现的窗口, 用于观察趋势 (上升/下降)
 *
 * 数据存入 progress.student (随进度一起导出/导入), schemaVersion=1。
 * 更新方式: 各模块完成训练后调用 EM.student.record(skill, score, weight)。
 */
window.EM = window.EM || {};

EM.student = {
  SKILLS: [
    { key: 'vocabulary',     label: '词汇',      icon: '📚' },
    { key: 'grammar',        label: '语法',      icon: '📖' },
    { key: 'listening',      label: '听力',      icon: '👂' },
    { key: 'speaking',       label: '口语',      icon: '🗣️' },
    { key: 'reading',        label: '阅读',      icon: '📰' },
    { key: 'writing',        label: '写作',      icon: '✍️' },
    { key: 'pronunciation',  label: '发音',      icon: '🔤' },
    { key: 'fluency',        label: '流利度',    icon: '💨' },
    { key: 'naturalness',    label: '自然度',    icon: '💬' },
    { key: 'retention',      label: '记忆保持',  icon: '🧠' }
  ],

  defaultData() {
    const s = {};
    for (const sk of this.SKILLS) s[sk.key] = { score: 0, n: 0, recent: [] };
    return { schemaVersion: 1, updatedAt: Date.now(), skills: s };
  },

  _get() {
    const p = EM.progress.get();
    if (!p.student || !p.student.skills) {
      p.student = this.defaultData();
    }
    return p.student;
  },

  // 记录一次能力观测: score 0-100, weight 影响移动平均的强度
  record(skill, score, weight = 1) {
    const p = EM.progress.get();
    if (!p.student || !p.student.skills) p.student = this.defaultData();
    const sm = p.student;
    if (!sm.skills[skill]) sm.skills[skill] = { score: 0, n: 0, recent: [] };
    const s = sm.skills[skill];
    score = Math.max(0, Math.min(100, Math.round(score)));

    // 加权移动平均: 新样本权重 weight, 旧均值权重 (1 - weight)
    const alpha = Math.min(0.5, weight / 10);
    if (s.n === 0) s.score = score;
    else s.score = Math.round(s.score * (1 - alpha) + score * alpha);
    s.n++;
    s.recent.push(score);
    if (s.recent.length > 20) s.recent.shift();

    sm.updatedAt = Date.now();
    EM.progress.save(p);
    return s;
  },

  // 批量记录 (一个训练可能同时影响多个技能)
  recordMany(entries) {
    for (const e of entries) this.record(e.skill, e.score, e.weight || 1);
  },

  getSkill(key) {
    const s = this._get().skills[key];
    return s || { score: 0, n: 0, recent: [] };
  },

  all() {
    const sm = this._get();
    return this.SKILLS.map(sk => ({
      key: sk.key, label: sk.label, icon: sk.icon,
      ...sm.skills[sk.key] || { score: 0, n: 0, recent: [] }
    }));
  },

  // 综合能力分 (全部技能均值; 至少 3 个技能有样本才可信)
  overall() {
    const all = this.all().filter(s => s.n > 0);
    if (!all.length) return { score: 0, n: 0, reliable: false };
    const mean = Math.round(all.reduce((a, s) => a + s.score, 0) / all.length);
    const reliable = all.length >= 3 && all.reduce((a, s) => a + s.n, 0) >= 10;
    return { score: mean, n: all.length, reliable };
  },

  // 弱项: 有样本且分数低于阈值
  weakest(threshold = 40, limit = 3) {
    return this.all()
      .filter(s => s.n >= 2 && s.score <= threshold)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  },

  // 最强项
  strongest(limit = 3) {
    return this.all().filter(s => s.n >= 2).sort((a, b) => b.score - a.score).slice(0, limit);
  },

  // 趋势: 最近5个样本均值 vs 之前
  trend(key) {
    const r = this.getSkill(key).recent || [];
    if (r.length < 6) return { dir: 'stable', delta: 0 };
    const recent = r.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const before = r.slice(0, -5).reduce((a, b) => a + b, 0) / 5;
    const delta = Math.round(recent - before);
    return { dir: delta > 3 ? 'up' : (delta < -3 ? 'down' : 'stable'), delta };
  },

  // CEFR 等级 (由综合分推算; 内部连续分 + 外部等级标签)
  level() {
    const o = this.overall();
    const thresholds = [
      { min: 85, code: 'C2', cn: '精通' },
      { min: 70, code: 'C1', cn: '高级' },
      { min: 55, code: 'B2', cn: '中高级' },
      { min: 40, code: 'B1', cn: '中级' },
      { min: 25, code: 'A2', cn: '初级' },
      { min: 10, code: 'A1', cn: '入门' },
      { min: 0, code: 'Pre-A1', cn: '零基础' }
    ];
    const lv = thresholds.find(t => o.score >= t.min) || thresholds[thresholds.length - 1];
    return { ...lv, score: o.score, reliable: o.reliable };
  },

  // 能力雷达数据 (home/progress 图表用)
  radarData() {
    return this.all().map(s => ({ label: s.label, icon: s.icon, score: s.score, n: s.n }));
  }
};