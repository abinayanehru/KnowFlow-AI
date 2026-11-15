"""Multi-format document extraction for KnowFlow AI.

The historical extract_pdf_text function remains available for compatibility.
Each returned unit contains text and a source locator (page/sheet/slide/section).
"""
from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from typing import Any
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

def _clean(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", (text or "").replace("\x00", " ")).strip()


def extract_pdf_text(file_bytes: bytes):
    import fitz
    pages = []
    document = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        for page_number, page in enumerate(document, start=1):
            text = _clean(page.get_text("text"))
            if text:
                pages.append({"text": text, "page_number": page_number, "source_type": "pdf"})
    finally:
        document.close()
    if not pages:
        raise ValueError("No readable text found in this PDF. Scanned PDFs require OCR support.")
    return pages


def extract_document_text(file_bytes: bytes, filename: str):
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_pdf_text(file_bytes)

    units: list[dict[str, Any]] = []
    if ext == ".docx":
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        blocks = [_clean(p.text) for p in doc.paragraphs if _clean(p.text)]
        for ti, table in enumerate(doc.tables, start=1):
            rows = [" | ".join(_clean(cell.text) for cell in row.cells) for row in table.rows]
            if rows:
                blocks.append(f"Table {ti}\n" + "\n".join(rows))
        text = "\n\n".join(blocks)
        if text: units.append({"text": text, "section": "Document", "source_type": "docx"})

    elif ext in {".txt", ".md"}:
        text = _clean(file_bytes.decode("utf-8-sig", errors="replace"))
        if text: units.append({"text": text, "section": "Text", "source_type": ext[1:]})

    elif ext == ".csv":
        decoded = file_bytes.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(decoded)))
        if rows:
            header = rows[0]
            for i in range(1, len(rows), 1):
                units.append({"text": " | ".join(f"{header[j] if j < len(header) else 'Column '+str(j+1)}: {v}" for j, v in enumerate(rows[i]) if v), "section": f"Row {i+1}", "source_type": "csv"})
            if len(rows) == 1:
                units.append({"text": " | ".join(header), "section": "Header", "source_type": "csv"})

    elif ext == ".xlsx":
        from openpyxl import load_workbook
        workbook = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        for sheet in workbook.worksheets:
            lines = []
            for row in sheet.iter_rows(values_only=True):
                values = [str(v).strip() for v in row if v is not None and str(v).strip()]
                if values: lines.append(" | ".join(values))
            if lines:
                units.append({"text": "\n".join(lines), "sheet_name": sheet.title, "source_type": "xlsx"})
        workbook.close()

    elif ext == ".pptx":
        from pptx import Presentation
        presentation = Presentation(io.BytesIO(file_bytes))
        for slide_number, slide in enumerate(presentation.slides, start=1):
            lines = []
            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False) and shape.text.strip():
                    lines.append(shape.text.strip())
                if getattr(shape, "has_table", False):
                    for row in shape.table.rows:
                        lines.append(" | ".join(cell.text.strip() for cell in row.cells))
            text = _clean("\n".join(lines))
            if text: units.append({"text": text, "slide_number": slide_number, "source_type": "pptx"})

    elif ext == ".html":
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(file_bytes.decode("utf-8", errors="replace"), "html.parser")
        for tag in soup(["script", "style", "noscript"]): tag.decompose()
        text = _clean(soup.get_text("\n"))
        if text: units.append({"text": text, "section": "HTML content", "source_type": "html"})

    elif ext in {".png", ".jpg", ".jpeg"}:
        from PIL import Image
        import pytesseract
        image = Image.open(io.BytesIO(file_bytes))
        text = _clean(pytesseract.image_to_string(image))
        if text: units.append({"text": text, "section": "Image OCR", "source_type": "image"})
        else: raise ValueError("No readable text was detected in this image. Check OCR/Tesseract installation and image quality.")
    else:
        raise ValueError(f"Unsupported file type: {ext or 'unknown'}")

    units = [u for u in units if u.get("text")]
    if not units:
        raise ValueError("No readable text was found in this file.")
    return units
