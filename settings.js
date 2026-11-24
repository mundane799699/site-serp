// 插件页面脚本（content.js）和设置弹窗（popup.js）共用的配置读写
// 存在 chrome.storage.sync 里，登录同一个 Chrome 账号的设备会同步设置
var GSX_SETTINGS_KEY = 'gsx_settings_v1';

var GSX_DEFAULTS = {
  includeOmitted: true,   // 翻页时带 filter=0，把 Google “省略的相似结果”也抓进来
  delayMin: 3,            // 翻页最小间隔（秒）
  delayMax: 7,            // 翻页最大间隔（秒）
  maxPages: 50,           // 最多翻多少页（安全上限）
};

// 把任意输入整理成合法设置
function gsxNormalizeSettings(s) {
  s = Object.assign({}, GSX_DEFAULTS, s || {});
  const num = (v, def, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const delayMin = num(s.delayMin, GSX_DEFAULTS.delayMin, 1, 120);
  return {
    includeOmitted: !!s.includeOmitted,
    delayMin,
    delayMax: num(s.delayMax, GSX_DEFAULTS.delayMax, delayMin, 300),
    maxPages: Math.round(num(s.maxPages, GSX_DEFAULTS.maxPages, 1, 100)),
  };
}

async function gsxLoadSettings() {
  try {
    const r = await chrome.storage.sync.get(GSX_SETTINGS_KEY);
    return gsxNormalizeSettings(r[GSX_SETTINGS_KEY]);
  } catch (e) {
    return gsxNormalizeSettings(null);
  }
}

async function gsxSaveSettings(s) {
  const clean = gsxNormalizeSettings(s);
  await chrome.storage.sync.set({ [GSX_SETTINGS_KEY]: clean });
  return clean;
}
