/* ===== 音视频课程模块 (Media) =====
 * 分级 L1-L6 对应 CEFR A1-C2，分级 YouTube 视频课程
 * 功能:
 *   1) 视频列表：按级别浏览，显示标题/时长/频道
 *   2) 视频详情：显示学习要点 + YouTube跳转按钮
 *   3) 测试题：观看视频后完成选择题
 *   4) 进度记录：完成测试后标记为已掌握
 * 数据：EM.data.load('video_lessons') → data/video_lessons.json
 */
window.EM = window.EM || {};

EM.media = {
  data: null,             // 从 data/video_lessons.json 加载的视频数据
  _container: null,       // 当前渲染容器
  activeLevel: 1,          // 当前级别 1-6
  currentVideoId: null,   // 当前正在查看的视频 id
  view: 'list',            // 'list' 列表 | 'detail' 详情 | 'quiz' 测验
  quizState: null,         // 测验状态 {videoId, qIdx, correctCount}

  /* ===== 入口：由路由调用 ===== */
  async render(container) {
    this._container = container;
    this._injectStyles();
    container.innerHTML = '<div class="loading">加载视频课程数据中...</div>';

    if (!this.data) {
      this.data = await EM.data.load('video_lessons');
    }
    if (!this.data || !this.data.levels) {
      container.innerHTML = '<div class="card"><p>视频课程数据加载失败，请刷新重试。</p></div>';
      return;
    }

    // 默认级别：从进度恢复，否则取用户当前级别
    const p = EM.progress.get();
    this.activeLevel = Math.max(1, Math.min(6,
      (p.modules.media && p.modules.media.current) || Math.max(1, p.level || 1)));
    if (!this._levelExists(this.activeLevel)) this.activeLevel = 1;

    this._renderShell();
  },

  /* ===== 注入本模块专用样式 ===== */
  _injectStyles() {
    if (document.getElementById('media-styles')) return;
    const style = document.createElement('style');
    style.id = 'media-styles';
    style.textContent = `
      .media-hint { font-size:13px; color:var(--text-secondary); margin-top:8px; }
      .media-level-tabs {
        display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px;
        padding:10px; background:var(--bg-card); border-radius:var(--radius);
        border:1px solid var(--border);
      }
      .media-level-tab {
        padding:6px 14px; border-radius:var(--radius-sm); cursor:pointer;
        background:transparent; border:1px solid var(--border); color:var(--text-secondary);
        font-size:13px; transition:var(--transition);
      }
      .media-level-tab.active {
        background:var(--accent); color:#fff; border-color:var(--accent);
      }
      .media-level-tab:hover { border-color:var(--accent); }
      .video-item {
        padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-card); margin-bottom:10px; cursor:pointer;
        transition:var(--transition);
        display:flex; justify-content:space-between; align-items:center; gap:12px;
      }
      .video-item:hover { border-color:var(--accent); background:var(--bg-hover); }
      .video-item.done { border-color:var(--success); }
      .video-item .vi-title { font-weight:600; font-size:15px; }
      .video-item .vi-cn { font-size:13px; color:var(--text-secondary); margin-top:2px; }
      .video-item .vi-meta { font-size:12px; color:var(--accent); white-space:nowrap; }
      .video-item .vi-status { font-size:18px; }
      .video-detail {
        padding:16px; background:var(--bg-card); border:1px solid var(--border);
        border-radius:var(--radius-sm); margin:12px 0;
      }
      .video-watch-btn {
        display:inline-flex; align-items:center; gap:8px;
        padding:14px 24px; background:#ff0000; color:#fff;
        border:none; border-radius:var(--radius-sm); cursor:pointer;
        font-size:15px; font-weight:600; text-decoration:none;
        transition:var(--transition); margin:4px 8px 4px 0;
      }
      .video-watch-btn:hover { background:#cc0000; transform:translateY(-1px); }
      .video-watch-btn::before { content:"▶"; font-size:14px; }
      .video-watch-btn.bilibili { background:#00a1d6; }
      .video-watch-btn.bilibili:hover { background:#0088b3; }
      .video-watch-btn.bilibili::before { content:"📺"; }
      .video-points {
        margin:16px 0; padding:14px; background:var(--bg-hover);
        border-radius:var(--radius-sm); border-left:4px solid var(--accent);
      }
      .video-points h4 { margin:0 0 8px 0; font-size:14px; color:var(--accent); }
      .video-points ul { margin:0; padding-left:20px; }
      .video-points li { margin:4px 0; font-size:14px; }
      .quiz-box {
        margin:16px 0; padding:16px; background:var(--bg-card);
        border:1px solid var(--border); border-radius:var(--radius-sm);
      }
      .quiz-question { font-size:15px; margin:12px 0 8px; font-weight:500; }
      .quiz-option {
        padding:10px 14px; margin:6px 0; border:1px solid var(--border);
        border-radius:var(--radius-sm); cursor:pointer; transition:var(--transition);
        background:transparent;
      }
      .quiz-option:hover { border-color:var(--accent); background:var(--bg-hover); }
      .quiz-option.correct {
        border-color:var(--success); background:rgba(34,197,94,0.1);
      }
      .quiz-option.wrong {
        border-color:var(--danger); background:rgba(239,68,68,0.1);
      }
      .quiz-option.disabled { pointer-events:none; opacity:0.7; }
      .quiz-result {
        text-align:center; padding:20px; margin-top:12px;
        background:var(--bg-hover); border-radius:var(--radius);
      }
      .quiz-result .score { font-size:24px; font-weight:700; color:var(--accent); }
      .back-btn {
        padding:8px 16px; background:transparent; border:1px solid var(--border);
        border-radius:var(--radius-sm); cursor:pointer; color:var(--text-primary);
        font-size:13px; margin-bottom:12px;
      }
      .back-btn:hover { border-color:var(--accent); color:var(--accent); }
    `;
    document.head.appendChild(style);
  },

  /* ===== 渲染外壳(级别 tab + 内容区) ===== */
  _renderShell() {
    const c = this._container;
    c.innerHTML = `
      <div class="card">
        <p class="media-hint">📺 点击视频跳转到 YouTube 观看，学习完毕返回做测试</p>
        <div class="media-level-tabs" id="mediaLevelTabs"></div>
        <div id="mediaContent"></div>
      </div>
    `;
    // 渲染级别 tabs
    const tabsEl = document.getElementById('mediaLevelTabs');
    const levels = this.data.levels || [];
    tabsEl.innerHTML = levels.map(lv => {
      const doneCount = this._countDoneInLevel(lv.level);
      const isActive = lv.level === this.activeLevel ? 'active' : '';
      return `<span class="media-level-tab ${isActive}" data-level="${lv.level}">
        L${lv.level} · ${lv.name} (${doneCount}/${lv.videos.length})
      </span>`;
    }).join('');
    // 绑定 tab 切换
    tabsEl.querySelectorAll('.media-level-tab').forEach(t => {
      t.addEventListener('click', () => {
        this.activeLevel = parseInt(t.dataset.level);
        this.view = 'list';
        this.currentVideoId = null;
        this._saveCurrent();
        this._renderShell();
      });
    });
    // 渲染内容
    if (this.view === 'detail' && this.currentVideoId) {
      this._renderDetail();
    } else if (this.view === 'quiz' && this.currentVideoId) {
      this._startQuiz();
    } else {
      this._renderList();
    }
  },

  /* ===== 渲染视频列表 ===== */
  _renderList() {
    const lv = this._getLevel(this.activeLevel);
    if (!lv) return;
    const contentEl = document.getElementById('mediaContent');
    const p = EM.progress.get();
    const completed = (p.modules.media && p.modules.media.completed) || [];

    contentEl.innerHTML = `
      <h3 style="margin:0 0 12px">L${lv.level} · ${lv.name}</h3>
      <p style="color:var(--text-secondary); font-size:13px; margin:0 0 16px">${lv.description}</p>
      ${lv.videos.map(v => {
        const isDone = completed.includes(v.id);
        return `
          <div class="video-item ${isDone ? 'done' : ''}" data-id="${v.id}">
            <div>
              <div class="vi-title">${v.title}</div>
              <div class="vi-cn">${v.titleCn}</div>
            </div>
            <div style="text-align:right">
              <div class="vi-meta">⏱️ ${v.duration} · ${v.channel}</div>
              <div class="vi-status">${isDone ? '✅' : '⭕'}</div>
            </div>
          </div>
        `;
      }).join('')}
    `;
    // 绑定点击
    contentEl.querySelectorAll('.video-item').forEach(item => {
      item.addEventListener('click', () => {
        this.currentVideoId = item.dataset.id;
        this.view = 'detail';
        this._renderDetail();
      });
    });
  },

  /* ===== 渲染视频详情(含 YouTube 跳转 + 学习要点 + 测试入口) ===== */
  _renderDetail() {
    const v = this._findVideo(this.currentVideoId);
    if (!v) {
      this.view = 'list';
      this._renderList();
      return;
    }
    const bilibiliHtml = v.bilibiliUrl
      ? `<a class="video-watch-btn bilibili" href="${v.bilibiliUrl}" target="_blank" rel="noopener noreferrer">在 Bilibili 中观看</a>`
      : '';
    const contentEl = document.getElementById('mediaContent');
    contentEl.innerHTML = `
      <button class="back-btn" id="mediaBack">← 返回列表</button>
      <div class="video-detail">
        <h3 style="margin:0 0 4px">${v.title}</h3>
        <p style="color:var(--text-secondary); font-size:13px; margin:0 0 8px">${v.titleCn}</p>
        <p style="font-size:13px; color:var(--accent); margin:0 0 12px">
          📺 ${v.channel} · ⏱️ ${v.duration}
        </p>
        <p style="font-size:14px; margin:0 0 8px">${v.descriptionCn}</p>
        <div style="display:flex; flex-wrap:wrap; gap:4px 0; margin:8px 0;">
          <a class="video-watch-btn" href="${v.url}" target="_blank" rel="noopener noreferrer">在 YouTube 中观看</a>
          ${bilibiliHtml}
        </div>
        <div class="video-points">
          <h4>🎯 学习要点</h4>
          <ul>
            ${v.learningPoints.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
        <button class="btn primary" id="mediaStartQuiz" style="margin-top:12px">
          📝 观看完毕,开始测试
        </button>
      </div>
    `;
    // 返回按钮
    document.getElementById('mediaBack').addEventListener('click', () => {
      this.view = 'list';
      this.currentVideoId = null;
      this._renderList();
    });
    // 开始测试
    document.getElementById('mediaStartQuiz').addEventListener('click', () => {
      this.view = 'quiz';
      this._startQuiz();
    });
  },

  /* ===== 开始测试 ===== */
  _startQuiz() {
    const v = this._findVideo(this.currentVideoId);
    if (!v || !v.quiz || v.quiz.length === 0) {
      this._renderList();
      return;
    }
    this.quizState = {
      videoId: v.id,
      qIdx: 0,
      correctCount: 0,
      answered: false
    };
    this._renderQuiz();
  },

  /* ===== 渲染当前题目 ===== */
  _renderQuiz() {
    const v = this._findVideo(this.currentVideoId);
    if (!v || !this.quizState) return;
    const qIdx = this.quizState.qIdx;
    const q = v.quiz[qIdx];
    if (!q) {
      this._finishQuiz();
      return;
    }
    const contentEl = document.getElementById('mediaContent');
    contentEl.innerHTML = `
      <button class="back-btn" id="mediaBackQuiz">← 返回详情</button>
      <div class="quiz-box">
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:8px">
          测试 ${qIdx + 1} / ${v.quiz.length}
        </div>
        <div class="quiz-question">${q.q}</div>
        <div id="quizOptions">
          ${q.options.map((opt, i) => `
            <div class="quiz-option" data-idx="${i}">${opt}</div>
          `).join('')}
        </div>
        <div id="quizFeedback" style="margin-top:12px"></div>
      </div>
    `;
    // 返回详情
    document.getElementById('mediaBackQuiz').addEventListener('click', () => {
      this.view = 'detail';
      this._renderDetail();
    });
    // 绑定选项
    const opts = contentEl.querySelectorAll('.quiz-option');
    opts.forEach(opt => {
      opt.addEventListener('click', () => {
        if (this.quizState.answered) return;
        this.quizState.answered = true;
        const chosenIdx = parseInt(opt.dataset.idx);
        const correctIdx = q.answer;
        opts.forEach((o, i) => {
          o.classList.add('disabled');
          if (i === correctIdx) o.classList.add('correct');
          if (i === chosenIdx && i !== correctIdx) o.classList.add('wrong');
        });
        const feedback = document.getElementById('quizFeedback');
        if (chosenIdx === correctIdx) {
          this.quizState.correctCount++;
          feedback.innerHTML = `<p style="color:var(--success)">✅ 正确!</p>`;
        } else {
          feedback.innerHTML = `<p style="color:var(--danger)">❌ 错误。正确答案: ${q.options[correctIdx]}</p>`;
        }
        // 下一题按钮
        setTimeout(() => {
          const btn = document.createElement('button');
          btn.className = 'btn primary';
          btn.textContent = qIdx + 1 < v.quiz.length ? '下一题 →' : '查看结果';
          btn.addEventListener('click', () => {
            this.quizState.qIdx++;
            this.quizState.answered = false;
            this._renderQuiz();
          });
          feedback.appendChild(btn);
        }, 800);
      });
    });
  },

  /* ===== 测试完成 ===== */
  _finishQuiz() {
    const v = this._findVideo(this.currentVideoId);
    if (!v || !this.quizState) return;
    const total = v.quiz.length;
    const correct = this.quizState.correctCount;
    const passed = correct === total;  // 全对才算通过
    const contentEl = document.getElementById('mediaContent');
    contentEl.innerHTML = `
      <div class="quiz-result">
        <h3>测试结果</h3>
        <div class="score">${correct} / ${total}</div>
        <p style="margin:12px 0">
          ${passed ? '🎉 全对!本视频已标记完成' : '💪 继续努力,请重新观看后再试'}
        </p>
        <button class="btn primary" id="mediaResultBack" style="margin-top:12px">
          ${passed ? '返回列表' : '重新测试'}
        </button>
      </div>
    `;
    // 记录进度
    if (passed) {
      const p = EM.progress.get();
      if (!p.modules.media) p.modules.media = { completed: [], current: this.activeLevel };
      if (!p.modules.media.completed) p.modules.media.completed = [];
      if (!p.modules.media.completed.includes(v.id)) {
        p.modules.media.completed.push(v.id);
        EM.progress.save(p);
      }
      // 学生模型 + XP
      EM.student.record('listening', 70, 1);
      EM.achieve.addXP(EM.achieve.XP.listen, '音视频课');
      EM.achieve.check();
    }
    document.getElementById('mediaResultBack').addEventListener('click', () => {
      if (passed) {
        this.view = 'list';
        this.currentVideoId = null;
        this._renderShell();
      } else {
        this._startQuiz();
      }
    });
  },

  /* ===== 辅助函数 ===== */
  _levelExists(level) {
    return (this.data.levels || []).some(lv => lv.level === level);
  },
  _getLevel(level) {
    return (this.data.levels || []).find(lv => lv.level === level);
  },
  _findVideo(id) {
    for (const lv of (this.data.levels || [])) {
      const v = lv.videos.find(x => x.id === id);
      if (v) return v;
    }
    return null;
  },
  _countDoneInLevel(level) {
    const lv = this._getLevel(level);
    if (!lv) return 0;
    const p = EM.progress.get();
    const completed = (p.modules.media && p.modules.media.completed) || [];
    return lv.videos.filter(v => completed.includes(v.id)).length;
  },
  _saveCurrent() {
    const p = EM.progress.get();
    if (!p.modules.media) p.modules.media = { completed: [], current: 1 };
    p.modules.media.current = this.activeLevel;
    EM.progress.save(p);
  }
};

EM.registerModule('media', EM.media);
