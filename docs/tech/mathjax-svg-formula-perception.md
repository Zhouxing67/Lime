# MathJax v3 裸 SVG 公式感知

## 背景

知乎等站点用 MathJax v3 渲染公式。MathJax v3 输出的是**内联 SVG**（DOM 元素，不是位图），结构：

```xml
<svg role="img" aria-hidden="true" ...>
  <defs>…字形路径定义…</defs>
  <use xlink:href="#MJMATHI-41" x="0"/>   ← 引用字形
  <use xlink:href="#MJMAIN-3D" x="40"/>
  <use xlink:href="#MJMATHI-78" x="80"/>
</svg>
```

两个"看似无解"的点：
1. **textContent 为空**——字形是 `<use>` 引用，SVG 内没有可见文本。
2. **LaTeX 源码已丢失**——渲染成字形路径后，原始 `$…$` 不在了。

## 关键洞察：字形名编码了字符码

MathJax 按**字形对应字符的 unicode 码点**命名：

| 引用 | 十六进制 | 十进制 | 字符 |
|---|---|---|---|
| `#MJMATHI-41` | 0x41 | 65 | A |
| `#MJMAIN-3D` | 0x3D | 61 | = |
| `#MJMATHI-78` | 0x78 | 120 | x |

读 `<use>` 的 `xlink:href` → 解 hex → 拼出渲染文本（如 `A=x`）。

## 提取策略（三级）

1. **外层容器的真 LaTeX**：若 SVG 被 `.ztext-math[data-tex]` / `mjx-container[aria-label]` 包裹 → 直接取 LaTeX（最佳，因为渲染前源码还在）。
2. **SVG 的 aria-label**（若存在）。
3. **字形名重建**：兜底——解出的是**渲染文本**（可读，但非标准 LaTeX 语法）。

## 实现位置

- `src/contents/mathFormats.ts`：公式格式**注册表**（`MathFormat = { selector, extract, isDisplay? }`）。
  - MathJax v3 SVG 条目：`selector: 'svg[role="img"], svg[aria-hidden="true"]'` + `extract: mathjaxSvgSource`。
  - **新增格式 = 往注册表加一条**，感知层其余代码不动。
- 检测验证：`svg[role="img"]` 选择器过宽 → `mathAtPoint`/`paragraphFromCursor`/悬停高亮都用 `mathSource(el)` 验证真公式（非 MathJax 的 SVG 返回 null，不高亮不捕获）。

## 局限

- 裸 SVG 提取的是渲染文本（非 LaTeX）；若 MathJax 未来改字形命名（不带字符码），兜底失效——届时加一条新提取器即可。
