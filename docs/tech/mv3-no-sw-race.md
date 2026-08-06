# MV3 Service Worker 空闲回收竞态 —— "Uncaught Error: No SW"

## 症状
Chrome 扩展控制台报 `Uncaught Error: No SW 上下文`（`background/index.js:0:1`），偶发于消息投递瞬间。

## 根因
Chrome MV3 Service Worker **空闲回收**（SW 在无事件 ~30s 后终止）：消息发往后台时恰好处于 **SW 终止/重启瞬间** → 投递失败。这是 MV3 的固有生命周期竞态，**非代码回归**。

## 处置
- 确认所有 `sendMessage` 调用方都**捕获了 rejection**（capture/list-projects/save-feedback/webdav）→ 不影响使用，**搁置**
- 加固候选（未执行，需要时再做）：
  1. `handleCapture` 无 try/catch → 包上（消除后台 bundle 未处理拒绝）
  2. `sendMessage` 包装器对读操作（list-projects）做 "No SW" 重试
  3. `sendResponse` 包 `safeSendResponse` 吞 "port closed"

## 通用教训
- MV3 SW 是**无状态 + 可回收**的执行环境——所有后台消息都要能容忍 SW 重启
- "No SW / port closed / 消息失败" 的偶发错误优先怀疑 SW 生命周期，而非业务代码
- 关键链路（读操作）应加**重试**；非关键链路至少捕获避免未处理拒绝
