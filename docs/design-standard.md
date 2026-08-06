# Lime UI 设计标准与组件复用清单

> **核心原则：复用优先，非必要不自定义。** 新功能先查本清单的既有组件；仅在确有 gap 时才新建组件，且必须沿用本标准的 token 档位。
> 配套：`AGENTS.md`「UI 一致性」+「UI Review 准则」为执行检查线，本文件为数值基准。

---

## 一、设计原则

- **编辑风、低饱和、克制**：纸面底 + 发丝分割 + 单一强调色；拒绝鲜艳/厚重阴影/装饰噪声
- **确定性 > 网络性**：信息层级明确，同类操作同尺寸同位置
- **复用 > 自定义**：空态用 EmptyState、弹窗用 DialogShell、操作栏用 BatchToolbar、虚线瓦片用 DashedTile、容器用 Well、卡片体用 CardRenderer——非必要不另造

---

## 二、Token 档位（硬约束）

### 圆角
| 场景 | 值 |
|---|---|
| 卡片 / 按钮 / 瓦片 / chip / 输入框 | **`1`**（theme 圆角一律 1）|
| 例外（豁免）| PDF 纸张 `#fff`/`#f0efec`、浮动面板主题、批注色（pdfTheme）|

### 过渡
| 档位 | 值 | 用途 |
|---|---|---|
| micro | `0.15s` | icon hover、opacity 渐显、按压 |
| hover | `0.2s ease` | 卡片 hover / 操作渐显 |
| 入场/页面切换 | `0.25s ease-out` | 弹窗/面板展开 |

禁止：`0.3s+`、`cubic-bezier` 自造、无 `ease` 关键字。

### 阴影
| Token | 值（light）|
|---|---|
| `cardShadow` | `0 1px 2px rgba(45,52,54,0.04), 0 2px 6px rgba(45,52,54,0.05)` |
| `cardShadowHover` | `0 2px 4px rgba(45,52,54,0.06), 0 8px 20px rgba(45,52,54,0.1)` |
| `focusRing` | `0 0 0 2px ${primary.main}` |

禁止裸 `boxShadow: N`（原始 elevation）——一律用 token。

### 颜色
- 只用 `t.custom.*` / palette；禁止硬编码 hex（除豁免清单）
- `surface2`（light `#f7f5f1` / dark `#202020`）用于次级表面/井
- `borderStrong`（light `rgba(45,52,54,0.14)`）用于卡片 hover 边框
- **primary 只在 active/hover/link/选中**——不用作静态数字/默认强调
- 语义色：error = 删除/过期/复习不认识；warning = 今天到期；success = 完成
- 主题次色（`palette.secondary`）为休眠定义——当前 UI 只用主色强调

### 文字排版
| 角色 | 字体栈 | 说明 |
|---|---|---|
| 阅读体 | `t.custom.serif`（含 LXGW WenKai）| 卡片正文、原文、复习内容 |
| UI chrome | `t.custom.sans` | 按钮、标题、标签、次要文字 |

字号档位：
- 卡片标题 serif **700**；section 标题 sans 600；次要文字统一 `0.75rem`；微标注 `0.7rem`
- 禁止同角色混 600/700、混字号档位

---

## 三、尺寸系统（Icon / 按钮）

### Icon 尺寸等级（严格）
| 档位 | 尺寸 | 用途 |
|---|---|---|
| **操作档** | **16px** | 卡片操作、工具栏操作、菜单项 icon（**标准档**）|
| 标题档 | 20px | DialogShell 标题 icon、section 标题 icon |
| 导航档 | 22px | NavRail 设置齿轮 |
| 视图档 | 24px | NavRail 视图按钮、批量条主按钮 |

**规则**：同角色同档位；卡片/工具栏操作一律 16px；复选框 16px。

### 按钮尺寸
| 按钮类型 | 规格 |
|---|---|
| 紧凑 icon 按钮 | `size="small"` + `p: 0.75` + 16px icon = **28px 点击区**（标准）|
| 文字/轮廓按钮 | `size="small"`（测试连接/复制到项目等）|
| 弹窗主操作 | DialogShell actions（medium）|
| 批量条按钮 | BatchToolbar（含 `flexWrap: wrap` 防窄宽裁剪）|

### 间距
- 卡片 `p: 1.5`、侧栏 `p: 2`、面板头部 `minHeight: 52`
- 8px 级节奏（0.5 = 4px, 1 = 8px, 2 = 16px, 3 = 24px）
- 同层级表面 `px/py` 一致；分割线缩进统一（`mx: 1` = 8px）

---

## 四、状态与反馈

| 状态 | 规范 |
|---|---|
| **hover 操作** | 渐显 `opacity 0.15s`；破坏性操作（删除）**常显** |
| **卡片 hover** | `cardShadowHover` + `translateY(-1px)` + `borderStrong` |
| **激活行** | `action.selected` 底 + `primary.main` 文字 + 600 |
| **选中态** | primary 边框 + tint（或 Checkbox）|
| **focus-visible** | 交互元素可见 focus 环（`custom.focusRing` 或 MUI 默认）|
| **disabled** | 语义 disabled + 降低强调 + 无点击 |
| **操作反馈** | 即时可见：icon 切换（绿勾）、Toast、受控 Tooltip 内容翻转 |
| **工具提示** | **icon-only 按钮必须 MUI Tooltip**（禁原生 `title`——无动态反馈 + 延迟高）|
| **加载** | 异步操作有反馈（spinner / "保存中…" / "同步中…"）|
| **空态** | EmptyState（图标 + 标题 + 引导）——除豁免（窄侧栏 <260px）|

### 提示与文案
- placeholder 具体准确：`搜索 PDF 全文…`、`跳转页码`、`图片 URL（可选，回车插入）`
- 操作 icon title：动词短语（`复制内容`/`展开内容`/`移动到章节`）
- 破坏性操作 title 常显：`删除`
- 禁止用 emoji 做结构图标/控件（用 MUI 图标）；禁止 `✎`/`◀▶` 字形当控件

---

## 五、组件复用清单（非必要不自定义）

### 通用骨架
| 组件 | 用途 | 何时用 |
|---|---|---|
| **EmptyState** | 空态（图标 + 标题 + 引导）| 任何空列表/空网格 |
| **DialogShell** | 统一弹窗骨架（标题 + 关闭 X + actions）| 所有 MUI Dialog |
| **DeleteConfirmDialog** | 删除确认（`itemLabel` + 级联警告）| 所有删除操作（禁 window.confirm）|
| **Toast** | 底部居中中性纸片反馈 | 操作结果提示（置入/复制/同步）|
| **Well** | `background.default` + hairline 容器 | 侧栏分组、区块容器 |
| **DashedTile** | 1.5px 虚线瓦片（新建入口）| 新建项目/打开 PDF/新建主题/新增待办/新建卡片 |
| **BatchToolbar** | 批量操作栏（全选 + 已选 N + actions[]）| 项目/PDF 面板的批量模式 |

### 表单
| 组件 | 用途 |
|---|---|
| **SearchField** | 统一搜索框（FilterChips + PDF 工具栏复用）|
| **DateField** | 日期输入（自定义空标签/格式化 + showPicker）|
| **DateRangeFilter** | 日期范围筛选弹层 |
| **ImageUrlInput** | 图片 URL 输入（`[图片](url)` 插入）|
| **TaskEditor** | 待办任务列表编辑（checkbox 行，保存时组装 markdown）|

### 内容渲染
| 组件 | 用途 |
|---|---|
| **MarkdownRenderer** | 唯一 markdown 渲染（含 KaTeX 公式、checkbox 任务、图片）——禁用 dangerouslySetInnerHTML |
| **CardRenderer** | 唯一卡片内容渲染（`mode: preview/front/back/full` + `OriginalBlock` + `ContentBlock`）|
| **ItemCard** | 项目卡片外壳（header + CardRenderer + ItemCardOperations）|
| **ItemCardOperations** | 卡片操作组（复制/加入复习/移动/复制到项目/删除）——28px + Tooltip 标准 |
| **PdfCardBody** | PDF 卡片内容体（文本引用块/框选图 + idea）|
| **PdfEditDialog** | PDF 卡编辑（content 只读 + idea 编辑）|

### 选择/菜单
| 组件 | 用途 |
|---|---|
| **PlaceCardMenu** | 置入项目菜单（最近优先 + 前7折叠 + 内联新建）|
| **CopyCardsMenu** | 复制到项目菜单（同收纳模式）|
| **MoveToSectionMenu** | 移动到章节菜单（L1/L2 树 + 未分类）|
| **MergeConfirmDialog** | 合并卡片确认（分隔方式选择）|

### 导航/视图
| 组件 | 用途 |
|---|---|
| **NavRail** | 最左导航栏（5 视图 + badge + 设置）|
| **SidebarFilters** | 左侧边栏（视图切换 + 子面板 + OutlineTree）|
| **ProjectTree** | 项目树（accordion + 章节 + 行操作）|
| **FooterBar** | 底部状态栏（视图感知）|
| **Toast** | 全局 toast |
| **CaptureSidebar / FloatingPanel / PanelForm** | 捕获侧栏（业务表单）|
| **PdfRenderer / PdfView / PdfCardsPanel** | PDF 阅读三件套 |

### 主题/工具
| 组件 | 用途 |
|---|---|
| `palettes` | 6 预设（紫檀/墨绿/暖陶/黛蓝/绛紫/赤红）纯数据色源 |
| `pdfTheme` | MARK_DOT / MARK_LABEL（批注色点 + 标签）|
| `panelTheme` | 捕获面板颜色（内容脚本安全）|
| `DashedTile` / `EmptyState` / `DialogShell` | 见上 |

---

## 六、验收清单（新功能提交前过一遍）

1. **Token 合规**：圆角 `1`；过渡只用三档；阴影只用 `cardShadow`/`cardShadowHover`/`focusRing`；无硬编码 hex（除豁免）
2. **尺寸一致**：操作 icon 16px / 按钮 28px / 复选框 16px；同角色同档位
3. **复用**：空态 → EmptyState；弹窗 → DialogShell；操作栏 → BatchToolbar；虚线瓦片 → DashedTile；容器 → Well；icon-only → MUI Tooltip；无 `✎`/`◀▶` 字形
4. **状态反馈**：hover 渐显 + 破坏性常显；激活/选中语义正确；操作有即时反馈
5. **文案**：placeholder 准确；操作 title 动词短语；无过时信息
6. **暗色**：对比度独立验证（text.secondary ≥3:1）；分割线两主题可见

---

## 七、豁免清单（刻意保留，不视为违规）

- PDF 纸张 `#fff`/`#f0efec`、浮动面板/捕获侧栏主题、批注色（`pdfTheme`）
- 窄侧栏空态（<260px 内联 caption 而非 EmptyState）
- 复习统计卡（ReviewEmptyStats 自定义卡面）
- TodoCard 任务添加行的 `1px dashed`
