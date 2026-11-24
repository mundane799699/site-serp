(function () {
  'use strict';

  // ================= 配置 =================
  // 翻页间隔、最多页数等在插件设置弹窗里调整，见 settings.js
  let CFG = gsxNormalizeSettings(null);
  const STALE_MS = 60 * 60 * 1000;        // 任务超过 1 小时没动静，就不自动继续，改为询问

  const KEY = 'gsx_job_v1';
  const BTN_ID = 'gsx-export-btn';
  const PANEL_ID = 'gsx-panel';

  // ================= 工具函数 =================
  const txt = el => (el ? (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getParam = name => new URL(location.href).searchParams.get(name);
  const normQ = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // 用 chrome.storage.local 保存任务状态（异步），跨页面跳转保留
  const loadJob = async () => {
    try { const r = await chrome.storage.local.get(KEY); return r[KEY] || null; } catch (e) { return null; }
  };
  const saveJob = async job => { job.updatedAt = Date.now(); await chrome.storage.local.set({ [KEY]: job }); };
  const clearJob = () => chrome.storage.local.remove(KEY);

  const isSorryPage = () => location.pathname.startsWith('/sorry');
  const currentQuery = () => (getParam('q') || '').trim();
  const isSiteSearch = () => location.pathname === '/search' && /^site:/i.test(currentQuery());

  function hasCaptcha() {
    return isSorryPage() ||
      !!document.querySelector('#captcha-form, form[action*="/sorry"], iframe[src*="recaptcha"]');
  }

  function buildUrl(job, start) {
    const u = new URL('/search', job.origin);
    u.searchParams.set('q', job.query);
    Object.entries(job.keep || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    if (CFG.includeOmitted) u.searchParams.set('filter', '0');
    if (start > 0) u.searchParams.set('start', String(start));
    return u.toString();
  }

  // ================= 结果数量 =================
  function getCount() {
    const el = document.querySelector('.aitdk-search-result-count-value');
    if (el) {
      const n = parseInt(txt(el).replace(/[^\d]/g, ''), 10);
      if (n) return n;
    }
    const rs = document.querySelector('#result-stats');
    if (rs) {
      const m = txt(rs).replace(/(\d)[,.\s](?=\d{3}\b)/g, '$1').match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }

  // ================= 抓取当前页 =================
  function cleanUrl(href) {
    try {
      let u = new URL(href, location.href);
      if (/(^|\.)google\./.test(u.hostname) && u.pathname === '/url') {
        const real = u.searchParams.get('q') || u.searchParams.get('url');
        if (real) u = new URL(real);
      }
      if (u.hash.startsWith('#:~:')) u.hash = '';   // 去掉 #:~:text= 高亮片段
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  function scrapePage() {
    const root = document.querySelector('#rso') || document.querySelector('#search') || document.body;
    const out = [];
    const seen = new Set();

    for (const h3 of root.querySelectorAll('h3')) {
      // 跳过“相关问题”等模块
      if (h3.closest('[data-initq], .related-question-pair, g-accordion-expander')) continue;

      const a = h3.closest('a[href]') || (h3.parentElement && h3.parentElement.querySelector('a[href]'));
      if (!a) continue;
      const url = cleanUrl(a.getAttribute('href'));
      let host;
      try { host = new URL(url).hostname; } catch (e) { continue; }
      if (!/^https?:/i.test(url) || /(^|\.)google\./i.test(host)) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      // 找到这一条结果的容器（向上爬到只包含这一个 h3 的最大祖先）
      let box = h3;
      while (box.parentElement && box.parentElement !== root &&
             box.parentElement.querySelectorAll('h3').length === 1) {
        box = box.parentElement;
      }

      let desc = '';
      const descEl = box.querySelector('.VwiC3b, [data-sncf="1"], [style*="line-clamp"]');
      if (descEl) {
        const c = descEl.cloneNode(true);
        c.querySelectorAll('a.vzmbzf').forEach(x => x.remove());          // 去掉 “Read more”
        c.querySelectorAll('a').forEach(x => {
          if (/^(read more|阅读更多|更多)$/i.test(txt(x))) x.remove();
        });
        desc = txt(c);
      }

      out.push({ title: txt(h3), desc, url });
    }
    return out;
  }

  // ================= 导出 CSV =================
  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV(job) {
    const rows = [['标题', '描述', 'URL']].concat(job.results.map(r => [r.title, r.desc, r.url]));
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });

    const name = job.query.replace(/^site:/i, '').replace(/[\\/:*?"<>|\s]+/g, '_') || 'site';
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `google_site_${name}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ================= 浮动进度面板（不用 innerHTML，兼容 Google 的 Trusted Types） =================
  function mkBtn(label, primary) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = [
      'padding:5px 12px', 'border-radius:6px', 'cursor:pointer', 'font-size:13px',
      primary ? 'background:#1a73e8;color:#fff;border:1px solid #1a73e8'
              : 'background:#fff;color:#1a73e8;border:1px solid #dadce0',
    ].join(';');
    return b;
  }

  function ensurePanel() {
    let p = document.getElementById(PANEL_ID);
    if (p) return p;
    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647', 'width:320px',
      'padding:12px 14px', 'background:#fff', 'color:#202124', 'border:1px solid #dadce0',
      'border-radius:10px', 'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      'font:13px/1.6 Arial,"Microsoft YaHei",sans-serif',
    ].join(';');
    const title = document.createElement('div');
    title.textContent = 'Google 收录导出';
    title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:6px';
    const msg = document.createElement('div');
    msg.className = 'gsx-msg';
    msg.style.whiteSpace = 'pre-line';
    const btns = document.createElement('div');
    btns.className = 'gsx-btns';
    btns.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap';
    p.append(title, msg, btns);
    document.body.appendChild(p);
    return p;
  }

  function setPanel(message, buttons) {
    const p = ensurePanel();
    p.querySelector('.gsx-msg').textContent = message;
    if (buttons) {
      const box = p.querySelector('.gsx-btns');
      box.replaceChildren();
      buttons.forEach(([label, fn, primary]) => {
        const b = mkBtn(label, primary);
        b.addEventListener('click', fn);
        box.appendChild(b);
      });
    }
  }

  const closePanel = () => { const p = document.getElementById(PANEL_ID); if (p) p.remove(); };

  async function stopAndExport() {
    const j = await loadJob();
    await clearJob();
    if (j && j.results.length) {
      exportCSV(j);
      setPanel(`已停止，并导出了已收集的 ${j.results.length} 条结果。`, [['关闭', closePanel]]);
    } else {
      setPanel('已停止，还没有收集到任何结果。', [['关闭', closePanel]]);
    }
  }

  async function cancelJob() {
    if (!confirm('确定取消任务吗？已收集的数据会被丢弃。')) return;
    await clearJob();
    closePanel();
  }

  const runningButtons = () => [['停止并导出', stopAndExport, true], ['取消任务', cancelJob]];

  // ================= 等待结果加载（遇到人机验证就一直等） =================
  async function waitForResults() {
    const t0 = Date.now();
    while (true) {
      if (!(await loadJob())) return false;                       // 任务被停止了
      if (hasCaptcha()) {
        setPanel('检测到人机验证，请在页面上手动完成验证。\n验证通过后会自动继续导出…', runningButtons());
        await sleep(2000);
        continue;
      }
      const root = document.querySelector('#search');
      if (root && root.querySelector('h3')) {
        await sleep(800);                                 // 再等一下，让页面渲染完整
        return true;
      }
      if (Date.now() - t0 > 12000) return false;          // 超时：认为这一页没有结果了
      await sleep(500);
    }
  }

  // ================= 执行一步：抓当前页 → 翻下一页 =================
  async function runStep() {
    let job = await loadJob();
    setPanel(`正在抓取第 ${job.pages + 1} 页…\n查询：${job.query}\n已收集 ${job.results.length} 条（预计约 ${job.expected || '未知'} 条）`,
      runningButtons());

    const ok = await waitForResults();
    const items = ok ? scrapePage() : [];

    job = await loadJob();                                // 重新读取，防止期间被停止
    if (!job || !job.running) return;

    const seen = new Set(job.results.map(r => r.url));
    let added = 0;
    for (const it of items) {
      if (!seen.has(it.url)) { seen.add(it.url); job.results.push(it); added++; }
    }
    job.pages++;
    const curStart = parseInt(getParam('start') || '0', 10) || 0;
    job.nextStart = curStart + 10;
    await saveJob(job);

    const hasNext = !!document.querySelector('a#pnnext, a[aria-label="Next page"], a[aria-label="下一页"]');
    const goOn = added > 0 &&
                 job.pages < CFG.maxPages &&
                 (hasNext || !job.expected || job.results.length < job.expected);

    if (!goOn) {
      exportCSV(job);
      await clearJob();
      setPanel(`✅ 导出完成！\n共 ${job.pages} 页，${job.results.length} 条结果。\n（预计约 ${job.expected || '未知'} 条）`, [['关闭', closePanel, true]]);
      return;
    }

    const delay = Math.round((CFG.delayMin + Math.random() * (CFG.delayMax - CFG.delayMin)) * 1000);
    setPanel(`第 ${job.pages} 页完成，本页新增 ${added} 条，共 ${job.results.length} 条。\n${Math.round(delay / 1000)} 秒后翻到下一页…`,
      runningButtons());
    await sleep(delay);

    const latest = await loadJob();
    if (!latest || !latest.running) return;
    location.href = buildUrl(latest, latest.nextStart);
  }

  // ================= 导出按钮 =================
  async function onExportClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const existing = await loadJob();
    if (existing && existing.running) {
      alert('已经有一个导出任务正在进行中。');
      return;
    }
    const count = getCount();
    const pages = count ? Math.ceil(count / 10) : '未知';
    const ok = confirm(
      `当前查询：${currentQuery()}\n` +
      `共约 ${count || '未知'} 条结果（约 ${pages} 页）\n` +
      `当前设置：最多抓 ${CFG.maxPages} 页，每页间隔 ${CFG.delayMin}~${CFG.delayMax} 秒\n\n` +
      `确定开始导出吗？\n` +
      `· 脚本会自动逐页翻页抓取，期间请不要关闭此标签页\n` +
      `· 如果出现人机验证，请手动完成，完成后会自动继续`
    );
    if (!ok) return;

    const keep = {};
    ['hl', 'gl', 'safe', 'tbs', 'lr', 'cr'].forEach(k => { const v = getParam(k); if (v) keep[k] = v; });

    const job = {
      running: true,
      query: currentQuery(),
      origin: location.origin,
      keep,
      expected: count,
      pages: 0,
      nextStart: 0,
      results: [],
    };
    await saveJob(job);
    location.href = buildUrl(job, 0);                      // 从第 1 页开始
  }

  function injectButton() {
    if (!isSiteSearch()) return;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.textContent = '导出收录';
      btn.style.cssText = [
        'display:inline-flex', 'align-items:center', 'margin-left:10px', 'padding:2px 10px',
        'height:24px', 'font-size:13px', 'line-height:1', 'white-space:nowrap', 'cursor:pointer',
        'color:#fff', 'background:#1a73e8', 'border:1px solid #1a73e8', 'border-radius:6px',
        'vertical-align:middle',
      ].join(';');
      btn.addEventListener('click', onExportClick);
    }

    const countEl = document.querySelector('.aitdk-search-result-count-value');
    let anchor = countEl ? countEl.parentElement : document.querySelector('#result-stats');
    if (anchor && anchor.offsetParent === null) anchor = null;   // 不可见就不挂

    if (anchor) {
      if (btn.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', btn);
      btn.style.position = '';
      btn.style.top = btn.style.right = btn.style.zIndex = '';
    } else if (!btn.isConnected) {
      // 找不到 “About xx results” 时，先浮动在右上角
      Object.assign(btn.style, { position: 'fixed', top: '90px', right: '24px', zIndex: 2147483646 });
      document.body.appendChild(btn);
    }
  }

  // ================= 入口 =================
  async function main() {
    CFG = await gsxLoadSettings();
    const job = await loadJob();

    if (job && job.running) {
      if (isSorryPage()) {
        setPanel(`检测到 Google 人机验证。\n请在本页完成验证，通过后会自动回到搜索结果并继续导出。\n当前已收集 ${job.results.length} 条。`,
          runningButtons());
        return;
      }
      const fresh = Date.now() - (job.updatedAt || 0) < STALE_MS;
      if (location.pathname === '/search' && normQ(currentQuery()) === normQ(job.query) && fresh) {
        runStep();
      } else {
        setPanel(`有一个未完成的导出任务：\n${job.query}\n已收集 ${job.results.length} 条（${job.pages} 页）。`, [
          ['继续', async () => { await saveJob(job); location.href = buildUrl(job, job.nextStart); }, true],
          ['导出已收集', stopAndExport],
          ['取消任务', cancelJob],
        ]);
      }
    }

    if (isSiteSearch()) {
      injectButton();
      let timer = null;
      new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => { timer = null; injectButton(); }, 400);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  main();
})();