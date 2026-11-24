# Google site: 收录导出 CSV

一个 Chrome 浏览器插件：在 Google 的 `site:` 搜索结果页加一个「导出收录」按钮，自动逐页翻页，抓取目标网站被 Google 实际收录的页面 **标题 / 描述 / URL**，最后合并导出成一个 CSV 文件。

导出的数据可以直接交给 Claude、ChatGPT 等 AI，分析目标网站不同页面的关键词布局和排词策略。

## 功能

- 在 `site:域名` 的搜索结果页，"About xx results" 旁边会出现「导出收录」按钮
- 自动逐页翻页抓取，每页间隔随机几秒，降低触发人机验证的概率
- 遇到 Google 人机验证会暂停，你手动完成验证后自动继续
- 进度面板可以随时「停止并导出」已抓到的数据，或取消任务
- 标签页意外关闭后，再打开 Google 会提示继续未完成的任务
- 自动去掉 Google 跳转链接和 `#:~:text=` 高亮片段，只保留真实 URL，并按 URL 去重
- CSV 带 UTF-8 BOM，用 Excel 直接打开中文不会乱码
- 支持所有国家和地区的 Google 域名（google.com、google.com.hk、google.co.jp、google.de 等）

## 安装

插件还没有上架 Chrome 应用商店，需要手动加载：

1. 下载本仓库（`git clone`，或点 Code → Download ZIP 后解压）
2. Chrome 地址栏打开 `chrome://extensions`，打开右上角的「开发者模式」
3. 点「加载已解压的扩展程序」，选择本仓库所在的文件夹

Edge 等 Chromium 内核浏览器同样可以用，Edge 的扩展页地址是 `edge://extensions`。

> 如果你之前装过油猴脚本版本，请先在油猴里把它关掉，否则页面上会出现两个按钮。

## 使用

1. 在 Google 搜索 `site:example.com`
2. 点结果数旁边的「导出收录」按钮，确认后开始抓取
3. 抓取过程中不要关闭这个标签页。右上角面板会显示进度
4. 抓取完成后会自动下载 `google_site_example.com_日期_时间.csv`

CSV 有三列：

| 标题 | 描述 | URL |
| --- | --- | --- |
| TrueFiler: Online Pakistani ... | 4 days ago — TrueFiler is an ... | https://www.toolify.ai/tool/truefiler |

## 设置

点浏览器工具栏上的插件图标，打开设置弹窗：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 翻页间隔（秒） | 3 ~ 7 | 每翻一页在这个区间里随机等待。间隔越长，越不容易触发人机验证 |
| 最多翻几页 | 50 | 每页约 10 条。Google 通常最多只给到三四十页 |
| 包含 Google 省略的相似结果 | 开 | 翻页时带上 `filter=0`，能多抓到一些相似度高的页面 |

设置保存在 Chrome 的同步存储里，导出进行中修改的话，从下一页开始生效。

## 注意事项

- Google 显示的 "About xx results" 只是估算值，实际能翻到的结果通常远少于这个数字，导出条数比它少是正常的
- 抓取速度太快容易触发人机验证，频繁出现时可以把翻页间隔调大
- 插件只读取 Google 搜索结果页面，不会把任何数据发送到其他地方

## 文件结构

```
├── manifest.json   插件配置（Manifest V3）
├── content.js      在 Google 搜索页运行：注入按钮、翻页抓取、导出 CSV
├── settings.js     设置的默认值和读写，content.js 和弹窗共用
├── popup.html      设置弹窗
├── popup.js
└── icons/          插件图标
```
