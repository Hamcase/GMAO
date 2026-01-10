"""
ChromaDB Inspection Tool
Use this to verify data migration from Supabase and inspect chunks
"""

import sys
from rag.chroma_manager import ChromaManager

def inspect_chromadb(user_id: str = None):
    """Inspect ChromaDB contents"""
    
    print("=" * 70)
    print("ChromaDB Inspection Tool")
    print("=" * 70)
    
    # Initialize ChromaDB
    chroma = ChromaManager(persist_directory="./chroma_db")
    
    if user_id:
        print(f"\n📊 Inspecting collection for user: {user_id}")
        print("-" * 70)
        
        try:
            collection = chroma.get_or_create_collection(user_id)
            
            # Count documents
            count = chroma.count_documents(user_id)
            print(f"Total chunks: {count}")
            
            if count == 0:
                print("\n⚠️  No documents found in this collection.")
                print("   Upload a PDF via /home/test-ocr to index documents.")
                return
            
            # List documents
            print("\n📄 Documents in collection:")
            docs = chroma.list_documents(user_id)
            for i, doc in enumerate(docs, 1):
                print(f"  {i}. {doc}")
            
            # Get sample chunks
            print("\n📝 Sample chunks (first 3):")
            print("-" * 70)
            
            results = collection.get(limit=3, include=['documents', 'metadatas'])
            
            if results and results['documents']:
                for i, (doc, meta) in enumerate(zip(results['documents'], results['metadatas']), 1):
                    print(f"\n🔹 Chunk {i}:")
                    print(f"   Document: {meta.get('document_name', 'N/A')}")
                    print(f"   Page: {meta.get('page_number', 'N/A')}")
                    print(f"   Chunk Index: {meta.get('chunk_index', 'N/A')}")
                    print(f"   Characters: {meta.get('char_start', 'N/A')} - {meta.get('char_end', 'N/A')}")
                    
                    keywords = meta.get('keywords', [])
                    if keywords:
                        print(f"   Keywords: {', '.join(keywords)}")
                    
                    # Show preview
                    preview = doc[:200] + "..." if len(doc) > 200 else doc
                    print(f"   Content: {preview}")
            
            # Test query
            print("\n\n🔍 Test Query: 'maintenance préventive'")
            print("-" * 70)
            
            query_results = chroma.query(
                user_id=user_id,
                query_text="maintenance préventive",
                n_results=3
            )
            
            if query_results['documents'][0]:
                print(f"Found {len(query_results['documents'][0])} results:")
                
                for i, (doc, meta, dist) in enumerate(zip(
                    query_results['documents'][0],
                    query_results['metadatas'][0],
                    query_results['distances'][0]
                ), 1):
                    similarity = 1 / (1 + dist)
                    print(f"\n  Result {i} (similarity: {similarity:.3f}):")
                    print(f"    Document: {meta.get('document_name', 'N/A')}")
                    print(f"    Page: {meta.get('page_number', 'N/A')}")
                    preview = doc[:150] + "..." if len(doc) > 150 else doc
                    print(f"    Preview: {preview}")
            else:
                print("  No results found for this query.")
        
        except Exception as e:
            print(f"\n❌ Error inspecting collection: {e}")
            import traceback
            traceback.print_exc()
    
    else:
        # List all collections
        print("\n📂 All Collections in ChromaDB:")
        print("-" * 70)
        
        try:
            # ChromaDB doesn't have a direct list_collections for our pattern
            # We'll need to check common patterns
            print("\nTo inspect a specific user's collection, run:")
            print("  python inspect_chromadb.py YOUR_USER_ID")
            print("\nYou can find user IDs from Supabase Auth or browser localStorage.")
            print("\nExample:")
            print("  python inspect_chromadb.py 12345678-1234-1234-1234-123456789abc")
        
        except Exception as e:
            print(f"Error: {e}")
    
    print("\n" + "=" * 70)
    print("✅ Inspection Complete")
    print("=" * 70)


def delete_collection(user_id: str):
    """Delete a user's collection (use with caution!)"""
    print(f"\n⚠️  WARNING: About to delete collection for user {user_id}")
    confirm = input("Type 'DELETE' to confirm: ")
    
    if confirm == "DELETE":
        chroma = ChromaManager(persist_directory="./chroma_db")
        chroma.reset_collection(user_id)
        print(f"✅ Collection deleted for user {user_id}")
    else:
        print("❌ Deletion cancelled")


def migration_check():
    """Check if migration from Supabase is needed"""
    print("\n🔄 Migration Check")
    print("-" * 70)
    print("\nTo migrate from Supabase to ChromaDB:")
    print("1. Keep existing Supabase data as backup")
    print("2. Upload documents via /home/test-ocr (will use ChromaDB)")
    print("3. Old Supabase data will not be queried anymore")
    print("\nNew uploads automatically go to ChromaDB.")
    print("Previous Supabase data remains untouched (can be used as backup).")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "delete" and len(sys.argv) > 2:
            delete_collection(sys.argv[2])
        elif command == "migration":
            migration_check()
        else:
            # Assume first arg is user_id
            inspect_chromadb(command)
    else:
        print("\nUsage:")
        print("  python inspect_chromadb.py <user_id>      # Inspect user's collection")
        print("  python inspect_chromadb.py migration      # Check migration status")
        print("  python inspect_chromadb.py delete <user_id>  # Delete user's collection")
        print("\nExample:")
        print("  python inspect_chromadb.py 12345678-1234-1234-1234-123456789abc")
        print("\n💡 Tip: Get user_id from browser localStorage or Supabase Auth dashboard")
        migration_check()
