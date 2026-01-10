"""
Smart Chunking Module
Intelligent text splitting with sentence awareness and metadata extraction
"""

import re
import spacy
from typing import List, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)


class SmartChunker:
    """Advanced text chunking with context preservation"""
    
    def __init__(
        self,
        chunk_size: int = 800,
        chunk_overlap: int = 100,
        language: str = "fr"
    ):
        """
        Initialize chunker
        
        Args:
            chunk_size: Target size of chunks in characters
            chunk_overlap: Overlap between chunks in characters
            language: Language code for spaCy model
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.language = language
        
        # Load spaCy model for sentence splitting
        try:
            if language == "fr":
                self.nlp = spacy.load("fr_core_news_sm")
            elif language == "en":
                self.nlp = spacy.load("en_core_web_sm")
            else:
                logger.warning(f"Language {language} not supported, using basic splitting")
                self.nlp = None
        except Exception as e:
            logger.warning(f"Could not load spaCy model: {e}. Using basic splitting")
            self.nlp = None
    
    def chunk_text(
        self,
        text: str,
        document_name: str,
        page_number: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Split text into smart chunks with metadata
        
        Args:
            text: Input text to chunk
            document_name: Name of the source document
            page_number: Page number in source document
            
        Returns:
            List of dicts with 'content' and 'metadata'
        """
        if not text or not text.strip():
            return []
        
        # Normalize whitespace
        text = self._normalize_text(text)
        
        # Use spaCy for sentence-aware splitting if available
        if self.nlp:
            chunks = self._chunk_with_sentences(text)
        else:
            chunks = self._chunk_basic(text)
        
        # Add metadata to each chunk
        chunk_dicts = []
        for idx, chunk_text in enumerate(chunks):
            # Calculate approximate character positions
            char_start = sum(len(c) for c in chunks[:idx])
            char_end = char_start + len(chunk_text)
            
            # Extract keywords and convert to comma-separated string for ChromaDB
            keywords_list = self._extract_keywords(chunk_text)
            keywords_str = ", ".join(keywords_list) if keywords_list else ""
            
            metadata = {
                "document_name": document_name,
                "page_number": page_number,
                "chunk_index": idx,
                "char_start": char_start,
                "char_end": char_end,
                "chunk_length": len(chunk_text),
                "keywords": keywords_str  # ChromaDB requires string, not list
            }
            
            chunk_dicts.append({
                "content": chunk_text,
                "metadata": metadata
            })
        
        logger.info(f"Created {len(chunk_dicts)} chunks from {len(text)} chars")
        return chunk_dicts
    
    def _normalize_text(self, text: str) -> str:
        """Normalize whitespace and clean text"""
        # Replace multiple spaces/newlines with single space
        text = re.sub(r'\s+', ' ', text)
        # Remove leading/trailing whitespace
        text = text.strip()
        return text
    
    def _chunk_with_sentences(self, text: str) -> List[str]:
        """Chunk text using sentence boundaries (spaCy)"""
        if not self.nlp:
            return self._chunk_basic(text)
        
        doc = self.nlp(text)
        sentences = [sent.text.strip() for sent in doc.sents]
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_length = len(sentence)
            
            # If adding this sentence would exceed chunk_size
            if current_length + sentence_length > self.chunk_size and current_chunk:
                # Save current chunk
                chunks.append(' '.join(current_chunk))
                
                # Start new chunk with overlap
                # Include last few sentences for context
                overlap_sentences = []
                overlap_length = 0
                for s in reversed(current_chunk):
                    if overlap_length + len(s) < self.chunk_overlap:
                        overlap_sentences.insert(0, s)
                        overlap_length += len(s)
                    else:
                        break
                
                current_chunk = overlap_sentences + [sentence]
                current_length = sum(len(s) for s in current_chunk)
            else:
                current_chunk.append(sentence)
                current_length += sentence_length
        
        # Add final chunk
        if current_chunk:
            chunks.append(' '.join(current_chunk))
        
        return chunks
    
    def _chunk_basic(self, text: str) -> List[str]:
        """Basic chunking with fixed size and overlap"""
        chunks = []
        start = 0
        text_length = len(text)
        
        while start < text_length:
            end = start + self.chunk_size
            
            # Try to break at sentence boundary (., !, ?)
            if end < text_length:
                # Look for sentence end within next 100 chars
                search_window = text[end:min(end + 100, text_length)]
                match = re.search(r'[.!?]\s', search_window)
                if match:
                    end += match.end()
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            # Move start with overlap
            start = end - self.chunk_overlap if end < text_length else text_length
        
        return chunks
    
    def _extract_keywords(self, text: str, max_keywords: int = 5) -> List[str]:
        """Extract important keywords from text"""
        if not self.nlp:
            # Simple word frequency if no NLP
            words = re.findall(r'\b\w{4,}\b', text.lower())
            from collections import Counter
            return [word for word, _ in Counter(words).most_common(max_keywords)]
        
        # Use spaCy for better keyword extraction
        doc = self.nlp(text)
        
        # Extract nouns and proper nouns
        keywords = []
        for token in doc:
            if token.pos_ in ['NOUN', 'PROPN'] and not token.is_stop and len(token.text) > 3:
                keywords.append(token.lemma_.lower())
        
        # Return unique keywords (most common first)
        from collections import Counter
        keyword_counts = Counter(keywords)
        return [kw for kw, _ in keyword_counts.most_common(max_keywords)]
    
    def chunk_by_pages(
        self,
        pages: List[Tuple[str, int]],
        document_name: str
    ) -> List[Dict[str, Any]]:
        """
        Chunk multiple pages from a document
        
        Args:
            pages: List of (text, page_number) tuples
            document_name: Name of the source document
            
        Returns:
            List of chunk dicts with metadata
        """
        all_chunks = []
        
        for text, page_num in pages:
            page_chunks = self.chunk_text(text, document_name, page_num)
            all_chunks.extend(page_chunks)
        
        logger.info(f"Chunked {len(pages)} pages into {len(all_chunks)} chunks")
        return all_chunks
