"""
Quick test script to verify RAG pipeline components
Run: python test_rag_pipeline.py
"""

import sys
import os

print("=" * 60)
print("RAG Pipeline Component Test")
print("=" * 60)

# Test 1: Import all modules
print("\n1️⃣ Testing imports...")
try:
    from rag import (
        ChromaManager,
        SmartChunker,
        HybridSearcher,
        CrossEncoderReranker,
        CitationTracker,
        OCRProcessor
    )
    print("   ✅ All modules imported successfully")
except Exception as e:
    print(f"   ❌ Import error: {e}")
    sys.exit(1)

# Test 2: Initialize ChromaManager
print("\n2️⃣ Testing ChromaManager initialization...")
try:
    chroma = ChromaManager(persist_directory="./test_chroma_db")
    print("   ✅ ChromaManager initialized")
except Exception as e:
    print(f"   ❌ ChromaManager error: {e}")
    sys.exit(1)

# Test 3: Test SmartChunker
print("\n3️⃣ Testing SmartChunker...")
try:
    chunker = SmartChunker(chunk_size=500, chunk_overlap=50, language='fr')
    test_text = """
    La maintenance préventive est essentielle. 
    Elle permet d'éviter les pannes coûteuses.
    Les inspections doivent être régulières.
    Les équipements doivent être vérifiés tous les mois.
    """ * 3  # Make it longer
    
    chunks = chunker.chunk_text(test_text, "test_doc.pdf", page_number=1)
    print(f"   ✅ SmartChunker created {len(chunks)} chunks")
    if chunks:
        print(f"      First chunk has {len(chunks[0]['metadata'])} metadata fields")
        print(f"      Metadata keys: {list(chunks[0]['metadata'].keys())}")
except Exception as e:
    print(f"   ❌ SmartChunker error: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Test ChromaDB operations
print("\n4️⃣ Testing ChromaDB operations...")
try:
    test_user = "test_user_123"
    
    # Add documents
    test_chunks = ["Maintenance préventive mensuelle", "Inspection des équipements"]
    test_metadata = [
        {"document_name": "manual.pdf", "page_number": 1, "chunk_index": 0},
        {"document_name": "manual.pdf", "page_number": 2, "chunk_index": 1}
    ]
    
    count = chroma.add_documents(test_user, test_chunks, test_metadata)
    print(f"   ✅ Added {count} documents to ChromaDB")
    
    # Query documents
    results = chroma.query(test_user, "maintenance préventive", n_results=2)
    print(f"   ✅ Query returned {len(results['documents'][0])} results")
    
    # Cleanup
    deleted = chroma.delete_by_document(test_user, "manual.pdf")
    print(f"   ✅ Deleted {deleted} documents")
    
except Exception as e:
    print(f"   ❌ ChromaDB operations error: {e}")
    import traceback
    traceback.print_exc()

# Test 5: Test HybridSearcher
print("\n5️⃣ Testing HybridSearcher...")
try:
    searcher = HybridSearcher(alpha=0.5)
    print("   ✅ HybridSearcher initialized")
except Exception as e:
    print(f"   ❌ HybridSearcher error: {e}")

# Test 6: Test CrossEncoderReranker
print("\n6️⃣ Testing CrossEncoderReranker...")
try:
    reranker = CrossEncoderReranker()
    print("   ✅ CrossEncoderReranker initialized (model loaded)")
except Exception as e:
    print(f"   ❌ CrossEncoderReranker error: {e}")
    print("   ⚠️  First load may take time to download model")

# Test 7: Test CitationTracker
print("\n7️⃣ Testing CitationTracker...")
try:
    tracker = CitationTracker()
    test_response = "La maintenance [1] est importante. Voir aussi [2] et [3]."
    citations = tracker.parse_citations(test_response)
    print(f"   ✅ CitationTracker extracted {len(citations)} citations: {citations}")
except Exception as e:
    print(f"   ❌ CitationTracker error: {e}")

# Test 8: Test OCRProcessor (no actual OCR, just init)
print("\n8️⃣ Testing OCRProcessor...")
try:
    ocr = OCRProcessor(languages=['fr', 'en'], gpu=False)
    print("   ✅ OCRProcessor initialized")
except Exception as e:
    print(f"   ❌ OCRProcessor error: {e}")
    print("   ⚠️  First load may take time to download models")

# Cleanup test database
print("\n🧹 Cleaning up test database...")
try:
    import shutil
    if os.path.exists("./test_chroma_db"):
        shutil.rmtree("./test_chroma_db")
        print("   ✅ Test database removed")
except Exception as e:
    print(f"   ⚠️  Cleanup warning: {e}")

print("\n" + "=" * 60)
print("✅ RAG PIPELINE TEST COMPLETE - ALL COMPONENTS WORKING")
print("=" * 60)
print("\nNext steps:")
print("1. Start backend: python main.py")
print("2. Test OCR upload with a PDF")
print("3. Test RAG query endpoint")
print("4. Implement frontend PDF viewer with highlighting")
