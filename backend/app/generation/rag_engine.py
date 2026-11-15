
from langchain_ollama import ChatOllama

from app.retrieval.vector_store import search_chunks


# Initialize the local language model
llm = ChatOllama(
    model="qwen2.5:1.5b",
    temperature=0
)


def generate_rag_answer(question: str):
    """
    Retrieve relevant document passages and
    generate a grounded answer using Qwen.
    """

    # Step 1: Retrieve relevant passages
    results = search_chunks(
        query=question,
        top_k=5
    )

    if not results:
        return {
            "answer": "I could not find relevant information in the uploaded documents.",
            "sources": []
        }

    # Step 2: Build context with source references
    context_parts = []

    for index, result in enumerate(results, start=1):
        context_parts.append(
            f"""
SOURCE [{index}]
Document: {result['filename']}
Location: {result.get('source_location') or 'Document content'}
Content:
{result['text']}
"""
        )

    context = "\n".join(context_parts)

    # Step 3: Construct the prompt
    prompt = f"""
You are KnowFlow AI, an enterprise knowledge assistant.

Answer the user's question using ONLY the supplied document context.

RULES:
1. Do not invent facts.
2. Do not use outside knowledge.
3. If the answer is not supported by the context,
   clearly say that the uploaded documents do not
   contain enough information.
4. After every factual paragraph, include the
   relevant source references, such as [1] or [2].
5. Only cite sources that actually support the claim.
6. If sources disagree, mention the disagreement.

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

ANSWER:
"""

    # Step 4: Generate the answer
    response = llm.invoke(prompt)

    # Step 5: Prepare source information
    sources = []

    for index, result in enumerate(results, start=1):
        sources.append({
            "source_id": index,
            "filename": result["filename"],
            "page_number": result.get("page_number"),
            "source_location": result.get("source_location", "Document content"),
            "source_type": result.get("source_type"),
            "similarity": result["similarity"],
            "content_preview": result["text"][:250]
        })

    # Step 6: Extract generated answer
    answer = response.content.strip()

    # Step 7: Create source references
    source_references = "\n".join(
        f"[{source['source_id']}] "
        f"{source['filename']} — {source['source_location']}"
        for source in sources
    )

    # Step 8: Attach sources to the answer
    answer_with_sources = (
        f"{answer}\n\nSources:\n{source_references}"
    )

    # Step 9: Return final response
    return {
        "answer": answer_with_sources,
        "sources": sources
    }
