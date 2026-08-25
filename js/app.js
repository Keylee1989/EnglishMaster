/* ===== 核心应用框架 (路由/状态/UI/数据/路径控制) ===== */
window.EM = window.EM || {};

// ===== 级别系统 (L0-L5 对应 CEFR Pre-A1 到 C2) =====
EM.LEVELS = [
  { id: 0, code: 'Pre-A1', name: '零基础', cn: '零基础', target: '字母/音标/拼读', hours: 0, words: 0 },
  { id: 1, code: 'A1', name: '入门', cn: '生存英语', target: '1000-2000词', hours: 100, words: 1500 },
  { id: 2, code: 'A2', name: '初级', cn: '日常交流', target: '3000词', hours: 200, words: 3000 },
  { id: 3, code: 'B1', name: '中级', cn: '工作学习', target: '5000词', hours: 400, words: 5000 },
  { id: 4, code: 'C1', name: '高级', cn: '流利表达', target: '8000词', hours: 700, words: 8000 },
  { id: 5, code: 'C2', name: '精通', cn: '母语水平', target: '16000+词', hours: 1200, words: 16000 }
];

// ===== UI 工具 =====
EM.ui = {
  toast(msg, duration = 2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
  },

  modal(html, opts = {}) {
    const overlay = document.getElementById('toastOverlay');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header"><h2>${opts.title || ''}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">${html}</div>
    `;
    overlay.innerHTML = '';
    overlay.appendChild(modal);
    overlay.classList.add('show');
    modal.querySelector('[data-close]').onclick = () => overlay.classList.remove('show');
    overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove('show'); };
    return modal;
  },

  closeModal() {
    document.getElementById('toastOverlay').classList.remove('show');
  },

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

// ===== 数据加载 =====
EM.data = {
  cache: {},
  async load(name) {
    if (this.cache[name]) return this.cache[name];
    try {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(`加载 ${name} 失败(HTTP ${res.status})`);
      const data = await res.json();
      this.cache[name] = data;
      return data;
    } catch (e) {
      console.error(e);
      // 友好诊断:是否用了 file:// 协议直接打开
      if (location.protocol === 'file:') {
        EM.ui.toast('⚠️ 不能直接双击打开index.html!请用 http://localhost:8000 访问', 5000);
      } else {
        EM.ui.toast(`数据加载失败: ${name} - ${e.message}`, 4000);
      }
      return null;
    }
  }
};

// ===== 强制引导式学习路径管理器 =====
EM.path = {
  _data: null,
  _cachedProgress: null,

  // 加载学习路径数据(带缓存)
  async load() {
    if (this._data) return this._data;
    const data = await EM.data.load('learning_path');
    this._data = data || { path: [] };
    return this._data;
  },

  // 获取所有步骤
  all() {
    return (this._data && this._data.path) || [];
  },

  // 当前应执行的步骤(基于progress.pathStep)
  currentStep() {
    const p = EM.progress.get();
    const all = this.all();
    if (!all.length) return null;
    const idx = Math.min(p.pathStep || 0, all.length - 1);
    return { ...all[idx], index: idx };
  },

  // 当前步骤是否已完成(自动判断)
  isCurrentStepDone() {
    const p = EM.progress.get();
    const step = this.currentStep();
    if (!step) return false;
    return this._isStepDone(step, p);
  },

  // 内部: 判定某步骤是否完成
  _isStepDone(step, p) {
    // 已在completedSteps数组中,视为完成
    if ((p.completedSteps || []).includes(step.step)) return true;

    // 自动判定逻辑
    const sm = step.submodule || '';
    switch (step.step) {
      // L0 拼读阶段: 检查 phonics.mastered
      case 0: return (p.modules.phonics.mastered || []).length >= 26;
      case 1: return (p.modules.phonics.mastered || []).filter(m =>
        ['a','e','i','o','u','a_long','e_long','i_long','o_long','u_long'].includes(m)
      ).length >= 5;
      case 2: return (p.modules.phonics.mastered || []).filter(m =>
        ['sh','ch','th','ph','wh'].includes(m)
      ).length >= 3;
      case 3: return (p.modules.phonics.mastered || []).filter(m =>
        ['cat','dog','bat','pig','hat','bed','sit','hop','run','cut'].includes(m)
      ).length >= 5;
      case 4: return (p.modules.phonics.mastered || []).filter(m =>
        ['magic_e','cap_cape','hop_hope','kit_kite'].includes(m)
      ).length >= 2;
      case 5: return (p.modules.phonics.mastered || []).filter(m =>
        ['ai','ee','oa','oo','ay','ey'].includes(m)
      ).length >= 3;
      // L0 毕业测试: level >= 1
      case 6: return (p.level || 0) >= 1;
      // L1阶段: 检查词汇数 / 语法掌握 / 听力阅读完成数
      case 7: return (p.modules.vocabulary.learned || []).length >= 50;
      case 8: return (p.modules.vocabulary.learned || []).length >= 100;
      case 9: return (p.modules.grammar.mastered || []).includes('be_verb');
      case 10: return (p.modules.grammar.mastered || []).includes('pronouns');
      case 11: return (p.modules.listening.completed || []).filter(c => String(c).startsWith('L1')).length >= 3;
      case 12: return (p.modules.reading.completed || []).filter(c => String(c).startsWith('L1')).length >= 3;
      case 13: return (p.modules.vocabulary.learned || []).length >= 200;
      case 14: return (p.modules.speaking.completed || []).length >= 5;
      case 15: return (p.level || 0) >= 2;
      // L2阶段
      case 16: return (p.modules.vocabulary.learned || []).length >= 2050;
      case 17: return (p.modules.grammar.mastered || []).filter(g =>
        ['simple_present','simple_past','future_tense'].includes(g)
      ).length >= 2;
      case 18: return (p.modules.listening.completed || []).filter(c => String(c).startsWith('L2')).length >= 3;
      case 19: return (p.modules.reading.completed || []).filter(c => String(c).startsWith('L2')).length >= 3;
      case 20: return (p.modules.vocabulary.learned || []).length >= 2200;
      case 21: return (p.modules.speaking.completed || []).length >= 8;
      case 22: return (p.modules.writing.completed || []).length >= 10;
      case 23: return (p.level || 0) >= 3;
      // L3阶段
      case 24: return (p.modules.vocabulary.learned || []).length >= 3050;
      case 25: return (p.modules.grammar.mastered || []).filter(g =>
        ['object_clause','attributive_clause','adverbial_clause'].includes(g)
      ).length >= 2;
      case 26: return (p.modules.listening.completed || []).filter(c => String(c).startsWith('L3')).length >= 3;
      case 27: return (p.modules.reading.completed || []).filter(c => String(c).startsWith('L3')).length >= 3;
      case 28: return (p.modules.vocabulary.learned || []).length >= 3300;
      case 29: return (p.modules.speaking.completed || []).length >= 11;
      case 30: return (p.modules.writing.completed || []).length >= 12;
      case 31: return (p.level || 0) >= 4;
      // L4阶段
      case 32: return (p.modules.vocabulary.learned || []).length >= 5050;
      case 33: return (p.modules.grammar.mastered || []).filter(g =>
        ['subjunctive','inversion','non_finite'].includes(g)
      ).length >= 2;
      case 34: return (p.modules.reading.completed || []).filter(c => String(c).startsWith('L4')).length >= 3;
      case 35: return (p.modules.listening.completed || []).filter(c => String(c).startsWith('L4')).length >= 3;
      case 36: return (p.modules.vocabulary.learned || []).length >= 5200;
      case 37: return (p.modules.writing.completed || []).length >= 13;
      case 38: return (p.modules.speaking.completed || []).length >= 14;
      case 39: return (p.level || 0) >= 5;
      // L5阶段
      case 40: return (p.modules.vocabulary.learned || []).length >= 16050;
      case 41: return (p.modules.grammar.mastered || []).length >= 80;
      case 42: return (p.modules.reading.completed || []).filter(c => String(c).startsWith('L5')).length >= 3;
      case 43: return (p.modules.listening.completed || []).filter(c => String(c).startsWith('L5')).length >= 3;
      case 44: return (p.modules.writing.completed || []).length >= 15;
      case 45: return (p.graduation && p.graduation.passed) === true;
      default: return false;
    }
  },

  // 模块是否已解锁(基于当前步骤)
  isModuleUnlocked(moduleName) {
    const all = this.all();
    if (!all.length) return true; // 路径未加载前放行
    const p = EM.progress.get();
    const curStep = p.pathStep || 0;

    // progress/rag/dictionary/home/media 始终允许(media为辅助学习资源)
    if (['home', 'progress', 'rag', 'dictionary', 'media'].includes(moduleName)) return true;

    // 该模块在路径中是否已出现在已完成的步骤或当前步骤
    // 即: 如果用户当前或之前任何一步用到了这个模块,就算解锁
    for (let i = 0; i <= curStep && i < all.length; i++) {
      if (all[i].module === moduleName) return true;
    }
    return false;
  },

  // 跳到下一个未完成的步骤
  async advanceToNext() {
    const all = this.all();
    if (!all.length) return;
    const p = EM.progress.get();
    let cur = p.pathStep || 0;

    // 向前扫描直到找到未完成的步骤
    while (cur < all.length - 1) {
      const step = all[cur];
      if (!this._isStepDone(step, p)) break;
      // 标记完成
      if (!(p.completedSteps || []).includes(step.step)) {
        EM.progress.update(d => {
          if (!(d.completedSteps || []).includes(step.step)) {
            d.completedSteps.push(step.step);
          }
        });
      }
      cur++;
    }
    EM.progress.update(d => { d.pathStep = cur; });
    return cur;
  },

  // 用户手动标记当前步骤完成
  async completeCurrent() {
    const step = this.currentStep();
    if (!step) return;
    await EM.progress.update(d => {
      if (!(d.completedSteps || []).includes(step.step)) {
        d.completedSteps.push(step.step);
      }
      d.pathStep = Math.min(d.pathStep + 1, (this.all().length - 1));
    });
    return EM.path.currentStep();
  },

  // 重置路径(用户重置进度时调用)
  reset() {
    EM.progress.update(d => {
      d.pathStep = 0;
      d.completedSteps = [];
    });
  }
};

// ===== 路由与模块管理 =====
EM.modules = {};
EM.currentRoute = 'home';
EM.currentSubmodule = null; // 当前要进入的子模块(由路径指定)

EM.registerModule = (name, mod) => {
  EM.modules[name] = mod;
};

EM.router = {
  routes: {
    home: { title: '学习中心' },
    phonics: { title: '自然拼读' },
    vocabulary: { title: '词汇学习' },
    grammar: { title: '语法大全' },
    listening: { title: '听力训练' },
    speaking: { title: '口语练习' },
    reading: { title: '阅读理解' },
    media: { title: '音视频课' },
    writing: { title: '写作训练' },
    test: { title: '自适应测试' },
    dictionary: { title: '查询中心' },
    rag: { title: '智能问答' },
    progress: { title: '学习进度' }
  },

  // 带子模块参数的导航(用于路径跳转)
  navigateWithSubmodule(route, submodule) {
    EM.currentSubmodule = submodule || null;
    return this.navigate(route);
  },

  async navigate(route) {
    // 模块解锁检查(若路径已加载)
    if (EM.path._data && !EM.path.isModuleUnlocked(route)) {
      EM.ui.toast('🔒 该模块尚未解锁,请先完成当前步骤');
      setTimeout(() => this.navigate('home'), 800);
      return;
    }

    EM.currentRoute = route;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });
    const info = this.routes[route] || { title: route };
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('sidebar').classList.remove('open');

    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    if (route === 'home') {
      await EM.renderHome(content);
    } else if (route === 'progress') {
      EM.renderProgressPage(content);
    } else if (EM.modules[route]) {
      // 预处理:根据子模块参数预设模块状态
      const sm = EM.currentSubmodule;
      if (sm) {
        if (route === 'phonics' && EM.phonics) {
          EM.phonics.activeTab = sm;  // 自动切换到对应分类
        } else if (route === 'vocabulary' && EM.vocabulary) {
          if (EM.vocabulary.setLevel) EM.vocabulary.setLevel(sm);
          else EM.vocabulary.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'listening' && EM.listening) {
          EM.listening.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'reading' && EM.reading) {
          EM.reading.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'media' && EM.media) {
          EM.media.activeLevel = parseInt(sm.replace(/\D/g, '')) || 1;
        } else if (route === 'speaking' && EM.speaking) {
          if (EM.speaking.setMode) EM.speaking.setMode(sm);
        } else if (route === 'writing' && EM.writing) {
          if (EM.writing.setMode) EM.writing.setMode(sm);
        }
      }

      // 渲染模块
      EM.modules[route].render(content, sm);
      EM.currentSubmodule = null;

      // 注入本课引导横幅(在模块顶部)
      const step = EM.path.currentStep();
      if (step && step.module === route) {
        const banner = document.createElement('div');
        banner.className = 'lesson-banner';
        banner.innerHTML = `
          <div class="lesson-banner-title">📍 当前课程:第 ${step.step + 1} 课 · ${step.title}</div>
          ${step.what ? `<div class="lesson-banner-what">📖 ${step.what}</div>` : ''}
          <div class="lesson-banner-steps">📋 ${step.howto || (step.steps ? step.steps[0] : '')}</div>
          <button class="btn btn-primary lesson-banner-done" onclick="EM.markCurrentDone()">✅ 我已完成本课</button>
        `;
        content.insertBefore(banner, content.firstChild);
      }
    } else {
      content.innerHTML = '<div class="card"><p>该模块正在开发中...</p></div>';
    }

    EM.progress.updateStreak();
    EM.updateLevelBadge();
    EM.updateNavLocks();
  }
};

// ===== 级别徽章 =====
EM.updateLevelBadge = () => {
  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  document.getElementById('levelBadge').textContent = `L${lv.id} · ${lv.cn}`;
  document.getElementById('streakInfo').textContent = `🔥 连续 ${p.streak} 天`;
};

// ===== 侧边栏锁状态更新 =====
EM.updateNavLocks = () => {
  const all = EM.path.all();
  if (!all.length) return;
  document.querySelectorAll('.nav-item').forEach(el => {
    const route = el.dataset.route;
    if (['home', 'progress', 'rag'].includes(route)) return;
    const unlocked = EM.path.isModuleUnlocked(route);
    const label = el.querySelector('.nav-label');
    if (!label) return;
    // 移除旧锁图标
    const oldLock = label.querySelector('.lock-icon');
    if (oldLock) oldLock.remove();
    if (!unlocked) {
      const lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = ' 🔒';
      label.appendChild(lock);
      el.style.opacity = '0.4';
    } else {
      el.style.opacity = '1';
    }
  });
};

// 完成今日目标打卡
EM.checkinToday = () => {
  EM.progress.updateStreak();
  const p = EM.progress.get();
  EM.ui.toast('✅ 打卡成功！已连续学习 ' + p.streak + ' 天');
  EM.updateLevelBadge();
};

// ===== 首页: 强制引导式 =====
EM.renderHome = async (container) => {
  // 确保路径已加载
  await EM.path.load();
  // 自动推进到第一个未完成步骤
  await EM.path.advanceToNext();

  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  const all = EM.path.all();
  const curIdx = Math.min(p.pathStep || 0, all.length - 1);
  const step = all[curIdx];
  const totalSteps = all.length;
  const completedCount = (p.completedSteps || []).length;
  const isDone = EM.path.isCurrentStepDone();
  const grad = p.graduation || { passed: false, date: null, scores: {} };

  const vocabLearned = (p.modules.vocabulary.learned || []).length;
  const phonicsMastered = (p.modules.phonics.mastered || []).length;
  const grammarMastered = (p.modules.grammar.mastered || []).length;
  const studyHours = Math.floor(p.totalStudyTime / 3600);
  const pathProgress = ((curIdx) / (totalSteps - 1)) * 100;

  // 当前任务大卡片(零基础保姆版3段式)
  const currentCard = step ? `
    <div class="card" style="border:2px solid var(--accent); background:var(--accent-bg); padding:24px;">
      <div class="flex justify-between align-center mb-16">
        <div>
          <div class="font-sm text-secondary">第 ${curIdx + 1} 课 / 共 ${totalSteps} 课</div>
          <div style="font-size:22px; font-weight:700; margin-top:4px;">${step.title}</div>
          <div class="font-sm text-secondary" style="margin-top:6px;">
            阶段: L${step.level} · ${EM.LEVELS[step.level].cn} | 模块: ${step.module}
          </div>
        </div>
        <div style="font-size:42px;">${isDone ? '✅' : '🚀'}</div>
      </div>

      ${step.what ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--accent);">
        <div class="font-sm" style="font-weight:700; color:var(--accent);">📖 这是什么</div>
        <div style="margin-top:6px; line-height:1.7;">${step.what}</div>
      </div>` : ''}

      ${step.why ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--success);">
        <div class="font-sm" style="font-weight:700; color:var(--success);">🎯 为什么要学</div>
        <div style="margin-top:6px; line-height:1.7;">${step.why}</div>
      </div>` : ''}

      ${step.steps && step.steps.length ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--warning);">
        <div class="font-sm" style="font-weight:700; color:var(--warning);">📋 怎么做(按顺序执行)</div>
        <ol style="margin-top:8px; padding-left:24px; line-height:1.9;">
          ${step.steps.map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}
        </ol>
      </div>` : (step.howto ? `
      <div style="background:var(--card-bg); padding:14px; border-radius:var(--radius); margin:12px 0; border-left:4px solid var(--warning);">
        <div class="font-sm" style="font-weight:700; color:var(--warning);">📋 怎么做</div>
        <div style="margin-top:6px; line-height:1.7;">${step.howto}</div>
      </div>` : '')}

      <div class="flex gap-8 flex-wrap" style="margin-top:16px;">
        ${isDone
          ? `<button class="btn btn-primary" style="font-size:16px; padding:14px 28px;" onclick="EM.goNextStep()">✅ 已完成,进入下一课 →</button>`
          : `<button class="btn btn-primary" style="font-size:16px; padding:14px 28px;" onclick="EM.startCurrentStep()">🚀 开始本课学习</button>
             <button class="btn btn-secondary" onclick="EM.markCurrentDone()">我已完成本课</button>`
        }
        <button class="btn btn-secondary" onclick="EM.checkinToday()">✅ 今日打卡</button>
      </div>

      ${grad.passed
        ? '<div class="font-sm text-success" style="margin-top:14px; font-size:16px;">🎓 已通过毕业测试,达到 C2 母语水平!</div>'
        : ''}
    </div>
  ` : '<div class="card"><p>路径加载中...</p></div>';

  // 学习路径地图(折叠)
  const pathMap = all.map((s, i) => {
    const done = (p.completedSteps || []).includes(s.step) || i < curIdx;
    const isCurrent = i === curIdx;
    const isLocked = i > curIdx;
    const cls = done ? 'done' : (isCurrent ? 'current' : 'locked');
    const icon = done ? '✅' : (isCurrent ? '▶️' : '🔒');
    return `
      <div class="path-step ${cls}" ${isLocked ? 'style="opacity:0.5;"' : ''}
           ${!isLocked ? `onclick="EM.jumpToStep(${i})"` : ''}>
        <span style="font-size:18px;">${icon}</span>
        <div style="flex:1;">
          <div class="font-sm" style="font-weight:${isCurrent ? '700' : '400'};">
            第${i + 1}步 · L${s.level}
          </div>
          <div>${s.title}</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- 顶部状态 -->
    <div class="card">
      <div class="flex align-center justify-between mb-16">
        <div>
          <div class="font-sm text-secondary">当前级别</div>
          <div style="font-size:24px; font-weight:700;">L${lv.id} · ${lv.cn} <span class="font-sm text-secondary">(${lv.code})</span></div>
        </div>
        <div style="text-align:right;">
          <div class="font-sm text-secondary">学习路径进度</div>
          <div class="font-lg">${completedCount} / ${totalSteps} 步</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pathProgress}%"></div></div>
      <div class="font-sm text-secondary mt-16" style="display:flex; justify-content:space-between;">
        <span>路径完成度 ${pathProgress.toFixed(0)}%</span>
        <span>🔥 连续 ${p.streak} 天 · ⏰ ${studyHours}小时</span>
      </div>
    </div>

    <!-- 4格统计 -->
    <div class="grid grid-4 mb-16">
      <div class="stat-card"><div class="stat-value">${vocabLearned}</div><div class="stat-label">已学单词</div></div>
      <div class="stat-card"><div class="stat-value">${phonicsMastered}</div><div class="stat-label">拼读掌握</div></div>
      <div class="stat-card"><div class="stat-value">${grammarMastered}</div><div class="stat-label">语法掌握</div></div>
      <div class="stat-card"><div class="stat-value">${curIdx}/${totalSteps}</div><div class="stat-label">路径步骤</div></div>
    </div>

    <!-- 当前任务大卡片 -->
    ${currentCard}

    <!-- 路径地图 -->
    <div class="card">
      <div class="card-title">🗺️ 完整学习路径 (点击未锁定的步骤可跳转)</div>
      <div class="path-map">${pathMap}</div>
    </div>

    <!-- 其他模块入口(只显示已解锁的) -->
    <div class="grid grid-3">
      ${['phonics','vocabulary','grammar','listening','speaking','reading','media','writing','test'].map(name => {
        const unlocked = EM.path.isModuleUnlocked(name);
        const titleMap = { phonics:'自然拼读', vocabulary:'词汇学习', grammar:'语法大全',
          listening:'听力训练', speaking:'口语练习', reading:'阅读理解',
          media:'音视频课', writing:'写作训练', test:'自适应测试' };
        const iconMap = { phonics:'🔤', vocabulary:'📚', grammar:'📖',
          listening:'👂', speaking:'🗣️', reading:'📰',
          media:'🎬', writing:'✍️', test:'🎯' };
        return `
          <div class="card" style="cursor:${unlocked ? 'pointer' : 'not-allowed'}; ${unlocked ? '' : 'opacity:0.4;'}"
               ${unlocked ? `onclick="EM.router.navigate('${name}')"` : 'onclick="EM.ui.toast(\'🔒 请先完成当前步骤解锁\')"'}>
            <div class="card-title">${iconMap[name]} ${titleMap[name]} ${unlocked ? '' : '🔒'}</div>
            <p class="font-sm text-secondary">${unlocked ? '点击进入' : '未解锁'}</p>
          </div>
        `;
      }).join('')}
      <div class="card" style="cursor:pointer;" onclick="EM.router.navigate('rag')">
        <div class="card-title">🤖 智能问答</div>
        <p class="font-sm text-secondary">本地知识库+AI可选</p>
      </div>
      <div class="card" style="cursor:pointer;" onclick="EM.router.navigate('dictionary')">
        <div class="card-title">🔍 查询中心</div>
        <p class="font-sm text-secondary">搜单词/查语法/主题词族</p>
      </div>
    </div>
  `;
};

// 开始当前步骤(跳转到对应模块)
EM.startCurrentStep = () => {
  const step = EM.path.currentStep();
  if (!step) return;
  EM.router.navigateWithSubmodule(step.module, step.submodule);
};

// 用户手动标记当前步骤完成
EM.markCurrentDone = async () => {
  if (!confirm('确认你已完成本步学习目标?完成将进入下一步。')) return;
  await EM.path.completeCurrent();
  EM.ui.toast('🎉 已完成本步!进入下一步');
  EM.router.navigate('home');
};

// 跳到下一步
EM.goNextStep = async () => {
  await EM.path.completeCurrent();
  EM.ui.toast('🎉 进入下一步');
  EM.router.navigate('home');
};

// 跳转到指定步骤(只允许已完成或当前步骤)
EM.jumpToStep = (idx) => {
  const p = EM.progress.get();
  if (idx > (p.pathStep || 0)) {
    EM.ui.toast('🔒 该步骤尚未解锁');
    return;
  }
  EM.progress.update(d => { d.pathStep = idx; });
  EM.router.navigate('home');
};

// ===== 进度详情页 =====
EM.renderProgressPage = (container) => {
  const p = EM.progress.get();
  const lv = EM.LEVELS[p.level] || EM.LEVELS[0];
  container.innerHTML = `
    <div class="card">
      <div class="card-title">📊 总览</div>
      <div class="grid grid-3">
        <div class="stat-card"><div class="stat-value">${p.streak}</div><div class="stat-label">连续天数</div></div>
        <div class="stat-card"><div class="stat-value">${Math.floor(p.totalStudyTime/3600)}</div><div class="stat-label">总学时</div></div>
        <div class="stat-card"><div class="stat-value">L${lv.id}</div><div class="stat-label">当前级别</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🛣️ 学习路径状态</div>
      <div class="font-sm text-secondary mb-16">
        当前第 ${(p.pathStep || 0) + 1} 步 / 共 ${EM.path.all().length} 步<br>
        已完成 ${(p.completedSteps || []).length} 步
      </div>
      <button class="btn btn-secondary" onclick="EM.router.navigate('home')">回到当前任务</button>
    </div>
    <div class="card">
      <div class="card-title">📝 各模块进度</div>
      ${Object.entries({
        '自然拼读': `${(p.modules.phonics.mastered||[]).length} 项掌握`,
        '词汇': `${(p.modules.vocabulary.learned||[]).length} 词已学`,
        '语法': `${(p.modules.grammar.mastered||[]).length} 点掌握`,
        '听力': `${(p.modules.listening.completed||[]).length} 段完成`,
        '口语': `${(p.modules.speaking.completed||[]).length} 次完成`,
        '阅读': `${(p.modules.reading.completed||[]).length} 篇完成`,
        '音视频': `${(p.modules.media && p.modules.media.completed || []).length} 课完成`,
        '写作': `${(p.modules.writing.completed||[]).length} 篇完成`,
        '测试': `${(p.modules.test.history||[]).length} 次完成`
      }).map(([k,v]) => `
        <div class="flex justify-between align-center" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <span>${k}</span><span class="text-secondary">${v}</span>
        </div>
      `).join('')}
    </div>
    <div class="card">
      <div class="card-title">⚠️ 弱项记录 (自适应优先复习)</div>
      ${Object.entries(p.weaknesses).map(([mod, items]) => items.length ?
        `<div class="mb-16"><div class="font-sm text-secondary">${mod}</div>
         <div class="flex gap-8 flex-wrap mt-16">${items.slice(0,20).map(i => `<span class="tag tag-l3">${EM.ui.esc(i)}</span>`).join('')}</div></div>` : ''
      ).join('') || '<p class="text-secondary font-sm">暂无弱项记录</p>'}
    </div>
    <div class="card">
      <div class="card-title">💾 跨设备同步</div>
      <p class="font-sm text-secondary mb-16">导出进度文件到本地,在其他设备上导入即可继续学习</p>
      <button class="btn btn-primary" onclick="EM.progress.export()">📤 导出进度</button>
      <button class="btn btn-secondary" onclick="document.getElementById('importFile').click()">📥 导入进度</button>
    </div>
  `;
};

// ===== 初始化 =====
EM.init = async () => {
  EM.tts.init();
  EM.updateLevelBadge();

  // 预加载学习路径(异步,不阻塞界面)
  EM.path.load().then(() => {
    EM.updateNavLocks();
  });

  // 导航事件
  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => EM.router.navigate(el.dataset.route);
  });

  // 移动端菜单
  document.getElementById('menuToggle').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
  };

  // 设置弹窗
  document.getElementById('settingsBtn').onclick = () => {
    document.getElementById('settingsModal').classList.add('show');
    const s = EM.progress.getSettings();
    document.getElementById('voiceLang').value = s.voiceLang || 'en-US';
    document.getElementById('speechRate').value = s.speechRate || 0.9;
    document.getElementById('rateValue').textContent = s.speechRate || 0.9;
    document.getElementById('themeSelect').value = s.theme || 'dark';
    document.getElementById('aiApiUrl').value = s.aiApiUrl || '';
    document.getElementById('aiApiKey').value = s.aiApiKey || '';
    document.getElementById('aiModel').value = s.aiModel || 'gpt-4o-mini';
  };

  document.querySelectorAll('#settingsModal [data-close]').forEach(el => {
    el.onclick = () => document.getElementById('settingsModal').classList.remove('show');
  });
  document.getElementById('settingsModal').onclick = e => {
    if (e.target.id === 'settingsModal') e.target.classList.remove('show');
  };

  // 设置保存
  document.getElementById('voiceLang').onchange = e => {
    EM.progress.saveSettings({ voiceLang: e.target.value });
    EM.tts.setLang(e.target.value);
  };
  document.getElementById('speechRate').oninput = e => {
    EM.progress.saveSettings({ speechRate: parseFloat(e.target.value) });
    EM.tts.setRate(parseFloat(e.target.value));
    document.getElementById('rateValue').textContent = e.target.value;
  };
  document.getElementById('themeSelect').onchange = e => {
    EM.progress.saveSettings({ theme: e.target.value });
    EM.applyTheme(e.target.value);
  };
  ['aiApiUrl','aiApiKey','aiModel'].forEach(id => {
    document.getElementById(id).onchange = e => {
      EM.progress.saveSettings({ [id]: e.target.value });
      if (EM.modules.rag) EM.modules.rag.reloadConfig();
    };
  });

  // 导入导出
  document.getElementById('exportProgress').onclick = () => EM.progress.export();
  document.getElementById('importProgress').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = async e => {
    if (e.target.files[0]) {
      try {
        await EM.progress.import(e.target.files[0]);
        EM.ui.toast('进度导入成功!');
        EM.updateLevelBadge();
        EM.updateNavLocks();
        EM.router.navigate(EM.currentRoute);
      } catch (err) { EM.ui.toast('导入失败: ' + err.message); }
    }
  };
  document.getElementById('resetProgress').onclick = () => {
    if (confirm('确定重置所有进度?此操作不可撤销。')) {
      EM.progress.reset();
      EM.path.reset();
      EM.ui.toast('进度已重置,从第1步重新开始');
      EM.updateLevelBadge();
      EM.updateNavLocks();
      EM.router.navigate('home');
    }
  };

  // 语音开关
  document.getElementById('ttsToggle').onclick = () => {
    const on = EM.tts.toggle();
    document.getElementById('ttsToggle').textContent = on ? '🔊' : '🔇';
    EM.ui.toast(on ? '语音已开启' : '语音已关闭');
  };

  // 主题
  const theme = EM.progress.getSettings().theme || 'dark';
  EM.applyTheme(theme);

  // 首页
  EM.router.navigate('home');
};

EM.applyTheme = (theme) => {
  if (theme === 'auto') {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

// 启动
document.addEventListener('DOMContentLoaded', EM.init);
