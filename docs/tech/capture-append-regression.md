# 存储重构引入的捕获回归 —— `onDirtyChange` 丢失 + 去重顺序

## 症状
捕获追加失效 + 清空后无法覆盖：
- Alt+S 有草稿时**不追加**（只覆盖）
- 清空草稿后同一内容**无法再捕获**（被去重拦截）
- 只能手动复制粘贴，而公式/图片无法复制 → 每次捕获都要"Alt+S → 保存 → 关闭"

## 根因（存储三表拆分重构的回归）
1. **`onDirtyChange` prop 丢失**：重构时 PanelForm 的 dirty 计算 + 回调被删 → `dirtyRef` 永远 false → 追加分支（`open && dirtyRef.current`）永不触发
2. **去重提前拦截追加**：`prevSelectionRef` 同选区去重在追加检查**之前**返回——即使 dirtyRef 修好，相同公式也追加不了
3. **清空不重置 `prevSelectionRef`** → 同一内容再捕获被去重挡住

## 修复
- PanelForm 恢复 `onDirtyChange`（content/imageDraft 非空 = dirty，含清空都上报）
- **追加分支移到去重之前**（重复公式合法：公式/图片无法复制粘贴，Alt+S 是唯一追加路径；去重只守卫覆盖）
- 清空草稿重置 `prevSelectionRef`

## 通用教训
- **重构 = 无意的行为回退**：跨重构的 prop/回调链路必须回归验证（capture 感知层的 dirty 守卫就是例子）
- **去重的语义边界**：去重守卫"覆盖"（防误触重填），不守卫"追加"（追加是合法重复路径）——顺序错了合法操作被拦
- 状态守卫（dirty/prevSelection）的生命周期：清空时必须复位，否则幽灵状态永久拦截
