/* ===== 进度管理模块 (LocalStorage + 跨设备导入导出) ===== */
window.EM = window.EM || {};
EM.progress = {
  KEY: 'englishMaster_progress',
  SETTINGS_KEY: 'englishMaster_settings',

  // 默认进度结构
  defaultData() {
    return {
      version: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // 当前级别 L0-L5(对应CEFR Pre-A1到C2)
      level: 0,
      levelName: '零基础',
      // 强制引导式学习路径状态
      pathStep: 0, // 当前所在步骤(0-45)
      completedSteps: [], // 已完成步骤号数组
      // 连续学习天数
      streak: 0,
      lastStudyDate: null,
      totalStudyTime: 0, // 秒
      // 各模块进度
      modules: {
        phonics: { mastered: [], current: 0, score: 0 },
        vocabulary: { learned: [], current: 0, score: 0, reviews: {} },
        grammar: { mastered: [], current: 0, score: 0 },
        listening: { completed: [], score: 0 },
        speaking: { completed: [], score: 0 },
        reading: { completed: [], score: 0 },
        writing: { completed: [], score: 0 },
        media: { completed: [], score: 0 },
        test: { history: [], currentLevel: 0 },
        rag: { queryCount: 0 }
      },
      // 弱项记录(用于自适应)
      weaknesses: { phonics: [], vocabulary: [], grammar: [], listening: [], reading: [], speaking: [], writing: [] },
      // 毕业测试
      graduation: { passed: false, date: null, scores: {} },
      // 成就
      achievements: [],
      // XP 经验值
      xp: 0,
      xpLog: [],
      // 学生模型(能力分) / 错误银行 (惰性初始化)
      student: null,
      errors: null,
      // 学习历史 (按天聚合, 供进度页曲线)
      dayHistory: []
    };
  },

  get() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaultData();
      const data = JSON.parse(raw);
      // 合并缺失字段(向前兼容)
      return this._merge(this.defaultData(), data);
    } catch (e) {
      console.error('进度读取失败:', e);
      return this.defaultData();
    }
  },

  save(data) {
    data.updatedAt = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.error('进度保存失败:', e);
    }
  },

  update(fn) {
    const data = this.get();
    fn(data);
    this.save(data);
    return data;
  },

  getSettings() {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  saveSettings(s) {
    const cur = this.getSettings();
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify({ ...cur, ...s }));
  },

  // 跨设备: 导出 (进度 + 设置 + SRS 复习数据)
  export() {
    const data = this.get();
    const settings = this.getSettings();
    const srs = (typeof EM.srs !== 'undefined') ? EM.srs.load() : null;
    const blob = new Blob([JSON.stringify({
      schemaVersion: 2,
      progress: data,
      settings,
      srs,
      exportedAt: new Date().toISOString()
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-master-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // 跨设备: 导入
  import(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const obj = JSON.parse(e.target.result);
          if (obj.progress) {
            this.save(this._merge(this.defaultData(), obj.progress));
            if (obj.settings) this.saveSettings(obj.settings);
            // 恢复 SRS 复习数据
            if (obj.srs && obj.srs.cards && typeof EM.srs !== 'undefined') {
              try { localStorage.setItem(EM.srs.KEY, JSON.stringify(obj.srs)); } catch (err2) { console.warn('SRS 导入失败:', err2); }
            }
            resolve(true);
          } else if (obj.version) {
            // 兼容旧格式
            this.save(this._merge(this.defaultData(), obj));
            resolve(true);
          } else {
            reject(new Error('无效的进度文件'));
          }
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  },

  reset() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(this.SETTINGS_KEY);
  },

  // 更新连续学习天数
  updateStreak() {
    return this.update(d => {
      const today = new Date().toISOString().slice(0, 10);
      if (d.lastStudyDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (d.lastStudyDate === yesterday) d.streak++;
        else d.streak = 1;
        d.lastStudyDate = today;
      }
    });
  },

  // 记录弱项(自适应用)
  addWeakness(module, item) {
    this.update(d => {
      if (!d.weaknesses[module]) d.weaknesses[module] = [];
      if (!d.weaknesses[module].includes(item)) {
        d.weaknesses[module].push(item);
        if (d.weaknesses[module].length > 50) d.weaknesses[module].shift();
      }
    });
  },

  // 移除已掌握的弱项
  removeWeakness(module, item) {
    this.update(d => {
      if (d.weaknesses[module]) {
        d.weaknesses[module] = d.weaknesses[module].filter(w => w !== item);
      }
    });
  },

  // 深度合并(简化版)
  _merge(target, source) {
    const out = { ...target };
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
        out[k] = this._merge(target[k] || {}, source[k]);
      } else {
        out[k] = source[k];
      }
    }
    return out;
  }
};
