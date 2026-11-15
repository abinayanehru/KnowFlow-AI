def split_into_chunks(units, chunk_size=800, overlap=100):
    """Split extracted units while retaining their page/sheet/slide locator."""
    if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("chunk_size must be positive and overlap must be smaller than chunk_size")
    chunks = []
    for unit in units:
        text = unit.get("text", "")
        start = 0
        while start < len(text):
            end = start + chunk_size
            piece = text[start:end].strip()
            if piece:
                chunk = {k: v for k, v in unit.items() if k != "text" and v is not None}
                chunk["text"] = piece
                chunks.append(chunk)
            if end >= len(text):
                break
            start = end - overlap
    return chunks
