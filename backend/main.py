# --- IMPORTATIONS STANDARD ET DE BIBLIOTHÈQUES TIERCES ---
import pytesseract
import uvicorn
import os
import re # Pour le découpage (chunking)
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from pdf2image import convert_from_bytes
from pypdf import PdfReader
from dotenv import load_dotenv
from pathlib import Path

# --- NOUVELLES IMPORTATIONS POUR RAG ET LLM ---
from supabase import create_client, Client # Pour se connecter à la DB Supabase (Auth uniquement)
from mistralai import Mistral

# --- IMPORTATIONS DES MODULES RAG ---
from rag.chroma_manager import ChromaManager
from rag.chunking import SmartChunker
from rag.hybrid_search import HybridSearcher
from rag.reranker import CrossEncoderReranker
from rag.citation_tracker import CitationTracker
from rag.ocr_processor import OCRProcessor

# --- CHARGEMENT DES SECRETS DEPUIS backend/.env ---
load_dotenv()

# --- LOCAL PDF STORAGE SETUP ---
PDF_STORAGE_DIR = Path("./pdf_storage")
PDF_STORAGE_DIR.mkdir(exist_ok=True)
print(f"📁 PDF Storage directory: {PDF_STORAGE_DIR.absolute()}")

# Secrets pour l'authentification (vérifier le token JWT de l'utilisateur)
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"

# Secrets pour la connexion à la base de données Supabase (pour lire/écrire)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# Secret pour l'API Mistral (pour la génération de réponse)
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY")

# Vérification que toutes les clés nécessaires sont présentes
if not all([SUPABASE_JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, MISTRAL_API_KEY]):
    raise ValueError("Erreurs de configuration: veuillez vérifier le fichier .env (Supabase ET Mistral)")

# --- INITIALISATION DES CLIENTS (Services externes) ---

# 1. Client de base de données Supabase
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("Connexion à Supabase (Service) réussie.")
except Exception as e:
    print(f"Erreur de connexion à Supabase: {e}")
    exit(1)

# 2. RAG Pipeline Components
try:
    chroma_manager = ChromaManager(
        persist_directory="./chroma_db",
        embedding_model="all-MiniLM-L6-v2"
    )
    smart_chunker = SmartChunker(chunk_size=800, chunk_overlap=100, language='fr')
    hybrid_searcher = HybridSearcher(alpha=0.5)  # Equal weight semantic + keyword
    reranker = CrossEncoderReranker(model_name="cross-encoder/ms-marco-MiniLM-L-6-v2")
    citation_tracker = CitationTracker()
    ocr_processor = OCRProcessor(languages=['fr', 'en'], gpu=False)
    print("RAG Pipeline initialisé (ChromaDB + Hybrid Search + Reranker + OCR).")
except Exception as e:
    print(f"Erreur d'initialisation du pipeline RAG: {e}")
    exit(1)

# 3. Client pour l'API Mistral (nouveau SDK)
try:
    mistral_client = Mistral(api_key=MISTRAL_API_KEY)
    print("Client Mistral initialisé.")
except Exception as e:
    print(f"Erreur d'initialisation du client Mistral: {e}")
    exit(1)
# --- FIN DES INITIALISATIONS ---


# --- CONFIGURATION DE L'APPLICATION FASTAPI ---
app = FastAPI(
    title="GMAO+IA Backend",
    description="API pour l'OCR, le RAG et les prévisions de maintenance.",
    version="0.1.0"
)

# Configuration CORS (Cross-Origin Resource Sharing)
# Permet au frontend (localhost:3000) d'appeler ce backend (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"], # Important : autorise l'en-tête "Authorization"
)
# ---

# --- SCHÉMAS DE DONNÉES Pydantic ---
class UserTokenData(BaseModel):
    """ Modèle pour les données décodées du token JWT Supabase """
    sub: str # ID de l'utilisateur
    aud: str # Audience (devrait être 'authenticated')

class QueryRequest(BaseModel):
    """ Modèle pour la requête de recherche/chat """
    query: str

class ForecastRequest(BaseModel):
    """ Modèle pour une requête de prévision PDR """
    historical_data: list  # List of {month: str, quantity: float}
    machine: str
    part_reference: str
    model_type: str  # 'prophet', 'arima', 'sarima', 'lstm'
    horizon: int = 12
    params: dict = {}
    use_mtbf: bool = True  # Enable MTBF-based forecast enhancement
    safety_factor: float = 1.0  # Conservative multiplier (e.g., 1.2 for 24/7 assumption)

class HistoricalDataPoint(BaseModel):
    """ Point de données historique """
    month: str
    quantity: float
# ---

# --- SÉCURITÉ : AUTHENTIFICATION JWT ---
# oauth2_scheme va chercher le token dans l'en-tête "Authorization: Bearer <token>"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl n'est pas utilisé ici mais requis

async def get_token_from_request(
    authorization: str = Header(None),
    token: str = Query(None)
) -> str:
    """
    Extrait le token JWT depuis l'en-tête Authorization ou le query parameter
    """
    # Try Authorization header first
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    
    # Fallback to query parameter (for PDF URLs in iframes)
    if token:
        return token
    
    raise HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user(token: str = Depends(get_token_from_request)) -> UserTokenData:
    """
    Dépendance FastAPI : Décode et valide le token JWT fourni par Supabase.
    S'exécute avant chaque route protégée qui l'utilise.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Impossible de valider les identifiants",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            options={"verify_aud": False} # Simplification pour Supabase ('authenticated')
        )
        user_id: str = payload.get("sub")
        if user_id is None: raise credentials_exception
        aud = payload.get("aud")
        if aud != "authenticated": raise credentials_exception # Vérification d'audience
        return UserTokenData(sub=user_id, aud=aud)
    except JWTError:
        raise credentials_exception
# ---

# --- FONCTION UTILITAIRE : DÉCOUPAGE (Legacy - kept for compatibility) ---
# Note: Using SmartChunker from rag.chunking for new uploads
def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Legacy chunking function - use SmartChunker for new documents"""
    text = re.sub(r'\s+', ' ', text).strip()
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            last_space = text.rfind(' ', start, end)
            if last_space != -1 and last_space > start:
                 end = last_space
        chunks.append(text[start:end].strip())
        if end < len(text) and text[end] == ' ':
            start = end + 1
        else:
             next_start = start + chunk_size - overlap
             start = max(end, next_start) if end < len(text) else next_start
    chunks = [chunk for chunk in chunks if len(chunk) > 10]
    return chunks
# ---

# --- ROUTES DE L'API ---

@app.get("/")
def read_root():
    """ Point d'entrée simple pour vérifier que l'API est en ligne. """
    return {"status": "GMAO+IA Backend is running!"}

# --- ENDPOINT D'INGESTION (OCR + VECTORISATION + SAUVEGARDE) ---
@app.post("/api/v1/ocr/upload")
async def ocr_and_ingest_document(
    file: UploadFile = File(...),
    current_user: UserTokenData = Depends(get_current_user) # Route protégée
):
    """
    Reçoit un PDF, extrait le texte (OCR), le découpe, crée des embeddings,
    et sauvegarde le tout dans Supabase (DB + Storage).
    """
    print(f"Traitement du fichier: {file.filename} pour l'utilisateur: {current_user.sub}")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Type de fichier invalide. Seuls les PDF sont autorisés.")

    file_content = await file.read() # Lire le contenu binaire une seule fois

    # --- 1. EXTRACTION DE TEXTE (OCR Enhanced) ---
    full_text = ""
    pages_text = []  # Store text per page for metadata
    
    try:
        # Try digital extraction first
        pdf_reader = PdfReader(BytesIO(file_content))
        print(f"PDF contient {len(pdf_reader.pages)} pages (Extraction numérique).")
        for page_num, page in enumerate(pdf_reader.pages):
            page_text = page.extract_text()
            if page_text and len(page_text.strip()) > 50:
                pages_text.append((page_text, page_num + 1))  # Tuple: (text, page_number)
                full_text += page_text + "\n\n"
        
        # Force OCR if extraction is too short
        if len(full_text.strip()) < 100:
            print("Texte numérique minimal. Forçage de l'OCR amélioré.")
            full_text = ""
            pages_text = []
            raise Exception("Force OCR")
        
        print("Extraction numérique réussie.")
    
    except Exception as e:
        print(f"Extraction numérique échouée ({e}). Passage à l'OCR amélioré avec EasyOCR.")
        try:
            # Convert PDF to images
            images = convert_from_bytes(file_content, dpi=200)
            print(f"Conversion du PDF en {len(images)} images pour l'OCR.")
            
            # Process each page with enhanced OCR
            for page_num, image in enumerate(images):
                print(f"Traitement OCR (page {page_num + 1})...")
                # Convert PIL to numpy
                import numpy as np
                image_np = np.array(image)
                
                # Use OCRProcessor for enhanced extraction
                page_text, confidence = ocr_processor.extract_text_from_pdf_page(
                    image_np,
                    preprocess=True
                )
                
                if page_text:
                    pages_text.append((page_text, page_num + 1))  # Tuple: (text, page_number)
                    full_text += page_text + "\n\n"
                    print(f"Page {page_num + 1}: {len(page_text)} chars, confidence: {confidence:.2f}")
            
            print(f"OCR terminé. Total: {len(full_text)} caractères extraits.")
        
        except Exception as ocr_error:
            print(f"ERREUR OCR: {ocr_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Erreur OCR: {ocr_error}. Vérifiez les dépendances."
            )
    
    if len(full_text.strip()) == 0:
        raise HTTPException(
            status_code=400,
            detail="Aucun texte n'a pu être extrait du document."
        )

    # --- 2. SMART CHUNKING WITH METADATA ---
    print("Découpage intelligent avec métadonnées...")
    try:
        # Chunk by pages with metadata
        all_chunks_with_metadata = smart_chunker.chunk_by_pages(
            pages=pages_text,
            document_name=file.filename
        )
        
        if not all_chunks_with_metadata:
            raise HTTPException(
                status_code=400,
                detail="Le document n'a pas pu être découpé."
            )
        
        print(f"Découpage terminé: {len(all_chunks_with_metadata)} chunks avec métadonnées.")
    
    except Exception as chunk_error:
        print(f"Erreur découpage: {chunk_error}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du découpage: {chunk_error}"
        )

    # --- 3. INSERTION DANS CHROMADB ---
    try:
        # Extract chunks and metadata
        chunks = [item["content"] for item in all_chunks_with_metadata]
        metadatas = [item["metadata"] for item in all_chunks_with_metadata]
        
        # Add to ChromaDB (automatic embedding)
        count = chroma_manager.add_documents(
            user_id=current_user.sub,
            chunks=chunks,
            metadatas=metadatas
        )
        
        print(f"✅ {count} chunks indexés dans ChromaDB pour l'utilisateur {current_user.sub}")
    
    except Exception as db_error:
        print(f"Erreur ChromaDB: {db_error}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur d'indexation: {db_error}"
        )

    # --- 6. SAUVEGARDE DU PDF EN LOCAL ---
    storage_path = None
    try:
        # Create user directory if needed
        user_dir = PDF_STORAGE_DIR / current_user.sub
        user_dir.mkdir(exist_ok=True)
        
        # Save PDF to local filesystem
        file_path = user_dir / file.filename
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        storage_path = f"{current_user.sub}/{file.filename}"
        print(f"✅ PDF sauvegardé localement: {file_path}")
        
    except Exception as storage_error:
        print(f"⚠️ Erreur de sauvegarde locale (non-bloquante): {storage_error}")
        print(f"Le PDF n'a pas été sauvegardé mais reste indexé dans ChromaDB.")
        # Don't raise - storage is optional, ChromaDB indexing is what matters

    # --- 7. RÉPONSE AU FRONTEND ---
    return {
        "status": "Succès",
        "filename": file.filename,
        "message": f"Document traité et indexé avec ChromaDB + OCR amélioré.",
        "chunks_indexed": count,
        "storage_path": storage_path,
        "storage_uploaded": storage_path is not None
    }

# --- ENDPOINT DE RECHERCHE RAG + GÉNÉRATION (HYBRID SEARCH + RERANKING) ---
@app.post("/api/v1/rag/query")
async def rag_query_with_generation(
    request: QueryRequest,
    current_user: UserTokenData = Depends(get_current_user)
):
    """
    Pipeline RAG complet:
    1. Recherche hybride (sémantique + mot-clé)
    2. Re-ranking avec CrossEncoder
    3. Génération avec Mistral
    4. Citations avec positions précises
    """
    print(f"🔍 Requête RAG de {current_user.sub}: {request.query}")

    try:
        # --- 1. RECHERCHE VECTORIELLE (CHROMADB) ---
        print("1️⃣ Recherche vectorielle ChromaDB...")
        vector_results = chroma_manager.query(
            user_id=current_user.sub,
            query_text=request.query,
            n_results=10  # Fetch more for reranking
        )
        
        if not vector_results['documents'][0]:
            print("❌ Aucun document trouvé dans ChromaDB")
            return {
                "answer": "Désolé, je n'ai trouvé aucune information pertinente dans les documents indexés.",
                "sources": [],
                "citations": []
            }
        
        print(f"✅ Trouvé {len(vector_results['documents'][0])} résultats vectoriels")

        # --- 2. RECHERCHE HYBRIDE (BM25 + VECTOR FUSION) ---
        print("2️⃣ Fusion hybride (sémantique + mot-clé)...")
        hybrid_results = hybrid_searcher.hybrid_search(
            query=request.query,
            vector_results=vector_results,
            top_k=10
        )
        print(f"✅ {len(hybrid_results)} résultats fusionnés")

        # --- 3. RE-RANKING AVEC CROSSENCODER ---
        print("3️⃣ Re-ranking avec CrossEncoder...")
        reranked_results = reranker.rerank(
            query=request.query,
            candidates=hybrid_results,
            top_k=5  # Keep top 5 for context
        )
        print(f"✅ {len(reranked_results)} résultats re-classés")

        if not reranked_results:
            return {
                "answer": "Aucun résultat pertinent après re-ranking.",
                "sources": [],
                "citations": []
            }

        # --- 4. CONSTRUCTION DU CONTEXTE POUR LE LLM ---
        context_parts = []
        for i, result in enumerate(reranked_results, 1):
            doc_name = result['metadata'].get('document_name', 'Unknown')
            page_num = result['metadata'].get('page_number', 0)
            content = result['document']
            context_parts.append(f"[{i}] Source: {doc_name} (page {page_num})\n{content}")
        
        context = "\n\n---\n\n".join(context_parts)

        # --- 5. GÉNÉRATION AVEC MISTRAL ---
        print("4️⃣ Génération de la réponse avec Mistral...")
        system_prompt = """Tu es un assistant expert en maintenance industrielle. 
Réponds à la question en te basant STRICTEMENT sur le contexte fourni. 
Cite tes sources en utilisant [1], [2], etc. qui correspondent aux numéros dans le contexte.
Sois concis et précis. Si l'information n'est pas dans le contexte, dis-le clairement."""

        user_prompt = f"Contexte:\n{context}\n\nQuestion: {request.query}\n\nRéponse:"

        try:
            chat_response = mistral_client.chat.complete(
                model="mistral-small-latest",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=500,
            )

            generated_answer = ""
            if chat_response and getattr(chat_response, "choices", None):
                msg = chat_response.choices[0].message.content
                if isinstance(msg, str):
                    generated_answer = msg
                elif isinstance(msg, list):
                    parts = []
                    for item in msg:
                        if isinstance(item, str):
                            parts.append(item)
                        elif isinstance(item, dict) and item.get("text"):
                            parts.append(item.get("text"))
                        else:
                            parts.append(str(item))
                    generated_answer = " ".join(parts)
                else:
                    generated_answer = str(msg)

            print("✅ Réponse générée par Mistral")
        
        except Exception as mistral_error:
            print(f"❌ Erreur Mistral: {mistral_error}")
            raise HTTPException(
                status_code=502,
                detail=f"Erreur de génération: {mistral_error}"
            )

        # --- 6. TRAITEMENT DES CITATIONS AVEC POSITIONS PRÉCISES ---
        print("5️⃣ Extraction des citations...")
        citations = citation_tracker.create_citation_objects(
            cited_chunks=reranked_results,
            response_text=generated_answer
        )
        
        print(f"✅ {len(citations)} citations extraites")

        # --- 7. FORMATER LA RÉPONSE COMPLÈTE ---
        # Sources pour compatibilité (format simplifié)
        sources_for_frontend = [
            {
                "document_name": c["document_name"],
                "page_number": c["page_number"],
                "content_preview": c["text"][:150] + "..."
            }
            for c in citations
        ]

        return {
            "answer": generated_answer.strip(),
            "sources": sources_for_frontend,  # Format legacy
            "citations": citations,  # Format enrichi avec char_start/char_end
            "citation_count": len(citations),
            "search_stats": {
                "vector_results": len(vector_results['documents'][0]),
                "hybrid_results": len(hybrid_results),
                "reranked_results": len(reranked_results)
            }
        }

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"❌ Erreur RAG: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne: {str(e)}"
        )

# --- ENDPOINT DE PRÉVISION PDR (MACHINE LEARNING) ---
@app.post("/api/v1/pdr/forecast")
async def forecast_pdr_endpoint(
    request: ForecastRequest,
    current_user: UserTokenData = Depends(get_current_user)
):
    """
    Entraîne un modèle ML (Prophet, ARIMA, LSTM) sur les données historiques
    et renvoie les prévisions de consommation de pièces.
    Les données historiques sont envoyées directement depuis le frontend (IndexedDB).
    """
    print(f"Requête de prévision PDR de {current_user.sub}: Machine={request.machine}, Pièce={request.part_reference}, Modèle={request.model_type}")
    
    try:
        # Import du module de forecasting
        from scripts.forecast_pdr import forecast_pdr
        
        # --- 1. Vérifier que les données historiques sont fournies ---
        if not hasattr(request, 'historical_data') or not request.historical_data:
            raise HTTPException(
                status_code=400,
                detail="Aucune donnée historique fournie. Veuillez envoyer le champ 'historical_data'."
            )
        
        historical_data = request.historical_data
        print(f"📊 Reçu {len(historical_data)} mois de données historiques depuis le frontend.")
        
        # --- 2. Appeler la fonction de forecasting ---
        print(f"🤖 Entraînement du modèle {request.model_type}...")
        print(f"⚙️ MTBF activé: {request.use_mtbf}, Facteur de sécurité: {request.safety_factor}x")
        
        result = forecast_pdr(
            historical_data=historical_data,
            model_type=request.model_type,
            horizon=request.horizon,
            params=request.params,
            use_mtbf=request.use_mtbf,
            safety_factor=request.safety_factor
        )
        
        print(f"✅ Prévision réussie. Métriques: MAE={result['metrics']['mae']}, R²={result['metrics']['r2']}")
        
        # --- 3. Enrichir avec les métadonnées de la requête ---
        result["machine"] = request.machine
        result["part_reference"] = request.part_reference
        result["user_id"] = current_user.sub
        
        return result
        
    except HTTPException as http_exc:
        raise http_exc
    except ImportError as import_err:
        print(f"Erreur d'importation: {import_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Module de prévision non disponible. Installez les dépendances: {import_err}"
        )
    except Exception as e:
        print(f"Erreur lors de la prévision PDR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération des prévisions: {str(e)}"
        )

# --- ENDPOINT POUR SERVIR LES PDFs LOCAUX ---
@app.get("/api/v1/pdf/{user_id}/{filename}")
async def serve_pdf(
    user_id: str,
    filename: str,
    current_user: UserTokenData = Depends(get_current_user)
):
    """
    Sert un PDF stocké localement
    Vérifie que l'utilisateur a accès à son propre fichier
    """
    # Vérification de sécurité: l'utilisateur ne peut accéder qu'à ses propres fichiers
    if current_user.sub != user_id:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé: vous ne pouvez accéder qu'à vos propres documents"
        )
    
    # Construire le chemin du fichier
    file_path = PDF_STORAGE_DIR / user_id / filename
    
    # Vérifier que le fichier existe
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Fichier non trouvé: {filename}"
        )
    
    # Retourner le fichier avec inline disposition (prevents download)
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={filename}"
        }
    )

# --- Lancement du serveur Uvicorn ---
if __name__ == "__main__":
    # S'exécute quand on lance 'python main.py'
    # Utilise le port 8000 par défaut et active le rechargement automatique (--reload)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)