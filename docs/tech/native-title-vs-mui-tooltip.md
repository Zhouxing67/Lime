# 操作反馈机制 —— 原生 `title` vs MUI Tooltip

## 症状
PDF 卡片复制后"没有已复制反馈"，而项目卡片（MUI Tooltip）反馈很快。用户困惑：同样的操作，为什么一处有反馈一处没有。

## 根因
| 机制 | 行为 |
|---|---|
| **原生 `title` 属性** | 浏览器 tooltip 需鼠标**离开再进入**才重新显示——点击后指针停在按钮上，`title` 翻转看不到；且弹出延迟 ~500ms–1s |
| **MUI Tooltip** | 内容随 state **实时更新**——指针悬停中 `title` 翻转立即显示；enterDelay 仅 100ms |

PDF 卡片用了原生 `title` → 反馈不可见 + hover 慢；项目卡片用 MUI Tooltip → 即时。

## 修复
- PDF 卡片全部图标按钮 `title=` → **MUI Tooltip**
- 复制反馈：MUI Tooltip `copied` 翻转 + icon 换绿勾（双重可见反馈）

## 通用教训
- **icon-only 按钮必须用 MUI Tooltip（受控内容），不用原生 `title`**——原生无法做动态反馈 + 延迟高
- 用户可见的即时反馈需要**受控状态驱动**（Tooltip 内容 / icon 切换），而不是属性翻转
- 对比项目卡片（有反馈）与 PDF 卡片（无反馈）本身就是根因定位：**同样的机制不同实现 → 反馈不同**
