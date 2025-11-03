# --- IMPORTATIONS STANDARD ET DE BIBLIOTHÈQUES TIERCES ---
import pytesseract
import uvicorn
import os
import re # Pour le découpage (chunking)
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from pdf2image import convert_from_bytes
from pypdf import PdfReader
from dotenv import load_dotenv

# --- NOUVELLES IMPORTATIONS POUR RAG ET LLM ---
from supabase import create_client, Client # Pour se connecter à la DB Supabase
from sentence_transformers import SentenceTransformer # Pour créer les vecteurs (embeddings)
from mistralai.client import MistralClient # Pour l'API Mistral
from mistralai.models.chat_completion import ChatMessage # Pour formater les messages Mistral

# --- CHARGEMENT DES SECRETS DEPUIS backend/.env ---
load_dotenv()

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

# 2. Modèle d'IA pour les Embeddings (Sentence Transformer)
# 'all-MiniLM-L6-v2' est léger, rapide et performant (vecteurs de taille 384)
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    print("Modèle SentenceTransformer ('all-MiniLM-L6-v2') chargé avec succès.")
except Exception as e:
    print(f"Erreur de chargement du modèle SentenceTransformer: {e}")
    exit(1)

# 3. Client pour l'API Mistral
try:
    mistral_client = MistralClient(api_key=MISTRAL_API_KEY)
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
# ---

# --- SÉCURITÉ : AUTHENTIFICATION JWT ---
# oauth2_scheme va chercher le token dans l'en-tête "Authorization: Bearer <token>"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl n'est pas utilisé ici mais requis

async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserTokenData:
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

# --- FONCTION UTILITAIRE : DÉCOUPAGE (CHUNKING) ---
def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """
    Découpe un texte en morceaux (chunks) avec chevauchement.
    Version robuste aux sorties OCR mal formatées.
    """
    # 1. Normaliser : remplacer tous espaces/sauts de ligne par un seul espace
    text = re.sub(r'\s+', ' ', text).strip()
    chunks = []
    start = 0
    print(f"Découpage du texte (longueur: {len(text)})...")

    # 2. Parcourir et découper
    while start < len(text):
        end = start + chunk_size
        # Si possible, couper proprement à un espace
        if end < len(text):
            last_space = text.rfind(' ', start, end)
            if last_space != -1 and last_space > start: # S'assurer qu'on ne coupe pas au début
                 end = last_space

        chunks.append(text[start:end].strip()) # Ajouter le morceau
        
        # Si on a coupé à un espace, avancer après l'espace pour éviter doublon au début du chunk suivant
        if end < len(text) and text[end] == ' ':
            start = end + 1
        else: # Sinon, avancer normalement avec chevauchement
             next_start = start + chunk_size - overlap
             # Eviter de reculer si on a coupé court à cause d'un espace
             start = max(end, next_start) if end < len(text) else next_start


    # Filtrer les chunks vides ou trop courts après le strip()
    chunks = [chunk for chunk in chunks if len(chunk) > 10]
    
    print(f"Découpage en {len(chunks)} chunks.")
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

    # --- 1. EXTRACTION DE TEXTE (OCR si nécessaire) ---
    full_text = ""
    try:
        pdf_reader = PdfReader(BytesIO(file_content))
        print(f"PDF contient {len(pdf_reader.pages)} pages (Extraction numérique).")
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text: # Ajouter seulement s'il y a du texte
                full_text += page_text + "\n\n"

        # Si le texte numérique est très court, forcer l'OCR
        if len(full_text.strip()) < 100:
            print("Texte numérique minimal. Forçage de l'OCR.")
            full_text = "" # Réinitialiser
            raise Exception("Force OCR") # Passer à l'OCR

        print("Extraction numérique réussie.")
    except Exception as e:
        print(f"Extraction numérique échouée ou forcée ({e}). Passage à l'OCR.")
        try:
            # S'assurer que Poppler est dans le PATH système
            images = convert_from_bytes(file_content, dpi=200)
            print(f"Conversion du PDF en {len(images)} images pour l'OCR.")
            for i, image in enumerate(images):
                print(f"Traitement OCR pour la page {i+1}...")
                # Spécifier les langues français ET anglais
                full_text += pytesseract.image_to_string(image, lang='fra+eng') + "\n\n"
            print("OCR terminé.")
        except Exception as ocr_error:
            print(f"ERREUR FATALE OCR: {ocr_error}")
            raise HTTPException(status_code=500, detail=f"Erreur OCR: {ocr_error}. Poppler est-il installé et dans le PATH?")

    if len(full_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Aucun texte n'a pu être extrait du document.")

    # --- 2. DÉCOUPAGE (CHUNKING) ---
    chunks = chunk_text(full_text)
    if not chunks:
        raise HTTPException(status_code=400, detail="Le document n'a pas pu être découpé en morceaux exploitables.")

    # --- 3. VECTORISATION (EMBEDDINGS) ---
    print(f"Génération des embeddings pour {len(chunks)} chunks...")
    try:
        embeddings = embedding_model.encode(chunks).tolist() # .tolist() pour Supabase
        print("Embeddings générés.")
    except Exception as emb_error:
        print(f"Erreur lors de la génération des embeddings: {emb_error}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération des embeddings: {emb_error}")


    # --- 4. PRÉPARATION DES DONNÉES POUR LA DB ---
    data_to_insert = []
    for i in range(len(chunks)):
        data_to_insert.append({
            "document_name": file.filename,
            "content": chunks[i],
            "embedding": embeddings[i] # Le vecteur correspondant
        })

    # --- 5. INSERTION DANS SUPABASE (TABLE document_chunks) ---
    try:
        print(f"Insertion de {len(data_to_insert)} chunks dans Supabase...")
        supabase.table("document_chunks").insert(data_to_insert).execute()
        print("Insertion réussie.")
    except Exception as db_error:
        print(f"Erreur d'insertion DB: {db_error}")
        raise HTTPException(status_code=500, detail=f"Erreur de base de données lors de l'insertion: {db_error}")

    # --- 6. (Bonus) SAUVEGARDE DU PDF DANS SUPABASE STORAGE ---
    try:
        # S'assurer que le bucket "documents" existe et est privé
        file_path_in_storage = f"{current_user.sub}/{file.filename}" # Chemin: /user_id/nom_fichier.pdf
        
        # Utiliser BytesIO pour re-lire le contenu sans re-appeler await file.read()
        file_stream = BytesIO(file_content) 
        
        supabase.storage.from_("documents").upload(
            path=file_path_in_storage,
            file=file_content, # Passer directement les bytes (CORRECT)
            file_options={"content-type": file.content_type or "application/pdf", "upsert": "true"}
    )
        print(f"PDF sauvegardé dans Supabase Storage sous: {file_path_in_storage}")
    except Exception as storage_error:
        # Ne pas bloquer si le storage échoue, l'indexation est plus importante
        print(f"Erreur de sauvegarde Storage (ignorable): {storage_error}")

    # --- 7. RÉPONSE AU FRONTEND ---
    return {
        "status": "Succès",
        "filename": file.filename,
        "message": f"Document traité et indexé avec succès.",
        "chunks_indexed": len(chunks)
    }

# --- ENDPOINT DE RECHERCHE RAG + GÉNÉRATION ---
@app.post("/api/v1/rag/query")
async def rag_query_with_generation(
    request: QueryRequest,
    current_user: UserTokenData = Depends(get_current_user) # Route protégée
):
    """
    Reçoit une question, trouve les chunks pertinents avec pgvector,
    puis utilise l'API Mistral pour générer une réponse basée sur ces chunks.
    """
    print(f"Nouvelle requête RAG+Génération de {current_user.sub}: {request.query}")

    try:
        # --- 1. Vectoriser la question (avec le même modèle) ---
        query_embedding = embedding_model.encode(request.query).tolist()

        # --- 2. Récupérer les chunks pertinents via la fonction SQL 'match_document_chunks' ---
        rpc_response = supabase.rpc(
            "match_document_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.2, # Seuil bas pour inclure plus de résultats potentiels
                "match_count": 5       # Renvoyer les 5 meilleurs (selon la similarité)
            }
        ).execute()

        relevant_chunks = rpc_response.data
        if not relevant_chunks:
            print("Aucun chunk pertinent trouvé par la recherche vectorielle.")
            return {"answer": "Désolé, je n'ai trouvé aucune information pertinente dans les documents indexés pour répondre à cette question.", "sources": []}

        print(f"Trouvé {len(relevant_chunks)} chunks pertinents.")

        # --- 3. Construire le contexte pour le LLM ---
        context = "\n\n---\n\n".join([f"Source: {chunk['document_name']}\nExtrait: {chunk['content']}" for chunk in relevant_chunks])

        # --- 4. Préparer le prompt pour Mistral ---
        system_prompt = "Tu es un assistant expert en maintenance industrielle. Réponds à la question posée en te basant STRICTEMENT et UNIQUEMENT sur le contexte fourni ci-dessous. Ne fais pas référence à tes connaissances générales. Cite tes sources explicitement en indiquant le nom du document mentionné dans le contexte (ex: 'Selon le document X...'). Sois concis et précis. Si le contexte ne contient pas la réponse, indique clairement 'L'information n'est pas disponible dans les documents fournis'."
        user_prompt = f"Contexte:\n{context}\n\nQuestion: {request.query}\n\nRéponse:"

        # --- 5. Appeler l'API Mistral ---
        print("Appel à l'API Mistral...")
        try:
             chat_response = mistral_client.chat(
                 model="mistral-tiny", # Modèle rapide et économique pour commencer
                 messages=[
                     ChatMessage(role="system", content=system_prompt),
                     ChatMessage(role="user", content=user_prompt)
                 ],
                 temperature=0.1, # Réponse plus factuelle
                 max_tokens=300 # Limiter la longueur de la réponse
             )
             generated_answer = chat_response.choices[0].message.content
             print("Réponse reçue de Mistral.")
        except Exception as mistral_error:
             print(f"Erreur lors de l'appel à l'API Mistral: {mistral_error}")
             raise HTTPException(status_code=502, detail=f"Erreur de communication avec le service de génération de langage: {mistral_error}")


        # --- 6. Renvoyer la réponse générée ET les sources au frontend ---
        sources_for_frontend = [{"document_name": chunk['document_name'], "content_preview": chunk['content'][:150] + "..."} for chunk in relevant_chunks]

        return {
            "answer": generated_answer.strip(), # Nettoyer les espaces potentiels
            "sources": sources_for_frontend
        }

    except HTTPException as http_exc: # Propager les erreurs HTTP connues
        raise http_exc
    except Exception as e:
        print(f"Erreur inattendue lors de la requête RAG/Génération: {e}")
        # Renvoyer une erreur générique pour masquer les détails internes
        raise HTTPException(status_code=500, detail="Erreur interne du serveur lors du traitement de la requête.")

# --- Lancement du serveur Uvicorn ---
if __name__ == "__main__":
    # S'exécute quand on lance 'python main.py'
    # Utilise le port 8000 par défaut et active le rechargement automatique (--reload)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)