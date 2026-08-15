#!/usr/bin/env python3
"""Generate hand-crafted PDF fixtures for the PDF selection/search-highlight
diagnostics (R1). Two files:

1. fixture-cjk-gbk.pdf — a CID Type0 font (STSong-Light, Encoding /GBK-EUC-H)
   with NO ToUnicode CMap and NO embedded font program. Text extraction
   therefore depends on pdf.js's external CMap + standard-font data, which is
   exactly the class of PDF where the SEARCH side (usePdfDocument passes
   cMapUrl/cMapPacked/standardFontDataUrl) and the ENGINE side (usePdfViewer
   passes only {data}) disagree on the extracted text — the F4 root-cause
   candidate for "search highlights offset on some PDFs".

2. fixture-marked-content.pdf — marked content segments (BMC/EMC, nested)
   around text items, exercising the markedContent wrapper spans (height:0)
   and the leaf-vs-wrapper div-counting paths (S5 / the 1bfce0f leaf filter).
"""


def build_pdf(objects):
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, o in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode()
        out += o
        out += b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode()
    return bytes(out)


def gen_cjk_gbk(path):
    lines = [
        "第一章 概述",
        "本报告考察选区高亮与搜索偏移问题。",
        "本页文字依赖外部字符映射表解析。",
        "搜索偏移的根因可能在于字符映射缺失。",
        "选区高亮应当连续且贴合文字。",
        "若缺少映射表本页文本无法正确解码。",
    ]
    parts = ["BT"]
    y = 760
    for ln in lines:
        parts.append("/F1 16 Tf")
        parts.append(f"1 0 0 1 72 {y} Tm")
        hexs = ln.encode("gbk").hex().upper()
        parts.append(f"<{hexs}> Tj")
        y -= 38
    parts.append("ET")
    stream = "\n".join(parts).encode("latin-1")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream)
        + stream
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
        b"/Encoding /GBK-EUC-H /DescendantFonts [6 0 R] >>",
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> "
        b"/FontDescriptor 7 0 R /DW 1000 /W [1 95 1000] >>",
        b"<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 "
        b"/FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 "
        b"/Descent -120 /CapHeight 880 /StemV 80 >>",
    ]
    with open(path, "wb") as f:
        f.write(build_pdf(objs))
    print(f"wrote {path} ({len(build_pdf(objs))} bytes)")


def gen_marked(path):
    text = [
        "Plain sentence fully outside marked content. ",
        "Inside marked content segment one. ",
        "Nested marked content inside segment two. ",
        "Back to top-level marked content again. ",
        "Trailing plain text after all marked content. ",
    ]
    stream_parts = ["BT /F1 12 Tf"]
    y = 760
    # First plain line (no marked content).
    stream_parts.append(f"1 0 0 1 72 {y} Tm")
    stream_parts.append(f"({text[0]}) Tj")
    y -= 30
    # Marked content line (single BMC).
    stream_parts.append(f"1 0 0 1 72 {y} Tm")
    stream_parts.append("/Span BMC")
    stream_parts.append(f"({text[1]}) Tj")
    stream_parts.append("EMC")
    y -= 30
    # Nested marked content line (BDC inside BMC).
    stream_parts.append(f"1 0 0 1 72 {y} Tm")
    stream_parts.append("/Span BMC")
    stream_parts.append(f"({text[2]}) Tj")
    stream_parts.append("/Span BMC")
    stream_parts.append(f"({text[3]}) Tj")
    stream_parts.append("EMC EMC")
    y -= 30
    stream_parts.append(f"1 0 0 1 72 {y} Tm")
    stream_parts.append(f"({text[4]}) Tj")
    stream_parts.append("ET")
    stream = "\n".join(stream_parts).encode("latin-1")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream)
        + stream
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    with open(path, "wb") as f:
        f.write(build_pdf(objs))
    print(f"wrote {path} ({len(build_pdf(objs))} bytes)")


if __name__ == "__main__":
    import os
    d = os.path.dirname(os.path.abspath(__file__))
    gen_cjk_gbk(os.path.join(d, "fixture-cjk-gbk.pdf"))
    gen_marked(os.path.join(d, "fixture-marked-content.pdf"))
