# 扩展内存过大 —— PDF canvas 画布是元凶

## 症状
扩展占用内存过大（打开几个 PDF + 切换视图后，浏览器任务管理器显示数百 MB 甚至 1GB+）。

## 根因
**canvas 画布尺寸 = `wh.w × dpr × wh.h × dpr × 4字节`**——27" 适应宽度下页面 canvas 可达 3000×4245 ≈ **12.7M 像素 ≈ 50MB/页**：
1. **keep-alive（最多 4 个 PDF）**：每个打开的 PdfView 保持挂载（display:none），已渲染的 canvas 全部留存 → 3/4 的 canvas 属于非激活 PDF
2. **滚动过的页面只增不释放**：惰性渲染只画近视口页，但滚过的 canvas 全留着 → 大 PDF 越滚越大

## 修复（两级释放）
| 级 | 做法 | 效果 |
|---|---|---|
| **P1 · 隐藏 PdfView 释放** | 渲染 effect 检测 `paneW <= 0`（display:none 容器宽 0）→ `canvas.width = 0` 释放 + 返回 | 非激活 PDF 的 canvas 全部释放（省 3/4），滚动/状态/doc 保留 |
| **P2 · 滚出视口释放** | IntersectionObserver 保留连接（不再 disconnect），页面离开预渲染边距（isIntersecting false）→ 释放 canvas；滚回时重渲染 | 内存限定到可见页附近（~2-3 页 × 50MB）|

```ts
// P1：隐藏 PdfView（display:none → paneW 0）释放 canvas
if (paneW <= 0) {
  const c = holder.querySelector("canvas")
  if (c && c.width > 0) { c.width = 0; c.height = 0 }
  return
}
// P2：离开边距释放
else { /* observer callback */ const c = ...; if (c.width > 0) { c.width = 0; c.height = 0 } }
```

## 权衡
- 隐藏 PDF 重新激活 → 可见页 ~200ms 重渲染（滚动/搜索/回跳状态保留）
- 滚回远页 → 短暂占位后重渲染
- keep-alive 的 pdf.js **doc 保留**（激活快），只丢 canvas（canvas 是内存大头）

## 通用教训
- **canvas 是隐形的内存黑洞**：`canvas.width = N` 立即分配 `N × 像素格式字节`——必须主动管理生命周期
- **DOM 元素"看不见"≠"不占内存"**：display:none 的组件仍持有画布/纹理
- **惰性渲染只解决绘制，不解决内存**——要配"滚出即释放"的对称机制
- 量化内存：先算 `wh × dpr × 4B` 的单页成本，再乘保留页数，定位主导项
