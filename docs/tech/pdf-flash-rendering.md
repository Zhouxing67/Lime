# PDF 批注回跳高亮 —— 多层绘制问题（多轮排查）

## 症状（多轮）
1. 批注卡回跳原文时，提示高亮**只闪第一次/很弱**
2. 高亮**被原有批注覆盖**，看起来没生效
3. **只高亮第一行**（多行批注的其余行只显示原批注）
4. 跳转动画卡顿："**先到页，再居中**"两段跳

## 根因（每轮一个）
| 轮 | 根因 | 修复 |
|---|---|---|
| 1 | flash 画在 `.pdf-annotations` overlay 内，`replaceChildren()` 每次重绘重建 → **动画重启（闪两次）** | flash 移到独立层 `.pdf-ann-flash-layer`（holder 直接子级，不被清除）|
| 2 | 独立层 div **无 CSS**（静态 + z-auto）→ flash 落在 z2 批注**之下** → 被盖、观感弱 | 层加 `absolute + inset:0 + z-index:2` |
| 3 | flash **用 `rects[0]` 只画第一个矩形**——多行高亮 13 个 rect 只闪第一行（诊断日志：`rects 13` + `size 190×7.8px`）| **每个 rect 一个 flash 元素**（多行全覆盖）|
| 4 | 0.4 透明填充被低饱和批注色透出 → 看着像被盖 | 填充提到 0.55 + **2px inset 描边环** |
| 5 | flash 仍可能在层叠边缘 → 提到 **z-index 3**（高于批注层 2）| 最顶层 |
| 6 | 跳转卡顿：flashAnnId 在渲染 effect deps → **每次 flash 整页 canvas 重渲染**（~200-300ms）→ 居中延迟 → 两段跳 | **flash 与渲染解耦**：渲染 effect 去 flashAnnId + 独立 flash effect 用已建 textLayer 立即定位 |

## 通用教训
- **诊断日志是王道**：`[lime:flash] rects/size/z-index` 一次定位"没画 / 画错位置 / 层叠错"
- **CSS 层叠三要素都验证**：元素存在、尺寸正确、`getComputedStyle` 的 z-index 实际生效
- **多矩形对象**（高亮/选区）必须**逐矩形绘制**——只取 `[0]` 是经典 off-by-one 视觉 bug
- **临时提示不得触发重型重渲染**（canvas/textLayer）——拆独立 effect + 复用已建 DOM
- 视觉问题先确认"画了没"（元素/尺寸/层级），再改样式——否则白改
