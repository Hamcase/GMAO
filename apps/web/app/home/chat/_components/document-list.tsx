'use client';

import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card } from '@kit/ui/card';
import { Trash2, FileText, Eye, RefreshCw } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

interface Document {
  filename: string;
  size_mb: number;
  uploaded_at: number;
  chunk_count: number;
  url: string;
}

export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) {
        console.error('No token available');
        return;
      }
      
      const response = await fetch('http://localhost:8000/api/v1/documents/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur chargement documents');
      
      const data = await response.json();
      setDocuments(data.documents);
    } catch (error) {
      console.error('Erreur chargement documents:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchDocuments();
  }, []);
  
  const deleteDocument = async (filename: string) => {
    if (!confirm(`Supprimer "${filename}" et tous ses vecteurs ?\n\nCette action est irréversible.`)) {
      return;
    }
    
    setDeleting(filename);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const response = await fetch(
        `http://localhost:8000/api/v1/documents/${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.ok) {
        alert('✅ Document supprimé avec succès');
        fetchDocuments();
      } else {
        const error = await response.json();
        alert(`❌ Erreur: ${error.detail}`);
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('❌ Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  };
  
  const viewPDF = async (doc: Document) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const url = `http://localhost:8000${doc.url}?token=${token}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Erreur ouverture PDF:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        Chargement des documents...
      </div>
    );
  }
  
  if (documents.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>Aucun document OCR trouvé</p>
        <p className="text-sm mt-1">Uploadez des PDFs dans l'onglet OCR pour commencer</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Documents indexés ({documents.length})
        </h3>
        <Button variant="outline" size="sm" onClick={fetchDocuments}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
        {documents.map((doc) => (
          <Card key={doc.filename} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {doc.size_mb} MB • {doc.chunk_count} chunks • 
                    {' '}{new Date(doc.uploaded_at * 1000).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewPDF(doc)}
                  title="Voir le PDF"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteDocument(doc.filename)}
                  disabled={deleting === doc.filename}
                  title="Supprimer"
                >
                  {deleting === doc.filename ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
