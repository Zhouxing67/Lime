# 布局高度溢出（Flex 容器无确定高度 → 整页滚动）

## 症状

最左侧导航栏（NavRail）与右侧边栏（PdfCardsPanel）可以被"拖到很下面"——整个页面（body）出现纵向滚动条，随内容长高。

## 根因

根布局是一个 **auto 高度的 flex 行**：

```tsx
<Box sx={{ display: "flex", minHeight: "100vh", ... }}>   // ← minHeight 而非 height
  <NavRail />
  <SidebarFilters />   // MUI Drawer，paper height:100vh + overflowY:auto（已约束）
  <Main />             // flex:1, height:100vh, overflow:hidden（已约束）
  <PdfCardsPanel />    // ← 唯一没有视口高度约束的顶层子项
</Box>
```

Flex 行的跨轴高度 = `minHeight: 100vh`（非确定高度），实际取**最高子项的假设高度**。`PdfCardsPanel` 根没有 `height`，其卡片列表 `flex:1, overflowY:auto, minHeight:0` 在 **auto 高度的列 flex 容器里 `flex:1` 没有确定空间可解析** → 列表按内容撑高（几十张卡堆成数千 px）→ 面板高度 = 全部卡片 → 根随面板长高 → **body 滚动** → `align-items: stretch` 把 NavRail 和 Drawer 一起拉伸到长高后的根。

**通用规则**：flex 容器的内部滚动（`overflowY:auto` + `flex:1`）只在容器有**确定高度**时才生效；auto 高度下子项按内容撑高。

## 回归点

`ce4e27a`（PDF 卡片面板移到顶层右兄弟）之前，面板在 PDF 工作区的 `<Box display:flex height:100% minHeight:0>` wrapper 内有界；移出后丢了高度约束。根容器 `minHeight:100vh` 是老代码，Main 的 `height:100vh` 也是老代码——面板变成唯一未约束子项是回归的触发。

## 修复

### 1 · 根容器（主修）

```tsx
sx={{
  display: "flex",
  height: "100vh",      // 原 minHeight → 确定高度
  overflow: "hidden",   // 新增
  bgcolor: "background.default"
}}
```

行跨度为确定 100vh → `align-items: stretch` 把所有子项钉到 100vh → 面板列表的 `overflowY:auto` 终于生效（内部滚动）。`overflow:hidden` 安全：MUI Dialog/Menu/Popover/Tooltip 都是 `document.body` 门户渲染，不在布局流内，不会被裁剪。

### 2 · 面板根（防御）

```tsx
height: "100vh"   // PdfCardsPanel 根补上
```

即使将来某子项再撑根，面板也不会贡献高度。

## 排查方法

- 有"整页可拖很远"的溢出时，先确认根布局是 `minHeight` 还是 `height`——`minHeight` 允许子项撑高页面。
- 逐一检查顶层 flex 子项：**每个都必须有确定高度**（`height:100%`/`100vh` 或内部滚动容器）。
- 内部滚动（`flex:1` + `overflowY:auto`）依赖父容器确定高度，否则退化为内容撑高。

## 涉及文件

- `src/options.tsx`（根布局）
- `src/components/PdfCardsPanel.tsx`（面板根高度）
