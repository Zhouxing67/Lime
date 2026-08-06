# PDF 交互卡顿 —— 重渲染风暴的三次溯源

## 症状
1. **拖动侧栏/面板卡顿**：每帧触发 PDF 区重渲染
2. **批注回跳卡顿 + 两段跳**：flash 触发整页 canvas 重渲染

## 根因 1：拖动 → 每帧重渲染风暴
```
拖动（pointermove，60fps）
  → onWidthChange → 宽度 state（每帧）
  → 布局重排 → PDF 容器宽度变化
  → ResizeObserver → setPaneW（每帧）
  → PageView effect 重跑 → computeSize + pdf.js 渲染（每帧全波）
```
每个 pointermove 都触发一浪 pdf.js 重渲染 → 拖动卡顿。

**修复**：ResizeObserver 的 `setPaneW/setPaneH` 加 **100ms trailing 防抖**——连续拖动不触发（布局跟手），停顿后一次重渲染。

## 根因 2：flash 触发整页重渲染（两段跳）
```
flashTarget → navigateTo(页滚动) + setFlashAnnId
  → flashAnnId 在渲染 effect deps → 整页 canvas + textLayer 重渲染（~200-300ms）
  → 重渲染完才居中 → "先到页，再居中"两段跳 + 卡顿
```
**修复**（flash 与渲染解耦）：
- 渲染 effect **去掉 flashAnnId deps** + 加 `ready` 状态（textLayer 构建完成）
- 独立 **flash effect**（`flashAnnId + ready`）：用已建 textLayer 直接算批注位置 → **立即滚动居中 + 画 flash**（零 canvas 重渲染）
- 已渲染页：navigateTo 的页滚动与 flash 的批注滚动同帧合并 → **单段直达**

## 通用教训
- **状态变更触发重型异步渲染前，先想"这个变更真的需要重渲染吗"**——把轻量叠加（flash/搜索高亮）从重型渲染（canvas/textLayer）中拆出
- **防抖是"每帧状态变化"场景的默认解**：布局跟手 + 重渲染收敛到停顿后
- 分三层追踪卡顿：**状态是否更新** → **effect 是否重跑** → **重渲染成本多大**——用日志区分（`[lime:size]`/`[lime:flash]`）
- 两段跳 = 两次滚动在**不同帧**（异步渲染间隔）；同一帧内合并则感知为单次
