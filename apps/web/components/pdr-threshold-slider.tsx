'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Settings } from 'lucide-react';

export function PDRThresholdSlider() {
  const [safetyStock, setSafetyStock] = useState(25);
  const [reorderPoint, setReorderPoint] = useState(40);
  const currentStock = 17; // From real data

  const getStatus = () => {
    if (currentStock < safetyStock) return { label: 'CRITIQUE', color: 'bg-red-500' };
    if (currentStock < reorderPoint) return { label: 'ATTENTION', color: 'bg-orange-500' };
    return { label: 'BON', color: 'bg-green-500' };
  };

  const status = getStatus();

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-500" />
          Ajustement Seuils en Temps Réel
        </CardTitle>
        <CardDescription>
          Modifier les seuils et voir l'impact immédiat sur le statut
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stock actuel */}
        <div className="rounded-lg bg-muted p-4">
          <div className="mb-2 flex items-center justify-between">
            <Label>Stock Actuel: Filtres HF35</Label>
            <Badge className={`${status.color} text-lg text-white`}>
              {currentStock} pièces - {status.label}
            </Badge>
          </div>
          <div className="relative h-4 w-full rounded-full bg-gray-200">
            <div
              className={`absolute left-0 h-full rounded-full transition-all ${status.color}`}
              style={{ width: `${(currentStock / reorderPoint) * 100}%` }}
            />
            {/* Marqueur seuil sécurité */}
            <div
              className="absolute top-0 h-full w-1 bg-orange-600"
              style={{ left: `${(safetyStock / reorderPoint) * 100}%` }}
            >
              <span className="absolute -top-6 -translate-x-1/2 text-xs font-semibold text-orange-600">
                Sécurité
              </span>
            </div>
          </div>
        </div>

        {/* Slider Seuil de Sécurité */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="safety-slider">Seuil de Sécurité</Label>
            <span className="text-sm font-semibold text-orange-600">{safetyStock} pièces</span>
          </div>
          <input
            id="safety-slider"
            type="range"
            min={10}
            max={50}
            step={5}
            value={safetyStock}
            onChange={(e) => setSafetyStock(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            En dessous de ce seuil → Alerte CRITIQUE
          </p>
        </div>

        {/* Slider Point de Réapprovisionnement */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="reorder-slider">Point de Réapprovisionnement</Label>
            <span className="text-sm font-semibold text-blue-600">{reorderPoint} pièces</span>
          </div>
          <input
            id="reorder-slider"
            type="range"
            min={20}
            max={80}
            step={5}
            value={reorderPoint}
            onChange={(e) => setReorderPoint(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            En dessous de ce seuil → Alerte ATTENTION
          </p>
        </div>

        {/* Résumé impact */}
        <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-950">
          <p className="text-sm text-purple-900 dark:text-purple-100">
            <strong>Impact:</strong>{' '}
            {currentStock < safetyStock && (
              <span className="text-red-600">
                🚨 Stock critique ! Commander {reorderPoint - currentStock} pièces immédiatement.
              </span>
            )}
            {currentStock >= safetyStock && currentStock < reorderPoint && (
              <span className="text-orange-600">
                ⚠️ Stock faible. Commander {reorderPoint - currentStock} pièces sous 48h.
              </span>
            )}
            {currentStock >= reorderPoint && (
              <span className="text-green-600">
                ✅ Stock suffisant. Aucune action requise.
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
