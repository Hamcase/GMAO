"""
Cross-Encoder Reranker Module
Provides precision re-ranking of search results
"""

from sentence_transformers import CrossEncoder
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """Rerank search results using cross-encoder model"""
    
    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        """
        Initialize cross-encoder reranker
        
        Args:
            model_name: HuggingFace model for reranking
        """
        self.model_name = model_name
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load cross-encoder model"""
        try:
            self.model = CrossEncoder(self.model_name)
            logger.info(f"Loaded cross-encoder model: {self.model_name}")
        except Exception as e:
            logger.error(f"Error loading cross-encoder: {e}")
            raise
    
    def rerank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: int = None
    ) -> List[Dict[str, Any]]:
        """
        Rerank candidates using cross-encoder
        
        Args:
            query: Search query
            candidates: List of candidate documents with scores
            top_k: Number of top results to return (None = all)
            
        Returns:
            Reranked results with updated scores
        """
        if not candidates:
            return []
        
        # Extract document texts
        texts = [c["document"] for c in candidates]
        
        # Create query-document pairs
        pairs = [[query, text] for text in texts]
        
        try:
            # Get cross-encoder scores
            scores = self.model.predict(pairs)
            
            # Update candidates with new scores
            reranked = []
            for candidate, score in zip(candidates, scores):
                reranked_candidate = candidate.copy()
                reranked_candidate["original_score"] = candidate.get("score", 0)
                reranked_candidate["rerank_score"] = float(score)
                reranked_candidate["score"] = float(score)  # Replace with rerank score
                reranked.append(reranked_candidate)
            
            # Sort by rerank score
            reranked.sort(key=lambda x: x["rerank_score"], reverse=True)
            
            # Limit results
            if top_k:
                reranked = reranked[:top_k]
            
            logger.info(f"Reranked {len(candidates)} candidates, returning {len(reranked)}")
            return reranked
            
        except Exception as e:
            logger.error(f"Error during reranking: {e}")
            # Return original candidates if reranking fails
            return candidates
    
    def rerank_with_threshold(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        threshold: float = 0.5,
        top_k: int = None
    ) -> List[Dict[str, Any]]:
        """
        Rerank and filter by score threshold
        
        Args:
            query: Search query
            candidates: Candidate documents
            threshold: Minimum rerank score (0-1)
            top_k: Max results
            
        Returns:
            Filtered reranked results
        """
        reranked = self.rerank(query, candidates, top_k=None)
        
        # Filter by threshold
        filtered = [c for c in reranked if c["rerank_score"] >= threshold]
        
        # Limit results
        if top_k:
            filtered = filtered[:top_k]
        
        logger.info(
            f"Reranked {len(candidates)} -> {len(filtered)} above threshold {threshold}"
        )
        
        return filtered
