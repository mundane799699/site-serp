const $ = id => document.getElementById(id);

function fill(s) {
  $('delayMin').value = s.delayMin;
  $('delayMax').value = s.delayMax;
  $('maxPages').value = s.maxPages;
  $('includeOmitted').checked = s.includeOmitted;
}

function flash(msg) {
  $('status').textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { $('status').textContent = ''; }, 2500);
}

$('save').addEventListener('click', async () => {
  const saved = await gsxSaveSettings({
    delayMin: $('delayMin').value,
    delayMax: $('delayMax').value,
    maxPages: $('maxPages').value,
    includeOmitted: $('includeOmitted').checked,
  });
  fill(saved);   // 显示整理后的值（比如最大间隔小于最小间隔时会被修正）
  flash('已保存，下一页开始生效');
});

$('reset').addEventListener('click', async () => {
  fill(await gsxSaveSettings(GSX_DEFAULTS));
  flash('已恢复默认设置');
});

gsxLoadSettings().then(fill);
