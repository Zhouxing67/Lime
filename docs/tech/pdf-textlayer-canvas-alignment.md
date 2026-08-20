# PDF TextLayer ↔ Canvas 对齐：盒模型污染导致的系统性漂移

> 记录日期：2026-08-20。适用架构：MUI `CssBaseline` + pdf.js 官方 `PDFViewer/PDFPageView` + 自定义选区/搜索 overlay + Konva 批注层。

## 现象

PDF 的黑色可见文字由 canvas 绘制；透明 TextLayer 负责搜索、复制和选区。当两层不重合时，会同时出现：

- 浏览器原生搜索框与目标文字错位；
- 自绘选区准确贴合 TextLayer，却相对 canvas 漂移；
- 根据文字选区创建的 Konva 批注落点偏移；
- 偏移越靠页面右侧/底部越明显，容易误判成字符 offset、字体 ascent 或缩放算法错误；
- 整体交互显得“不清晰、不精确”，尽管 canvas bitmap 本身可能足够清晰。

该问题的关键特征是：选区、搜索和批注彼此一致，但都与黑色 canvas 文字不一致。这时不要继续修选区算法，应先验证 TextLayer 与 canvas 的基础坐标系。

## PDF 页面的三套几何

```text
.page（pdf.js 页面盒）
├── .canvasWrapper > canvas     黑色可见内容
├── .textLayer                  透明文字、搜索、复制、Range
└── painter wrapper / Konva     持久批注
```

正确不变量：

```text
canvas CSS rect ≈ TextLayer rect ≈ page content rect
```

允许亚像素舍入误差，通常应小于 `1px`。不能只比较 `.page.getBoundingClientRect()`，因为 pdf.js 的页面还带有透明边框。

## 真实浏览器诊断层

`src/components/pdfEngine/usePdfGeometryDiagnostics.ts` 暴露只读诊断 API。重新加载扩展并打开 PDF 后，在页面 DevTools Console 执行：

```js
window.__limePdfGeometry.enable()
```

效果：TextLayer 文字显示为半透明红色，canvas 仍为黑色。红黑重影可以直接显示两层误差。

其他命令：

```js
window.__limePdfGeometry.enable({ dimCanvas: true, outlineSpans: true })
window.__limePdfGeometry.report(2)
window.__limePdfGeometry.inspectSelection()
window.__limePdfGeometry.disable()
```

`report()` 输出 page content、TextLayer、canvas CSS rect、viewport、DPR、canvas bitmap 和字体加载状态。判断顺序：

1. TextLayer/canvas 外框尺寸不同：先查盒模型和 viewport。
2. 外框一致但所有文字固定平移：查原点、border/padding、transform-origin。
3. 外框一致但误差随缩放增长：查重复 scale 或不同 viewport。
4. 只有特定字体/文本项错位：查字体加载、fallback、ascent、`scaleX`。
5. canvas bitmap/CSS 比例低于 DPR：这是 canvas 清晰度问题，与 TextLayer 坐标问题分开处理。

## 本次证据

问题页在 133% 缩放下输出：

```text
pageContent  1369 × 1935
canvas       1368.67 × 1934.67
textLayer    1386 × 1952
```

字体诊断同时显示 `monospace`、`sans-serif`、`serif` 均 `loaded: true`。

因此：

- canvas 与 page content 一致；
- TextLayer 在宽、高方向都多约 `17px`；
- `17px` 接近 pdf.js 页面透明边框两侧总和（约 `9px × 2`）；
- 误差是尺寸比例差，而非字体未加载；
- 比例差会使偏移随页面坐标累积，完全符合截图表现。

## 根因

MUI `CssBaseline` 会全局注入：

```css
*, *::before, *::after {
  box-sizing: inherit;
}

html {
  box-sizing: border-box;
}
```

pdf.js 官方 viewer 的 `.page` 则按 `content-box` 设计：viewport 宽高是内容区尺寸，页面外另有约 9px 透明边框。

全局 `border-box` 污染 `.page` 后，声明的 viewport 宽高包含了边框：

- canvas 被压缩到扣除边框后的内容区；
- TextLayer 仍按完整 viewport 尺寸生成；
- 两层宽高相差约 18px；
- 左上角可能近似重合，但误差向右、向下逐渐增大。

这类问题看起来像复杂的 PDF 字体/Range bug，实质是宿主 UI 框架改变了第三方 viewer 的盒模型契约。

## 修复

`PdfEngineView` 加载官方 viewer CSS 后，必须在其作用域内恢复：

```css
.pdfViewer .page {
  box-sizing: content-box;
}
```

不要全局修改 MUI 的盒模型；只隔离 pdf.js 页面节点。

扩展 CSP 仍应允许 pdf.js 字体来源：

```text
font-src 'self' ... data: blob:
```

字体加载与盒模型是两个独立检查项。本次 `loaded: true` 证明字体并非主要根因，但 CSP 约束仍需保留，避免其他 PDF 回退字体。

## 为什么此前修选区没有根治

选区、搜索和批注都以 TextLayer 为几何真相。即使字符 offset、局部 Range、行合并和 Konva 转换全部正确，它们也只能准确落在错误尺寸的 TextLayer 上。

因此修复顺序必须是：

```text
page/canvas/TextLayer 基础几何
→ TextLayer 字体与字符映射
→ 选区/搜索 Range
→ Konva 坐标和持久化
```

底层坐标系未验证前，不应在上层添加经验偏移或缩放补偿；这种补偿会随缩放、页尺寸和设备 DPR 失效。

## 回归清单

涉及 MUI、CssBaseline、pdf.js、viewer CSS、页面容器或缩放逻辑的改动后，至少验证：

- [ ] `.pdfViewer .page` 的 computed `box-sizing` 为 `content-box`；
- [ ] `abs(textLayer.width - canvas.width) < 1px`；
- [ ] `abs(textLayer.height - canvas.height) < 1px`；
- [ ] 100%、133%、200% 三档缩放下红黑基线一致；
- [ ] 页面左上、右下、多栏正文均不产生累积漂移；
- [ ] 浏览器原生搜索与目标词重合；
- [ ] 自绘选区、搜索 overlay、新建高亮/下划线/删除线均重合；
- [ ] `canvasBitmap / canvasCssRect ≈ devicePixelRatio`，单独确认清晰度；
- [ ] 内嵌字体和标准字体的诊断项均为 `loaded: true`；
- [ ] 混合页尺寸、旋转页和高 DPR 屏幕无回归。

## 可复用经验

集成带官方 CSS 契约的复杂组件时，宿主应用的全局 reset/CssBaseline 本身就是依赖。尤其要审计：

- `box-sizing`；
- `line-height`；
- `font`/`font-family`；
- `transform`/`zoom`；
- `position`/`inset`；
- `overflow`；
- CSS custom properties。

当两个渲染层“左上角接近、右下角越来越偏”时，优先比较外框宽高和盒模型，而不是先怀疑字符索引。
