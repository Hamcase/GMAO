"""
ChromaDB Manager
Handles all vector database operations with ChromaDB
"""

import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions
from typing import List, Dict, Any, Optional
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class ChromaManager:
    """Manages ChromaDB collections and operations"""
    
    def __init__(
        self,
        persist_directory: str = "./chroma_db",
        collection_name: str = "documents",
        embedding_model: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize ChromaDB manager
        
        Args:
            persist_directory: Path to persist ChromaDB data
            collection_name: Name of the collection
            embedding_model: SentenceTransformer model name
        """
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB client with persistence
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Create embedding function (SentenceTransformer)
        self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )
        
        self.collection_name = collection_name
        self.collection = None
        
        logger.info(f"ChromaDB initialized at {self.persist_directory}")
    
    def get_or_create_collection(self, user_id: str) -> chromadb.Collection:
        """
        Get or create a collection for a specific user
        
        Args:
            user_id: User identifier for collection isolation
            
        Returns:
            ChromaDB collection
        """
        collection_name = f"{self.collection_name}_{user_id}"
        
        try:
            self.collection = self.client.get_or_create_collection(
                name=collection_name,
                embedding_function=self.embedding_function,
                metadata={"user_id": user_id, "description": "Document chunks for RAG"}
            )
            logger.info(f"Collection '{collection_name}' ready ({self.collection.count()} documents)")
            return self.collection
        except Exception as e:
            logger.error(f"Error getting/creating collection: {e}")
            raise
    
    def add_documents(
        self,
        user_id: str,
        chunks: List[str],
        metadatas: List[Dict[str, Any]],
        ids: Optional[List[str]] = None
    ) -> int:
        """
        Add document chunks to the collection
        
        Args:
            user_id: User identifier
            chunks: List of text chunks
            metadatas: List of metadata dicts for each chunk
            ids: Optional list of unique IDs (auto-generated if None)
            
        Returns:
            Number of chunks added
        """
        collection = self.get_or_create_collection(user_id)
        
        if not chunks:
            logger.warning("No chunks to add")
            return 0
        
        # Generate IDs if not provided
        if ids is None:
            import uuid
            ids = [str(uuid.uuid4()) for _ in chunks]
        
        try:
            collection.add(
                documents=chunks,
                metadatas=metadatas,
                ids=ids
            )
            logger.info(f"Added {len(chunks)} chunks to collection")
            return len(chunks)
        except Exception as e:
            logger.error(f"Error adding documents: {e}")
            raise
    
    def query(
        self,
        user_id: str,
        query_text: str,
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None,
        where_document: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Query the collection with semantic search
        
        Args:
            user_id: User identifier
            query_text: Query string
            n_results: Number of results to return
            where: Metadata filters (e.g., {"document_name": "manual.pdf"})
            where_document: Document content filters
            
        Returns:
            Query results with documents, metadatas, distances
        """
        collection = self.get_or_create_collection(user_id)
        
        try:
            results = collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where,
                where_document=where_document,
                include=["documents", "metadatas", "distances"]
            )
            
            logger.info(f"Query returned {len(results['documents'][0])} results")
            return results
        except Exception as e:
            logger.error(f"Error querying collection: {e}")
            raise
    
    def delete_by_document(self, user_id: str, document_name: str) -> int:
        """
        Delete all chunks from a specific document
        
        Args:
            user_id: User identifier
            document_name: Name of the document to delete
            
        Returns:
            Number of chunks deleted
        """
        collection = self.get_or_create_collection(user_id)
        
        try:
            # Get all IDs for this document
            results = collection.get(
                where={"document_name": document_name},
                include=["metadatas"]
            )
            
            if results['ids']:
                collection.delete(ids=results['ids'])
                logger.info(f"Deleted {len(results['ids'])} chunks from {document_name}")
                return len(results['ids'])
            else:
                logger.info(f"No chunks found for {document_name}")
                return 0
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise
    
    def count_documents(self, user_id: str) -> int:
        """Get total number of chunks in collection"""
        collection = self.get_or_create_collection(user_id)
        return collection.count()
    
    def list_documents(self, user_id: str) -> List[str]:
        """List all unique document names in the collection"""
        collection = self.get_or_create_collection(user_id)
        
        try:
            results = collection.get(include=["metadatas"])
            document_names = set()
            for metadata in results['metadatas']:
                if 'document_name' in metadata:
                    document_names.add(metadata['document_name'])
            return sorted(list(document_names))
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            return []
    
    def reset_collection(self, user_id: str):
        """Delete and recreate the collection (use with caution!)"""
        collection_name = f"{self.collection_name}_{user_id}"
        try:
            self.client.delete_collection(name=collection_name)
            logger.warning(f"Collection '{collection_name}' deleted")
            self.get_or_create_collection(user_id)
        except Exception as e:
            logger.error(f"Error resetting collection: {e}")
            raise
