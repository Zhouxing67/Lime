# PDF 白盒闪烁 —— IntersectionObserver root + rootMargin + 占位高度

## 症状
PDF 翻页时页面下方**白盒闪烁**（新页首次进入视口时占位空白 → canvas 渲染完成前暴露）。

## 三轮根因
| 轮 | 假设 | 真相 |
|---|---|---|
| 1 | 渲染太慢（`render done` 28–117ms）| 不是——快得足以进视口前完成 |
| 2 | rootMargin 不够（1600→3000px）| 无效——**观察器 root 缺省为 document viewport**，3000px 从视口测而非滚动容器可见区 |
| 3 | 占位高度比例错 | **占位 = `paneW × aspect`（全宽）但实际渲染 = `paneW × 0.75 × aspect`（阅读列 75%）→ 占位比实际高 33%** → 每页底部白色悬空 |

## 修复
1. `IntersectionObserver` 的 **root 显式指定滚动容器**（`[data-pdf-scroll]`）——前瞻从真实可见区测量
2. 占位高度 = `paneW × PAGE_RATIO × zoom × aspect`（精确匹配实际渲染）

## 通用教训
- **IntersectionObserver 不指定 root 时以 viewport 为基准**——在滚动容器内做 lazy render 必须显式 `root`
- 占位尺寸必须与**实际渲染尺寸逐像素一致**（比例、缩放都要算进去），否则惰性渲染暴露占位
- 排障用 `[lime:flash]` 日志打点（observer→computeSize→render done）区分"没渲染"vs"渲染慢"vs"尺寸不符"
