from pathlib import Path
from uuid import uuid4
import chromadb
from app.ingestion.embeddings import generate_embeddings, generate_query_embedding

BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / "chroma_data"
client = chromadb.PersistentClient(path=str(DB_PATH))
collection = client.get_or_create_collection(name="knowflow_documents", metadata={"hnsw:space": "cosine"})


def _safe_metadata(chunk, filename):
    metadata = {"filename": str(filename), "source_type": str(chunk.get("source_type", Path(filename).suffix.lstrip(".") or "file"))}
    for key in ("page_number", "slide_number"):
        value = chunk.get(key)
        if value is not None:
            metadata[key] = int(value)
    for key in ("sheet_name", "section"):
        value = chunk.get(key)
        if value is not None:
            metadata[key] = str(value)
    return metadata


def store_chunks(chunks, filename):
    if not chunks: raise ValueError("No chunks available to store.")
    collection.delete(where={"filename": filename})
    texts = [chunk["text"] for chunk in chunks]
    embeddings = generate_embeddings(texts)
    collection.add(ids=[str(uuid4()) for _ in chunks], documents=texts, embeddings=embeddings, metadatas=[_safe_metadata(c, filename) for c in chunks])
    return len(chunks)


def get_document_count():
    return collection.count()


def get_uploaded_documents():
    if collection.count() == 0: return []
    results = collection.get(include=["metadatas"])
    counts = {}
    types = {}
    for metadata in results["metadatas"]:
        filename = metadata["filename"]
        counts[filename] = counts.get(filename, 0) + 1
        types[filename] = metadata.get("source_type", Path(filename).suffix.lstrip("."))
    return [{"filename": name, "chunks": count, "file_type": types.get(name, "file")} for name, count in sorted(counts.items())]


def delete_document(filename):
    collection.delete(where={"filename": filename})


def search_chunks(query, top_k=5, filename=None):
    if filename:
        total = len(collection.get(where={"filename": filename}, include=["metadatas"])["ids"])
    else:
        total = collection.count()
    if total == 0: return []
    args = {"query_embeddings": [generate_query_embedding(query)], "n_results": min(top_k, total), "include": ["documents", "metadatas", "distances"]}
    if filename: args["where"] = {"filename": filename}
    result = collection.query(**args)
    matches = []
    for i, doc_id in enumerate(result["ids"][0] if result["ids"] else []):
        metadata = result["metadatas"][0][i]
        distance = result["distances"][0][i]
        location = None
        if metadata.get("page_number") is not None: location = f"Page {metadata['page_number']}"
        elif metadata.get("sheet_name"): location = f"Sheet {metadata['sheet_name']}"
        elif metadata.get("slide_number") is not None: location = f"Slide {metadata['slide_number']}"
        elif metadata.get("section"): location = str(metadata["section"])
        matches.append({"text": result["documents"][0][i], "filename": metadata["filename"], "page_number": metadata.get("page_number"), "sheet_name": metadata.get("sheet_name"), "slide_number": metadata.get("slide_number"), "section": metadata.get("section"), "source_type": metadata.get("source_type", "pdf"), "source_location": location or "Document content", "distance": round(distance, 4), "similarity": round(1-distance, 4)})
    return matches
