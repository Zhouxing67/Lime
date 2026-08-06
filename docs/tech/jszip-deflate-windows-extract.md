# 打包 zip 的 jszip deflate 边缘 bug —— Windows 解压 0x80004005

## 症状
打包后的扩展 zip 在 **Windows 解压时对个别字体文件报错**：`0x80004005 未指定的错误`，指向 `KaTeX_SansSerif-Bold.3be44090.ttf`（后证实共 3 个 KaTeX TTF）。

## 根因
- Plasmo 的 `package` 脚本用 **jszip** 压缩 → 对 3 个 TTF 产生的 deflate 流含边缘情况（`invalid distance too far back`）
- **Info-ZIP (`unzip -t`) 能解压且 CRC 校验通过** → 掩盖了问题；但 **Python zlib 与 Windows inflate 都拒绝**该流
- 即：`unzip -t` 只查 CRC，不保证所有 inflate 实现都能解压；jszip 的 deflate 存在实现兼容性缺陷

## 排查链
1. `unzip -t` 通过（CRC 全对）→ 误判 zip 正常
2. Python `zipfile.read()` 对该条目抛 `zlib.error: Error -3` → 暴露真问题
3. 逐条目自解压 → 发现 3 个 TTF 条目损坏

## 修复
1. `scripts/package.py`：用 **Python 标准 zlib** 打包（Windows 兼容）
2. 打包后**严格自检**：每个字体/二进制条目必须能解压
3. `package` 脚本改为 `python3 scripts/package.py`

```python
# 自检（打包脚本内置）
with zipfile.ZipFile(OUT) as z:
    for n in z.namelist():
        if n.endswith((".ttf", ".woff", ".woff2", ".pfb")):
            z.read(n)  # 任一失败即打包失败
```

## 通用教训
- **zip 完整性校验要用严格的 inflate（Python zlib）而非 `unzip -t`**——后者只查 CRC
- 打包产物必须**实际解压每个条目**验证，尤其是字体/二进制文件
- 工具链（jszip）的 deflate 边缘 bug 会静默损坏产物——换标准实现 + 自检
