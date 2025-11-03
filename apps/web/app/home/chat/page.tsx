// // 1. OBLIGATOIRE pour une page interactive (boutons, états)
// 'use client';

// // 2. Importations React, Supabase et composants UI
// import { useState } from 'react';
// import { createBrowserClient } from '@supabase/ssr'; // Assurez-vous que pnpm add @supabase/ssr -w a été exécuté
// import { Button } from '@kit/ui/button'; // Chemin corrigé pour le monorepo
// import { Input } from '@kit/ui/input'; // Chemin corrigé
// import { Label } from '@kit/ui/label'; // Chemin corrigé
// import { Textarea } from '@kit/ui/textarea'; // Chemin corrigé (non utilisé ici, mais bon à garder)
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card'; // Chemin corrigé
// import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert'; // Importation pour les messages d'erreur

// // 3. Définir une interface pour nos SOURCES (les morceaux utilisés comme contexte)
// interface Source {
//   document_name: string;
//   content_preview: string; // Le backend envoie un aperçu du contenu
// }

// // 4. Le composant React de notre page de Chat
// export default function ChatPage() {
//   // États pour stocker la question, la réponse générée, les sources, et le statut (chargement, erreur)
//   const [query, setQuery] = useState(''); // Ce que l'utilisateur tape
//   const [answer, setAnswer] = useState(''); // La réponse générée par Mistral
//   const [sources, setSources] = useState<Source[]>([]); // La liste des sources utilisées
//   const [loading, setLoading] = useState(false); // Indicateur de chargement
//   const [error, setError] = useState(''); // Pour afficher les messages d'erreur

//   // 5. Créer un client Supabase pour le navigateur
//   // Nécessaire pour récupérer le token JWT de l'utilisateur connecté
//   const supabase = createBrowserClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!, // Variable d'env publique définie dans apps/web/.env.local
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Variable d'env publique
//   );

//   // 6. Fonction déclenchée lors de l'envoi de la question
//   const handleSubmitQuery = async () => {
//     // Vérification simple
//     if (!query.trim()) {
//       setError('Veuillez entrer une question.');
//       return;
//     }

//     // Réinitialiser l'état pour une nouvelle requête
//     setLoading(true);
//     setError('');
//     setAnswer(''); // Effacer l'ancienne réponse
//     setSources([]); // Effacer les anciennes sources

//     try {
//       // 6a. Récupérer le token JWT de la session Supabase actuelle
//       const { data: sessionData, error: sessionError } =
//         await supabase.auth.getSession();

//       // Vérifier si l'utilisateur est bien connecté
//       if (sessionError || !sessionData.session) {
//         throw new Error("Impossible de récupérer la session. Êtes-vous sûr d'être connecté ?");
//       }
//       const token = sessionData.session.access_token; // Le "badge" d'authentification

//       // 6b. Appeler l'endpoint RAG + Génération de notre backend FastAPI
//       const response = await fetch('http://localhost:8000/api/v1/rag/query', { // L'URL de notre API FastAPI
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json', // Indiquer qu'on envoie du JSON
//           Authorization: `Bearer ${token}`, // Passer le token JWT pour l'authentification
//         },
//         // Envoyer la question de l'utilisateur dans le corps de la requête
//         body: JSON.stringify({ query: query }),
//       });

//       // 6c. Gérer la réponse de FastAPI
//       if (!response.ok) {
//         // Si le backend renvoie une erreur (4xx ou 5xx)
//         let errorDetail = 'Erreur inconnue du serveur.';
//         try {
//           const errorData = await response.json();
//           errorDetail = errorData.detail || `Erreur ${response.status}`;
//         } catch (jsonError) {
//           // Si la réponse d'erreur n'est pas du JSON
//            errorDetail = `Erreur ${response.status}: ${response.statusText}`;
//         }
//         throw new Error(errorDetail);
//       }

//       // Si la réponse est OK (200), extraire les données JSON
//       const data = await response.json();

//       // Mettre à jour l'état avec la réponse générée et les sources
//       setAnswer(data.answer || "L'API n'a pas retourné de réponse formatée.");
//       setSources(data.sources || []);

//       // Gérer le cas où Mistral n'a rien trouvé ou a indiqué ne pas savoir
//       if (data.answer && (!data.sources || data.sources.length === 0)) {
//          // C'est normal si Mistral dit "je ne sais pas", on n'affiche pas d'erreur
//          setError(''); // On efface une potentielle erreur précédente
//       } else if (!data.answer) {
//          setError("Aucune réponse n'a pu être générée par le modèle.");
//       }


//     } catch (err: any) {
//       // Afficher l'erreur à l'utilisateur
//       setError(err.message || "Une erreur inattendue est survenue.");
//       console.error("Erreur lors de la requête RAG:", err); // Log pour le débogage
//     } finally {
//       // Arrêter l'indicateur de chargement dans tous les cas
//       setLoading(false);
//     }
//   };

//   // 7. L'interface utilisateur (JSX / HTML)
//   return (
//     <div className="flex flex-col space-y-6 p-4 md:p-6"> {/* Ajout de padding */}
//       {/* Carte pour poser la question */}
//       <Card>
//         <CardHeader>
//           <CardTitle>Chatbot GMAO+IA</CardTitle>
//           <CardDescription>
//             Posez une question sur vos documents de maintenance indexés.
//           </CardDescription>
//         </CardHeader>
//         <CardContent className="flex flex-col space-y-4">
//           <div className="flex w-full items-center space-x-2">
//             <Input
//               id="chat-query"
//               type="text"
//               placeholder="Ex: Quelle est la procédure pour changer les roulements ?"
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//               // Permet d'envoyer la question en appuyant sur "Entrée"
//               onKeyDown={(e) => { if (e.key === 'Enter' && !loading) { handleSubmitQuery(); } }}
//               disabled={loading} // Désactiver pendant le chargement
//             />
//             <Button onClick={handleSubmitQuery} disabled={loading}>
//               {loading ? 'Recherche...' : 'Envoyer'}
//             </Button>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Zone pour afficher l'état de chargement */}
//       {loading && (
//          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
//              {/* Vous pourriez ajouter un spinner ici */}
//              <span>Recherche des documents et génération de la réponse...</span>
//          </div>
//       )}

//       {/* Zone pour afficher les erreurs */}
//       {error && !loading && (
//         <Alert variant="destructive">
//           <AlertTitle>Erreur</AlertTitle>
//           <AlertDescription>{error}</AlertDescription>
//         </Alert>
//       )}

//       {/* Zone pour afficher la réponse générée */}
//       {answer && !loading && (
//         <Card>
//           <CardHeader>
//             <CardTitle className="text-lg font-semibold">Réponse Générée :</CardTitle>
//           </CardHeader>
//           <CardContent>
//             {/* 'whitespace-pre-wrap' respecte les sauts de ligne et retours chariot de la réponse */}
//             <p className="text-sm whitespace-pre-wrap">{answer}</p>
//           </CardContent>
//         </Card>
//       )}

//       {/* Zone pour afficher les sources utilisées */}
//       {sources.length > 0 && !loading && (
//         <div className="space-y-3">
//           <h3 className="text-md font-semibold">Sources utilisées pour générer la réponse :</h3>
//           <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"> {/* Affichage en grille */}
//             {sources.map((source, index) => (
//               <Card key={index} className="bg-muted/30 border border-border/50"> {/* Style légèrement différent */}
//                 <CardHeader className="p-3">
//                   <CardTitle className="text-xs font-medium truncate" title={source.document_name}> {/* Troncature si nom long */}
//                     Source {index + 1}: {source.document_name}
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent className="p-3 pt-0">
//                   <p className="text-xs text-muted-foreground italic">
//                     "...{source.content_preview}" {/* Aperçu du chunk */}
//                   </p>
//                 </CardContent>
//               </Card>
//             ))}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// 1. OBLIGATOIRE pour une page interactive
'use client';

// 2. Importations React, Supabase et composants UI
import React, { useState, useRef, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { ScrollArea } from '@kit/ui/scroll-area'; // Pour la zone de chat scrollable
import { Avatar, AvatarFallback, AvatarImage } from "@kit/ui/avatar"; // Pour les icônes utilisateur/bot

// 3. Interfaces pour les messages et les sources
interface Source {
  document_name: string;
  content_preview: string;
}

interface Message {
  id: string; // Pour React key prop
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[]; // Les sources ne s'appliquent qu'aux messages de l'assistant
}

// 4. Le composant de notre page Chatbot
export default function ChatPage() {
  // États
  const [messages, setMessages] = useState<Message[]>([]); // Historique de la conversation
  const [currentQuery, setCurrentQuery] = useState(''); // Ce que l'utilisateur tape
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Référence pour scroller automatiquement vers le bas
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null); // Référence ajoutée pour le viewport

  // 5. Client Supabase (pour le token)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Effet pour scroller vers le bas quand un nouveau message arrive
  useEffect(() => {
    if (viewportRef.current) {
        // Accès direct à l'élément du viewport
       viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
     }
   }, [messages]);


  // 6. Fonction pour envoyer la question au backend
  const handleSendMessage = async () => {
    const trimmedQuery = currentQuery.trim();
    if (!trimmedQuery) return; // Ne pas envoyer de message vide

    // Ajouter le message utilisateur à l'historique
    const userMessage: Message = {
      id: Date.now().toString() + '-user',
      role: 'user',
      content: trimmedQuery,
    };
    setMessages((prev) => [...prev, userMessage]);
    setCurrentQuery(''); // Vider l'input
    setLoading(true);
    setError('');

    try {
      // Récupérer le token
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("Impossible de récupérer la session. Êtes-vous connecté ?");
      }
      const token = sessionData.session.access_token;

      // Appeler l'API RAG + Génération
      const response = await fetch('http://localhost:8000/api/v1/rag/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: trimmedQuery }),
      });

      if (!response.ok) {
        let errorDetail = 'Erreur inconnue du serveur.';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || `Erreur ${response.status}`;
        } catch (jsonError) {
           errorDetail = `Erreur ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();

      // Ajouter la réponse de l'assistant à l'historique
      const assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: data.answer || "Désolé, je n'ai pas pu générer de réponse.",
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err: any) {
      setError(err.message || "Une erreur inattendue est survenue.");
      // Optionnel : Ajouter un message d'erreur dans le chat
      // const errorMessage: Message = { id: Date.now().toString() + '-error', role: 'assistant', content: `Erreur: ${err.message}` };
      // setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // 7. L'interface utilisateur (JSX)
  return (
    <div className="flex h-[calc(100vh-theme(space.24))] flex-col p-4 md:p-6"> {/* Hauteur calculée pour remplir l'écran moins le header potentiel */}
      {/* En-tête (optionnel, peut être intégré dans le layout principal) */}
      <Card className="mb-4 flex-shrink-0">
        <CardHeader>
          <CardTitle>Chatbot GMAO+IA</CardTitle>
          <CardDescription>
            Interrogez vos documents de maintenance.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Zone de chat scrollable */}
       <ScrollArea ref={scrollAreaRef} className="flex-grow rounded-md border p-4 mb-4" viewportRef={viewportRef}>
         <div className="flex flex-col space-y-4">
           {messages.map((message) => (
             <div
               key={message.id}
               className={`flex items-start space-x-3 ${
                 message.role === 'user' ? 'justify-end' : ''
               }`}
             >
               {/* Avatar pour le bot */}
               {message.role === 'assistant' && (
                 <Avatar className="h-8 w-8 flex-shrink-0">
                   {/* Vous pouvez mettre une image de bot ici */}
                   <AvatarFallback>IA</AvatarFallback>
                 </Avatar>
               )}

              {/* Bulle de message */}
              <div
                className={`max-w-[75%] rounded-lg p-3 text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {/* Contenu du message */}
                <p className="whitespace-pre-wrap">{message.content}</p>

                {/* Affichage des sources pour les messages de l'assistant */}
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Sources :</p>
                    {message.sources.map((source, index) => (
                      <div key={index} className="text-xs text-muted-foreground/80" title={source.content_preview}>
                        <span className="font-semibold">{index + 1}.</span> {source.document_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

               {/* Avatar pour l'utilisateur */}
               {message.role === 'user' && (
                 <Avatar className="h-8 w-8 flex-shrink-0">
                   {/* Vous pouvez mettre une image d'utilisateur ici */}
                   <AvatarFallback>VOUS</AvatarFallback>
                 </Avatar>
               )}
             </div>
           ))}
            {/* Indicateur de chargement pendant que le bot répond */}
            {loading && (
              <div className="flex items-start space-x-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                     <AvatarFallback>IA</AvatarFallback>
                  </Avatar>
                  <div className="max-w-[75%] rounded-lg p-3 text-sm bg-muted">
                     <p className="italic text-muted-foreground">Recherche et rédaction en cours...</p>
                     {/* Vous pouvez ajouter un spinner ici */}
                 </div>
             </div>
            )}
         </div>
       </ScrollArea>

      {/* Zone d'erreur (si elle n'est pas affichée dans le chat) */}
      {error && !loading && (
        <Alert variant="destructive" className="mb-4 flex-shrink-0">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Zone de saisie en bas */}
      <div className="flex w-full items-center space-x-2 flex-shrink-0">
        <Input
          id="chat-input"
          type="text"
          placeholder="Posez votre question ici..."
          value={currentQuery}
          onChange={(e) => setCurrentQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) { handleSendMessage(); } }}
          disabled={loading}
          className="flex-grow"
        />
        <Button onClick={handleSendMessage} disabled={loading || !currentQuery.trim()}>
          Envoyer
        </Button>
      </div>
    </div>
  );
}