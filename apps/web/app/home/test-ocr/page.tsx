// 1. OBLIGATOIRE pour une page interactive (boutons, états)
'use client';

// 2. Importations React et Supabase
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// 3. Importations des composants UI de Makerkit (pour que ça ressemble au reste)
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
// 4. Le composant de notre page
export default function TestOcrPage() {
  // États pour stocker le fichier, la réponse de l'API, et le statut
  const [file, setFile] = useState<File | null>(null);
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 5. Créer un client Supabase pour le navigateur
  // On en a besoin pour récupérer le "badge" (token) de l'utilisateur
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // 6. Fonction quand l'utilisateur choisit un fichier
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

// 7. Fonction quand l'utilisateur clique sur "Envoyer" (LE CŒUR DE L'OPÉRATION)
  const handleSubmit = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier PDF.');
      return;
    }

    setLoading(true);
    setError('');
    setResponseText('');

    try {
      // 7a. RÉCUPÉRER LE TOKEN (le "badge" de sécurité)
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error("Impossible de récupérer la session. Êtes-vous connecté ?");
      }
      
      const token = sessionData.session.access_token;
      
      // 7b. Préparer le fichier pour l'envoi (FormData)
      const formData = new FormData();
      formData.append('file', file);

      // 7c. APPELER LE BACKEND FASTAPI (Le pont est fait ici !)
      const response = await fetch('http://localhost:8000/api/v1/ocr/upload', {
        method: 'POST',
        // C'EST LA LIGNE MAGIQUE : on passe le "badge"
        headers: {
          Authorization: `Bearer ${token}`, 
        },
        body: formData,
      });

      // 7d. Gérer la réponse de FastAPI
      if (!response.ok) {
        // Gérer les erreurs (ex: 401 si le token est mauvais, 500 si Poppler plante)
        const errorData = await response.json();
        throw new Error(`Erreur ${response.status}: ${errorData.detail || 'Erreur inconnue'}`);
      }

      // Si tout va bien, on affiche le résultat
      const result = await response.json();
      
      // *** LA LIGNE CORRIGÉE EST ICI ***
      setResponseText(`Le document a été traité avec succès !\n\nMessage: ${result.message}\nChunks indexés: ${result.chunks_indexed}`);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 8. L'affichage (le HTML) de la page
  return (
    <div className="flex flex-col space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Test du Pont d'Authentification (OCR + FastAPI)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-2">
            <Label htmlFor="pdf-upload">1. Choisissez un fichier PDF</Label>
            <Input id="pdf-upload" type="file" accept="application/pdf" onChange={handleFileChange} />
          </div>

          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Traitement en cours...' : "2. Lancer l'OCR"}
          </Button>

          {error && (
            <div className="rounded-md border border-red-500 bg-red-50 p-4 text-red-700">
              <p><b>Erreur :</b> {error}</p>
            </div>
          )}

          {responseText && (
            <div className="flex flex-col space-y-2">
              <Label>Réponse de FastAPI (Texte extrait) :</Label>
              <Textarea
                readOnly
                value={responseText}
                className="h-64 font-mono text-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}