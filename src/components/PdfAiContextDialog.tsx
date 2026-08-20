import { Box, Button, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react"

import DialogShell from "./DialogShell"

export const PDF_AI_CONTEXT_MAX_LENGTH = 8000

export const PDF_AI_CONTEXT_TEMPLATES = [
  {
    id: "academic",
    name: "通用学术阅读",
    description: "论文、教材与技术报告",
    content:
      "这是一份学术或技术资料。请使用简体中文解释选中内容，先说明核心含义，再解释关键概念、论证关系和必要背景；保留重要英文术语并在首次出现时给出中英文对照。避免脱离原文扩展，无法确定的信息请明确说明。"
  },
  {
    id: "computer-science",
    name: "计算机科学",
    description: "算法、系统、软件与 AI",
    content:
      "读者具有计算机科学与技术专业背景，熟悉常见的数据结构、算法、操作系统、计算机网络、软件工程和机器学习基础。请使用简体中文进行技术准确的解释，保留 API、算法、模型、变量及专业术语的英文原文；重点说明机制、输入输出、复杂度、工程权衡及与已有概念的联系，必要时给出简短例子或伪代码，但不要重复解释基础常识。"
  },
  {
    id: "aviation-computing",
    name: "民航机场 × 计算机",
    description: "机场运营、旅客服务与信息系统",
    content:
      "读者具有计算机科学与技术背景，主要关注民航机场领域。请使用简体中文准确解读选中内容，保留关键英文术语、缩写、指标、单位和标准编号。涉及计算机内容时，重点解释软件架构、数据流、接口、算法、数据库、网络、智能化与系统集成；涉及民航内容时，优先结合机场运行、航班保障、旅客服务、行李处理、机场资源分配、运行控制、航空物流、安防管理和机场信息系统等场景。若内容跨学科，请说明计算机方法与机场业务流程之间的对应关系、实际应用价值和实施约束；不要臆造标准条款或业务规则，不确定时请明确标注。"
  }
] as const

export default function PdfAiContextDialog({
  open,
  pdfName,
  value,
  onClose,
  onSave
}: {
  open: boolean
  pdfName: string
  value?: string
  onClose: () => void
  onSave: (value: string) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(value ?? "")
  }, [open, value])

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="PDF AI 上下文"
      maxWidth="sm"
      confirmLabel={saving ? "保存中…" : "保存"}
      confirmDisabled={saving || draft.length > PDF_AI_CONTEXT_MAX_LENGTH}
      onConfirm={() => void save()}>
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", mb: 2, wordBreak: "break-word" }}>
        {pdfName}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        应用基础模板
      </Typography>
      <Box
        sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75, mb: 2 }}>
        {PDF_AI_CONTEXT_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            size="small"
            variant="outlined"
            title={template.description}
            onClick={() => setDraft(template.content)}>
            {template.name}
          </Button>
        ))}
      </Box>
      <TextField
        autoFocus
        fullWidth
        multiline
        minRows={7}
        maxRows={16}
        label="AI 上下文"
        placeholder="例如：这是一篇机器学习论文。请面向有基础的读者，用中文解释概念，并保留重要英文术语。"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        error={draft.length > PDF_AI_CONTEXT_MAX_LENGTH}
      />
      <Box sx={{ mt: 0.75, display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">
          该内容会随 PDF 元数据备份和同步，不包含未来配置的 API Key。
        </Typography>
        <Typography
          variant="caption"
          color={
            draft.length > PDF_AI_CONTEXT_MAX_LENGTH
              ? "error.main"
              : "text.disabled"
          }>
          {draft.length}/{PDF_AI_CONTEXT_MAX_LENGTH}
        </Typography>
      </Box>
    </DialogShell>
  )
}
