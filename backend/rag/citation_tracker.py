"""
Citation Tracker Module
Maps LLM citations to precise character positions in source documents
"""

import re
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class CitationTracker:
    """Track and manage precise citations for RAG responses"""
    
    def __init__(self):
        """Initialize citation tracker"""
        self.citation_pattern = re.compile(r'\[(\d+)\]')
    
    def parse_citations(self, response_text: str) -> List[int]:
        """
        Extract citation numbers from response text
        
        Args:
            response_text: LLM response with [1], [2], etc.
            
        Returns:
            List of citation indices (1-indexed)
        """
        matches = self.citation_pattern.findall(response_text)
        citations = [int(m) for m in matches]
        return sorted(set(citations))  # Unique, sorted
    
    def create_citation_objects(
        self,
        cited_chunks: List[Dict[str, Any]],
        response_text: str
    ) -> List[Dict[str, Any]]:
        """
        Create structured citation objects with precise locations
        
        Args:
            cited_chunks: Retrieved chunks used in response
            response_text: LLM response text
            
        Returns:
            List of citation objects with metadata
        """
        citation_indices = self.parse_citations(response_text)
        
        citations = []
        for idx in citation_indices:
            # Convert 1-indexed to 0-indexed
            chunk_idx = idx - 1
            
            if chunk_idx < len(cited_chunks):
                chunk = cited_chunks[chunk_idx]
                metadata = chunk.get("metadata", {})
                
                citation = {
                    "citation_number": idx,
                    "document_name": metadata.get("document_name", "Unknown"),
                    "page_number": metadata.get("page_number", 0),
                    "chunk_index": metadata.get("chunk_index", 0),
                    "char_start": metadata.get("char_start", 0),
                    "char_end": metadata.get("char_end", 0),
                    "text": chunk.get("document", ""),
                    "keywords": metadata.get("keywords", []),
                    "score": chunk.get("score", 0),
                    "rerank_score": chunk.get("rerank_score", 0)
                }
                
                citations.append(citation)
                logger.debug(
                    f"Citation [{idx}]: {citation['document_name']}, "
                    f"page {citation['page_number']}, "
                    f"chars {citation['char_start']}-{citation['char_end']}"
                )
            else:
                logger.warning(f"Citation [{idx}] index out of range")
        
        return citations
    
    def format_response_with_citations(
        self,
        response_text: str,
        citations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Format complete response with structured citations
        
        Args:
            response_text: LLM response
            citations: List of citation objects
            
        Returns:
            Formatted response dictionary
        """
        return {
            "response": response_text,
            "citations": citations,
            "citation_count": len(citations)
        }
    
    def get_citation_by_number(
        self,
        citations: List[Dict[str, Any]],
        citation_number: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get specific citation by number
        
        Args:
            citations: List of citations
            citation_number: Citation number (1-indexed)
            
        Returns:
            Citation object or None
        """
        for citation in citations:
            if citation["citation_number"] == citation_number:
                return citation
        return None
    
    def get_citations_by_document(
        self,
        citations: List[Dict[str, Any]],
        document_name: str
    ) -> List[Dict[str, Any]]:
        """
        Get all citations from specific document
        
        Args:
            citations: List of citations
            document_name: Document name to filter
            
        Returns:
            Filtered citations
        """
        return [c for c in citations if c["document_name"] == document_name]
    
    def merge_overlapping_citations(
        self,
        citations: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Merge citations with overlapping character ranges
        
        Args:
            citations: List of citations
            
        Returns:
            Merged citations
        """
        if not citations:
            return []
        
        # Group by document and page
        grouped = {}
        for citation in citations:
            key = (citation["document_name"], citation["page_number"])
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(citation)
        
        merged = []
        for (doc_name, page_num), group in grouped.items():
            # Sort by char_start
            group.sort(key=lambda c: c["char_start"])
            
            current = group[0]
            for next_citation in group[1:]:
                # Check if overlapping or adjacent
                if next_citation["char_start"] <= current["char_end"] + 50:
                    # Merge
                    current["char_end"] = max(current["char_end"], next_citation["char_end"])
                    current["text"] += " " + next_citation["text"]
                    current["keywords"] = list(set(current["keywords"] + next_citation["keywords"]))
                else:
                    # Save current and start new
                    merged.append(current)
                    current = next_citation
            
            merged.append(current)
        
        # Renumber citations
        for idx, citation in enumerate(merged, 1):
            citation["citation_number"] = idx
        
        logger.info(f"Merged {len(citations)} citations into {len(merged)}")
        return merged
    
    def validate_citations(
        self,
        citations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate citation structure and completeness
        
        Args:
            citations: List of citations to validate
            
        Returns:
            Validation report
        """
        required_fields = [
            "citation_number", "document_name", "page_number",
            "char_start", "char_end", "text"
        ]
        
        valid = []
        invalid = []
        
        for citation in citations:
            missing_fields = [f for f in required_fields if f not in citation]
            
            if missing_fields:
                invalid.append({
                    "citation": citation.get("citation_number", "?"),
                    "missing_fields": missing_fields
                })
            else:
                valid.append(citation)
        
        report = {
            "total": len(citations),
            "valid": len(valid),
            "invalid": len(invalid),
            "issues": invalid
        }
        
        if invalid:
            logger.warning(f"Found {len(invalid)} invalid citations")
        
        return report
