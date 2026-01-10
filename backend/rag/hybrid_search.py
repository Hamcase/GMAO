"""
Hybrid Search Module
Combines semantic (vector) and lexical (BM25) search with fusion
"""

from rank_bm25 import BM25Okapi
from typing import List, Dict, Any, Tuple
import logging
import numpy as np

logger = logging.getLogger(__name__)


class HybridSearcher:
    """Hybrid search combining vector similarity and BM25 keyword matching"""
    
    def __init__(self, alpha: float = 0.5):
        """
        Initialize hybrid searcher
        
        Args:
            alpha: Weight for semantic vs keyword (0.5 = equal weight)
                   Higher = more semantic, Lower = more keyword
        """
        self.alpha = alpha
        self.bm25_index = None
        self.documents = []
        self.metadatas = []
        self.ids = []
    
    def index_documents(
        self,
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str]
    ):
        """
        Build BM25 index for keyword search
        
        Args:
            documents: List of document texts
            metadatas: List of metadata dicts
            ids: List of document IDs
        """
        self.documents = documents
        self.metadatas = metadatas
        self.ids = ids
        
        # Tokenize documents for BM25
        tokenized_docs = [doc.lower().split() for doc in documents]
        
        try:
            self.bm25_index = BM25Okapi(tokenized_docs)
            logger.info(f"BM25 index built with {len(documents)} documents")
        except Exception as e:
            logger.error(f"Error building BM25 index: {e}")
            raise
    
    def search_bm25(self, query: str, top_k: int = 10) -> List[Tuple[str, float, Dict, str]]:
        """
        Search using BM25 keyword matching
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of (document, score, metadata, id) tuples
        """
        if not self.bm25_index:
            logger.warning("BM25 index not built. Call index_documents first.")
            return []
        
        # Tokenize query
        tokenized_query = query.lower().split()
        
        # Get BM25 scores
        scores = self.bm25_index.get_scores(tokenized_query)
        
        # Get top-k indices
        top_indices = np.argsort(scores)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if scores[idx] > 0:  # Only include non-zero scores
                results.append((
                    self.documents[idx],
                    float(scores[idx]),
                    self.metadatas[idx],
                    self.ids[idx]
                ))
        
        logger.info(f"BM25 search returned {len(results)} results")
        return results
    
    def hybrid_search(
        self,
        query: str,
        vector_results: Dict[str, Any],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Combine vector search and BM25 using Reciprocal Rank Fusion (RRF)
        
        Args:
            query: Search query
            vector_results: Results from ChromaDB vector search
            top_k: Final number of results to return
            
        Returns:
            List of ranked results with scores
        """
        # Extract vector search results
        vector_docs = vector_results['documents'][0] if vector_results['documents'] else []
        vector_metas = vector_results['metadatas'][0] if vector_results['metadatas'] else []
        vector_distances = vector_results['distances'][0] if vector_results['distances'] else []
        vector_ids = vector_results['ids'][0] if vector_results['ids'] else []
        
        # Build index if not already done
        if not self.bm25_index and vector_docs:
            self.index_documents(vector_docs, vector_metas, vector_ids)
        
        # Get BM25 results
        bm25_results = self.search_bm25(query, top_k=top_k * 2)
        
        # Apply Reciprocal Rank Fusion (RRF)
        rrf_scores = {}
        k = 60  # RRF parameter (standard value)
        
        # Add vector search scores (convert distance to similarity)
        for rank, (doc, meta, dist, doc_id) in enumerate(zip(
            vector_docs, vector_metas, vector_distances, vector_ids
        )):
            similarity = 1 / (1 + dist)  # Convert distance to similarity
            rrf_score = self.alpha * (1 / (k + rank + 1))
            
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {
                    "document": doc,
                    "metadata": meta,
                    "score": 0,
                    "semantic_score": similarity,
                    "keyword_score": 0,
                    "id": doc_id
                }
            rrf_scores[doc_id]["score"] += rrf_score
        
        # Add BM25 scores
        bm25_id_to_rank = {doc_id: rank for rank, (_, _, _, doc_id) in enumerate(bm25_results)}
        
        for doc, bm25_score, meta, doc_id in bm25_results:
            rank = bm25_id_to_rank[doc_id]
            rrf_score = (1 - self.alpha) * (1 / (k + rank + 1))
            
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {
                    "document": doc,
                    "metadata": meta,
                    "score": 0,
                    "semantic_score": 0,
                    "keyword_score": bm25_score,
                    "id": doc_id
                }
            else:
                rrf_scores[doc_id]["keyword_score"] = bm25_score
            
            rrf_scores[doc_id]["score"] += rrf_score
        
        # Sort by final RRF score
        ranked_results = sorted(
            rrf_scores.values(),
            key=lambda x: x["score"],
            reverse=True
        )[:top_k]
        
        logger.info(
            f"Hybrid search: {len(vector_docs)} semantic + {len(bm25_results)} keyword "
            f"-> {len(ranked_results)} fused results"
        )
        
        return ranked_results
    
    def search_with_filter(
        self,
        query: str,
        vector_results: Dict[str, Any],
        filter_func=None,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search with custom filtering
        
        Args:
            query: Search query
            vector_results: Vector search results
            filter_func: Function to filter results (takes metadata, returns bool)
            top_k: Number of results
            
        Returns:
            Filtered and ranked results
        """
        results = self.hybrid_search(query, vector_results, top_k=top_k * 2)
        
        if filter_func:
            results = [r for r in results if filter_func(r["metadata"])]
        
        return results[:top_k]
