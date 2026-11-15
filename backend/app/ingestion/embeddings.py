
from langchain_ollama import OllamaEmbeddings


embedding_model = OllamaEmbeddings(
    model="nomic-embed-text"
)


def generate_embeddings(texts):
    """Generate embeddings for document passages."""

    prepared_texts = [
        f"search_document: {text}"
        for text in texts
    ]

    return embedding_model.embed_documents(prepared_texts)


def generate_query_embedding(query):
    """Generate an embedding for a search query."""

    prepared_query = f"search_query: {query}"

    return embedding_model.embed_query(prepared_query)
