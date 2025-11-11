'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';
import { FileText, MapPin } from 'lucide-react';

// Types pour les données OCR
interface BoundingBox {
  x: number; // Position X (0-1, relatif à la largeur)
  y: number; // Position Y (0-1, relatif à la hauteur)
  width: number; // Largeur (0-1)
  height: number; // Hauteur (0-1)
}

interface ExtractedField {
  label: string;
  value: string;
  confidence: number; // 0-1
  bbox?: BoundingBox;
}

interface OCRBboxViewerProps {
  imageUrl?: string; // URL de l'image du document (peut être une page PDF convertie)
  fields: ExtractedField[];
  documentName?: string;
}

export function OCRBboxViewer({ imageUrl, fields, documentName = 'Document' }: OCRBboxViewerProps) {
  const [selectedField, setSelectedField] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dessiner l'image et les bounding boxes sur le canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const container = containerRef.current;

    if (!canvas || !image || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Attendre que l'image soit chargée
    const drawImageAndBoxes = () => {
      // Ajuster la taille du canvas à l'image
      const containerWidth = container.clientWidth;
      const scale = containerWidth / image.naturalWidth;
      const scaledHeight = image.naturalHeight * scale;

      canvas.width = containerWidth;
      canvas.height = scaledHeight;

      // Dessiner l'image de fond
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Dessiner les bounding boxes
      fields.forEach((field, index) => {
        if (!field.bbox) return;

        const isSelected = selectedField === index;
        const x = field.bbox.x * canvas.width;
        const y = field.bbox.y * canvas.height;
        const width = field.bbox.width * canvas.width;
        const height = field.bbox.height * canvas.height;

        // Style de la box
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#10b981'; // Bleu si sélectionné, vert sinon
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.1)';

        // Dessiner le rectangle
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);

        // Dessiner le numéro du champ
        ctx.fillStyle = isSelected ? '#3b82f6' : '#10b981';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${index + 1}`, x + 5, y + 18);
      });
    };

    if (image.complete) {
      drawImageAndBoxes();
    } else {
      image.onload = drawImageAndBoxes;
    }

    // Redessiner quand la sélection change
    return () => {
      image.onload = null;
    };
  }, [fields, selectedField, imageUrl]);

  // Gérer le clic sur le canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;

    // Trouver le champ cliqué
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field) continue;
      
      const bbox = field.bbox;
      if (!bbox) continue;

      if (
        x >= bbox.x &&
        x <= bbox.x + bbox.width &&
        y >= bbox.y &&
        y <= bbox.y + bbox.height
      ) {
        setSelectedField(i);
        return;
      }
    }

    // Aucun champ cliqué
    setSelectedField(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Visualisation du document avec bounding boxes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-blue-500" />
            {documentName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={containerRef} className="relative">
            {imageUrl ? (
              <>
                {/* Image cachée pour le chargement */}
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Document"
                  className="hidden"
                  crossOrigin="anonymous"
                />
                {/* Canvas pour dessiner les bounding boxes */}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="w-full cursor-pointer rounded-lg border shadow-sm"
                />
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
                <p className="text-sm text-muted-foreground">Aucune image disponible</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            💡 Cliquez sur une zone colorée pour voir les détails du champ extrait
          </p>
        </CardContent>
      </Card>

      {/* Liste des champs extraits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5 text-green-500" />
            Champs Extraits ({fields.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedField(index)}
                  className={`cursor-pointer rounded-lg border p-3 transition-all ${
                    selectedField === index
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {index + 1}
                        </Badge>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {field.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{field.value}</p>
                    </div>
                    <Badge 
                      variant={field.confidence > 0.9 ? 'default' : field.confidence > 0.7 ? 'secondary' : 'destructive'}
                      className="ml-2 text-[10px]"
                    >
                      {(field.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  {field.bbox && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>
                        Position: ({(field.bbox.x * 100).toFixed(1)}%, {(field.bbox.y * 100).toFixed(1)}%) | 
                        Taille: {(field.bbox.width * 100).toFixed(1)}% × {(field.bbox.height * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
