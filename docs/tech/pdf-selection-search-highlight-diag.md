# PDF 选区/搜索高亮 — R1 机制诊断对账表（2026-08-15）

目标：为「选区高亮断裂 + 搜索高亮偏移」反复不收敛的问题建立**实证根因清单**，避免再次盲修。
方法：不写产品代码，生成代表性 PDF fixtures + Node 诊断脚本，用**真实 pdf.js** 与**产品算法的忠实复刻**验证各机制。

产物：
- fixtures: `test/fixtures/pdf/fixture-{cjk-gbk,justify-latin,marked-content}.pdf`
- 诊断脚本: `test/fixtures/pdf/diag.mjs`（`node test/fixtures/pdf/diag.mjs`）
- 生成器: `gen_hand.py`（手写 PDF）、`gen_latin.mjs`（pdf-lib）

## 一、实测确认的机制（数据层 / 纯几何层）

### F4 🔴 引擎与搜索两侧 `getDocument` 参数不对称 → 整页文本缺失/错位
- 证据：对 `fixture-cjk-gbk.pdf`（Type0 CID 字体 STSong-Light，`/Encoding /GBK-EUC-H`，无 ToUnicode，无嵌入字体）——
  - **搜索侧**（`src/hooks/usePdfDocument.ts:53-58`，带 `cMapUrl/cMapPacked/standardFontDataUrl`）提取出完整中文：
    `第一章 概述本报告考察选区高亮与搜索偏移问题。…`
  - **引擎侧**（`src/pdf/inklayer/hooks/usePdfViewer.ts:152-161`，仅 `{data, disableRange}`）提取出**空字符串**。
- 后果：这类 PDF 在引擎侧文本层为空 → 搜索/选区/复制全部失效；即便部分 CID 字体能出字（有 ToUnicode 的），两侧文本也可能不一致 → offset 漂移。这正解释「有些 PDF 偏移、有些不偏移」——取决于该 PDF 是否需要外部 CMap。
- 修复轮次：**R2**（引擎 loading task 补 cMap 参数 + 搜索/引擎统一文档实例）。

### F2 🟠 `scanText` 的长度改变 case-fold → offset 漂移
- 证据：`pdfText.ts:96-97` 的 `toLowerCase()`。`İstanbul`（25 units）折叠后变 27 units（`İ`→`i̇` 两码元）→ `haystack` 索引相对原串 +1 → `offsetsToRange` 打到错误字符。
- 触发面：页内含 `İ` 等长度改变字符时整页后续命中整体偏移；拉丁文本不常见，但一旦出现即全局错。
- 修复轮次：**R2**（长度保持的折叠，或折叠索引→原索引映射）。

### F3 🟡 web-highlighter `<mark>` 瞬时包裹 → `offsetsToRange` 丢弃命中（非累计漂移）
- 证据：`<mark>` 包裹 span 文本后，`getTextDivs` 的叶子过滤与 `textContent` **仍正常**（累计偏移不受影响，已实证 PASS），但 `offsetsToRange`（`pdfText.ts:498-506`）要求 `divs[i].firstChild` 是文本节点 → 变成 `<mark>` 元素 → **该命中直接返回 null 不绘制**。
- 结论修正：原假设「mark 造成累计漂移」不成立；真实失效是批注创建瞬间的命中丢失（瞬时、偶发）。
- 修复轮次：**R3**（改 CSS Highlight API 后不再手算 Range → 该路径整体消失）。

### 批注断裂 🟠 持久高亮（Konva）一条行拆成 N 个矩形
- 证据：`mergeSpanRectsByRow`（`editor_highlight.ts:82-134`，`MERGE_GAP=4px`）对同一视觉行、词间距 24px 的 4 个词盒 → 输出 **4 个 Konva Rect**（`[x=60,w=150] [x=234,w=12] [x=276,w=9] [x=307,w=24]`）。
- 后果：justify 排版 PDF 上持久高亮「断裂」。fixture `fixture-justify-latin.pdf` 第一列中段即有词间距 >20px 的行。
- 修复轮次：**R4**（行盒语义合并：以紧 em 盒 + 行内合并至行盒右缘；只影响新建批注几何）。

### 召回 🟠 连字/智能引号对 raw `indexOf` 不可见
- 证据：`Efﬁcient oﬃcial facilities` 搜 `fi` → MISS。`fixture-justify-latin.pdf` 第 2 页（DejaVu 嵌入，fontkit GSUB 真实连字替换）：`fi` 有 5 处普通命中（Helvetica 控制行）但 6 个连字词全部不可搜。
- 修复轮次：**R4（条件轮）**（移植官方 `normalize()` 折叠 + diff 回映射）。

## 二、代码级确认的机制（需浏览器实测复现）

| # | 机制 | 位置 | 表现 | 轮次 |
|---|---|---|---|---|
| S2/S3 | `elementFromPoint` 落空 → 回退带行距 raw rect → 相邻行垂直重叠 → `mergeRects` 并成一块 | `PdfEngineView.tsx:734-751`、`pdfText.ts:445-467` | 跨行选区粘成色块 | R3（Highlight API 消灭手算） |
| S4 | 同行合并容差 6px < justify 词间距 | `pdfText.ts:467` | 行内碎片 | R3 |
| S5 | 命中 `markedContent` 包装 span（height:0）→ 片段丢弃 | `pdfText.ts:461`、`pdf_viewer.css:265-266` | 片段缺失 | R3（fixture-marked-content.pdf 供实测） |
| S6 | 选区 overlay 无 scalechanging/textlayerrendered 重算 | `PdfEngineView.tsx:758-801` | 缩放后选区错位 | R3（原生自动跟随） |
| S7 | 页 div 重建后 overlay 脱管 | `PdfEngineView.tsx:681-689` | 高亮消失 | R3 |
| F1 | 选区和搜索共用 overlay div，选择即抹掉搜索高亮 | `PdfEngineView.tsx:674-704` | 搜索高亮被选区清空 | R3（具名 Highlight 独立层） |
| F6 | 目标页未渲染时 searchFlash 先到 → 空 overlay | `PdfEngineView.tsx:834-846` | 命中不显示 | R3（DOM 内高亮随渲染自动出现） |

## 三、浏览器验证清单（你在真实扩展中执行）

打开 `test/fixtures/pdf/` 下三个文件（放入已同步/导入的 PDF 后）：

1. **fixture-cjk-gbk.pdf** — 预期：页面文字不渲染（非嵌入字体）但可选中/搜索；**验证搜索「选区高亮」「搜索偏移」是否出结果**。若整页搜不到任何词 = F4 实锤（引擎侧文本层为空）。
2. **fixture-justify-latin.pdf**
   - 第 1 页：拖选「antidisestablishmentarianism is a gap」整行 → 观察拖选高亮是否碎成多个色块（S4）；用高亮工具画这条 → 观察持久批注是否 4 段（批注断裂）。
   - 第 2 页：搜索 `fi` → 应只命中底部 Helvetica 控制行，6 个连字词全部 MISS（召回）。
3. **fixture-marked-content.pdf** — 拖选跨过 marked 段 → 观察是否有片段缺失（S5）。

## 四、附带发现（与高亮无关，记录备用）

- 引擎与搜索**同一 PDF 被解析两次**（`usePdfDocument` + inklayer `usePdfViewer`），参数还不一致 → R2 顺带收敛为单实例。
- ~~`assets/pdfjs/pdf_viewer.mjs`（带 2 处本地补丁）是死代码~~ → **R5 已移除**：运行时 import 的是 npm `pdfjs-dist/legacy/web/pdf_viewer.mjs`（带补丁的 vendor 副本从不被加载）。已删 alias、copy 脚本补丁块与文件本体。
- `pdfText.ts` 死导出（`offsetsToRange`/`textLayerRects`/`findDivAtOffset`/`textWidth`/`clipDivText`/`mergeRectsSameLine`）→ **R5 已删除**（R3-REV 后无生产调用）。

## 五、R2/R3/R3-REV 结果（2026-08-15 追加）

### R2 — 数据层根修（已上线）
- 引擎 loading task（data/range/url 三分支）补 `cMapUrl/cMapPacked/standardFontDataUrl`，与搜索侧对齐。legacy build 实测：CID/GBK fixture 提取从空文本 → 完整中文。F4 消除。
- `scanText`/`searchPdfText` 用 `caseFoldPreserving`（长度保持折叠），消 F2 的 `İ` 类偏移。

### R3 → R3-REV — 渲染层路线修正
- **R3（CSS Custom Highlight API）被否决**：真实 Chromium 实证，pdf.js 文本层把每个 item 放进独立绝对定位 span，原生绘制（::selection / Highlight API）**按 span 逐块绘制、词间空隙不桥接** —— justify 大间距必「断裂」。原生绘制无法修复此问题。
- **R3-REV（最终形态）**：自绘 overlay + `highlightRectsForOffsets`（`pdfText.ts`）：char offset → 覆盖 span 子 range（`rangeForLocal` 穿透 `<mark>`）→ **按 em 盒分线 → 每线合并 [minX,maxX] 一个连续块**。选区/搜索同一管线、各自独立 overlay div（修 F1 互抹）。headless Chromium 实测：gap 行选区 → 单连续块（w:374 桥接 100px 空隙）；fi 搜索 → 紧贴 em 盒。断裂/偏移类修复落地。

### 「fi 偏移」为 fixture 伪影（非几何错误）
`fixture-justify-latin.pdf` 第 2 页控制行用**非嵌入 Helvetica**（pdf-lib 度量 ≠ 浏览器度量）→ pdf.js 对整行 span 施加 `scaleX(0.867)` 压缩，残余误差沿行向右累积（控制行 63 字符，最右端偏移 2-5px）。高亮精确贴合文本层字形；错位在**文本层↔canvas 字形**之间，属 pdf.js 对非嵌入标准字体的已知极限。真实 PDF（嵌入字体，scaleX≈1.0）无此现象。**结论：接受为 fixture 伪影，不做补偿。**
