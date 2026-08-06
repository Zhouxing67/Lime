# 受控输入与实时同步"抢控制权" —— 跳转页码输入框

## 症状
PDF 跳转输入框体验反复踩坑：
1. 无法删除当前数字（删除变空又弹回）
2. 输入非法数字自动变最大值
3. 用户输入与当前页同步互相抢控制权
4. Enter 后只能输入一次（第二次无法编辑）

## 根因
1. **输入值 = `草稿 === "" ? 当前页 : 草稿`** ——当前页做兜底 → 删除变空时弹回（删不掉）
2. **输入即钳制**（onChange 里 `n > max → 变 max`）→ 打字时数字被抢改
3. **Enter 后不 blur** → 焦点仍在 → 再次点击不触发 `onFocus` → 无法再编辑

## 修复（编辑态分离）
- **未聚焦**：显示实时当前页
- **聚焦**：预填当前页 + **全选**（打字即替换，删除/清空自由，输入不钳制）
- **失焦/Enter**：校验 + 跳转 + **blur** → 回到实时当前页；非法值（0/负数/超界/非整数）**拒绝不跳转**

```tsx
const [editing, setEditing] = useState(false)
const [draft, setDraft] = useState("")
// value: editing ? draft : String(currentPage)
// onFocus: setDraft(String(currentPage)); setEditing(true); e.target.select()
// onChange: setDraft(e.target.value)   // 不钳制
// onBlur/Enter: setEditing(false); setDraft(""); (e.target).blur()
```

## 通用教训
- **受控输入同时承担"实时显示"与"用户编辑"两个角色 → 必须用 editing 态分离**，否则一个状态两头抢
- 输入校验放**提交时**（Enter/blur），不在打字中——打字中钳制/拦截是反直觉 UX
- **Enter 后必须 blur**，否则焦点残留导致"第二次编辑失效"（点击不触发 onFocus）
- 兜底值（`||` 回退）会让用户无法清空输入——需要显式空态表达
