'use client';

import { useState, useEffect } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Checkbox } from '@kit/ui/checkbox';
import { AlertCircle, Download, FileText, Wrench, AlertTriangle, BookOpen } from 'lucide-react';
import { AIFeedback } from '~/components/ai-feedback';
import { AIResponseHistory } from '~/components/ai-response-history';
import { db } from '@kit/shared/localdb/schema';
import type { AIInteraction } from '@kit/shared/localdb/schema';
import { v4 as uuid } from 'uuid';

type Solution = {
  title: string;
  summary: string;
  steps: string[];
  safety?: string[];
  parts?: { ref: string; name: string; qty: number }[];
  tools?: {
    category: 'Mesure' | 'Mécanique' | 'Électrique' | 'Fluide' | 'Référence';
    refOrType: string;
    detail: string;
    value?: string;
    notes?: string;
  }[];
  risk?: {
    severity: 'Faible' | 'Moyenne' | 'Élevée' | 'Critique';
    probability: 'Rare' | 'Possible' | 'Probable' | 'Fréquente';
    level: 'Faible' | 'Modéré' | 'Important' | 'Critique';
    ppe: string[];
    lotoSteps: string[];
  };
  resources?: { title: string; source: string; url: string }[];
};

export default function GenAIPage() {
  const [equipment, setEquipment] = useState('');
  const [priority, setPriority] = useState('normale');
  const [description, setDescription] = useState('');
  const [solution, setSolution] = useState<Solution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Feedback loop state
  const [sessionId, setSessionId] = useState<string>('');
  const [currentInteractionId, setCurrentInteractionId] = useState<string>('');
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [currentRating, setCurrentRating] = useState<1 | -1 | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [responseHistory, setResponseHistory] = useState<AIInteraction[]>([]);

  const [options, setOptions] = useState({
    detailedSteps: true,
    includeSafety: true,
    suggestParts: true,
    includeTools: true,
    includeRisk: true,
    includeResources: true,
  });
  
  // Load history when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSessionHistory();
    }
  }, [sessionId]);
  
  const loadSessionHistory = async () => {
    try {
      const history = await db.aiInteractions
        .where('sessionId')
        .equals(sessionId)
        .sortBy('createdAt');
      setResponseHistory(history);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleGenerate = async (regenerationComment?: string) => {
    if (!description.trim()) {
      setError('Veuillez décrire le problème.');
      return;
    }

    setLoading(true);
    setError(null);
    setSolution(null);

    // Create new session on first generation
    const newSessionId = sessionId || uuid();
    if (!sessionId) {
      setSessionId(newSessionId);
      setRegenerationCount(0);
    }

    try {
      const res = await fetch('/api/genai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          equipment, 
          priority, 
          description, 
          options,
          // Include context for regeneration
          regenerationContext: regenerationComment ? {
            previousFeedback: regenerationComment,
            attemptNumber: regenerationCount + 1
          } : undefined
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Erreur serveur');
      }
      
      // Validate solution structure
      if (!data.solution || !data.solution.title || !Array.isArray(data.solution.steps)) {
        console.error('Invalid solution structure:', data);
        throw new Error('La réponse de l\'IA n\'est pas correctement structurée. Veuillez réessayer.');
      }

      setSolution(data.solution);
      
      // Save interaction to IndexedDB
      const interactionId = uuid();
      const interaction: AIInteraction = {
        id: interactionId,
        sessionId: newSessionId,
        queryData: {
          equipment,
          priority,
          description,
          options,
        },
        responseData: data.solution,
        feedbackRating: null,
        feedbackComment: regenerationComment,
        regenerationCount: regenerationCount,
        isAccepted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await db.aiInteractions.add(interaction);
      setCurrentInteractionId(interactionId);
      setCurrentRating(null);
      setIsAccepted(false);
      
      // Reload history
      await loadSessionHistory();
      
    } catch (err: any) {
      setError(err.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFeedback = async (rating: 1 | -1, comment?: string) => {
    if (!currentInteractionId) return;
    
    try {
      const accepted = rating === 1;
      
      await db.aiInteractions.update(currentInteractionId, {
        feedbackRating: rating,
        feedbackComment: comment,
        isAccepted: accepted,
        updatedAt: new Date(),
      });
      
      setCurrentRating(rating);
      setIsAccepted(accepted);
      
      // Reload history
      await loadSessionHistory();
      
    } catch (error) {
      console.error('Failed to save feedback:', error);
      throw error;
    }
  };
  
  const handleRegenerate = async (comment?: string) => {
    setRegenerationCount(prev => prev + 1);
    await handleGenerate(comment);
  };
  
  const handleSelectHistoricalResponse = async (id: string) => {
    try {
      const interaction = await db.aiInteractions.get(id);
      if (interaction) {
        setSolution(interaction.responseData);
        setCurrentInteractionId(interaction.id);
        setCurrentRating(interaction.feedbackRating);
        setIsAccepted(interaction.isAccepted);
        setRegenerationCount(interaction.regenerationCount);
      }
    } catch (error) {
      console.error('Failed to load historical response:', error);
    }
  };
  
  const handleNewQuery = () => {
    // Reset everything for a new query
    setSessionId('');
    setCurrentInteractionId('');
    setRegenerationCount(0);
    setCurrentRating(null);
    setIsAccepted(false);
    setResponseHistory([]);
    setSolution(null);
    setError(null);
    setEquipment('');
    setDescription('');
  };

  const exportToPDF = () => {
    if (!solution) return;
    
    // Créer un HTML bien structuré pour le PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${solution.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #2563eb; margin-top: 30px; border-left: 4px solid #2563eb; padding-left: 10px; }
    .summary { background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .steps { counter-reset: step; }
    .steps li { margin: 10px 0; counter-increment: step; }
    .steps li::marker { content: counter(step) ". "; font-weight: bold; color: #2563eb; }
    .safety { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
    .parts, .tools { display: table; width: 100%; border-collapse: collapse; margin: 15px 0; }
    .parts div, .tools div { display: table-row; }
    .parts span, .tools span { display: table-cell; padding: 8px; border: 1px solid #ddd; }
    .parts span:first-child, .tools span:first-child { font-weight: bold; background: #f3f4f6; }
    .risk { background: #fee2e2; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0; }
    .risk-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }
    .risk-item { background: white; padding: 10px; border-radius: 5px; }
    .risk-item strong { display: block; color: #dc2626; margin-bottom: 5px; }
    .resources a { color: #2563eb; text-decoration: none; }
    .resources div { margin: 10px 0; padding: 10px; background: #f9fafb; border-radius: 5px; }
    ul { list-style-type: disc; padding-left: 25px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${solution.title}</h1>
  <div class="summary"><strong>Résumé:</strong> ${solution.summary}</div>
  
  <h2>📋 Étapes de la procédure</h2>
  <ol class="steps">
    ${solution.steps.map(step => `<li>${step}</li>`).join('')}
  </ol>
  
  ${solution.safety ? `
  <div class="safety">
    <h2>⚠️ Consignes de sécurité</h2>
    <ul>
      ${solution.safety.map(s => `<li>${s}</li>`).join('')}
    </ul>
  </div>` : ''}
  
  ${solution.parts && solution.parts.length > 0 ? `
  <h2>🔧 Pièces suggérées</h2>
  <div class="parts">
    <div><span>Référence</span><span>Désignation</span><span>Quantité</span></div>
    ${solution.parts.map(p => `<div><span>${p.ref}</span><span>${p.name}</span><span>${p.qty}</span></div>`).join('')}
  </div>` : ''}
  
  ${solution.tools && solution.tools.length > 0 ? `
  <h2>🛠️ Outils et spécifications</h2>
  <div class="tools">
    <div><span>Catégorie</span><span>Type/Référence</span><span>Détails</span><span>Valeur</span></div>
    ${solution.tools.map(t => `<div><span>${t.category}</span><span>${t.refOrType}</span><span>${t.detail}</span><span>${t.value || '-'}</span></div>`).join('')}
  </div>` : ''}
  
  ${solution.risk ? `
  <div class="risk">
    <h2>🚨 Évaluation des risques et LOTO</h2>
    <div class="risk-grid">
      <div class="risk-item"><strong>Gravité</strong>${solution.risk.severity}</div>
      <div class="risk-item"><strong>Probabilité</strong>${solution.risk.probability}</div>
      <div class="risk-item"><strong>Niveau de risque</strong>${solution.risk.level}</div>
    </div>
    <h3>Équipements de Protection Individuelle (EPI)</h3>
    <ul>${solution.risk.ppe.map(e => `<li>${e}</li>`).join('')}</ul>
    <h3>Étapes de consignation (LOTO)</h3>
    <ol>${solution.risk.lotoSteps.map(s => `<li>${s}</li>`).join('')}</ol>
  </div>` : ''}
  
  ${solution.resources && solution.resources.length > 0 ? `
  <h2>📚 Ressources documentaires</h2>
  <div class="resources">
    ${solution.resources.map(r => `
    <div>
      <strong>${r.title}</strong><br>
      <small>Source: ${r.source}</small><br>
      <a href="${r.url}" target="_blank">${r.url}</a>
    </div>`).join('')}
  </div>` : ''}
  
  <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #6b7280; font-size: 12px;">
    Procédure générée le ${new Date().toLocaleDateString('fr-FR')} par GMAO Gen AI
  </div>
</body>
</html>
    `;

    // Ouvrir dans une nouvelle fenêtre pour impression PDF
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        win.print();
      }, 250);
    }
  };

  const exportToCSV = () => {
    if (!solution) return;

    const rows: string[][] = [];

    // En-tête du document
    rows.push(['PROCÉDURE DE MAINTENANCE']);
    rows.push(['Titre', solution.title]);
    rows.push(['Résumé', solution.summary]);
    rows.push(['Date de génération', new Date().toLocaleDateString('fr-FR')]);
    rows.push([]);

    // Étapes
    rows.push(['ÉTAPES DE LA PROCÉDURE']);
    rows.push(['N°', 'Description']);
    solution.steps.forEach((step, i) => {
      rows.push([String(i + 1), step]);
    });
    rows.push([]);

    // Consignes de sécurité
    if (solution.safety && solution.safety.length > 0) {
      rows.push(['CONSIGNES DE SÉCURITÉ']);
      rows.push(['N°', 'Consigne']);
      solution.safety.forEach((s, i) => {
        rows.push([String(i + 1), s]);
      });
      rows.push([]);
    }

    // Pièces suggérées
    if (solution.parts && solution.parts.length > 0) {
      rows.push(['PIÈCES SUGGÉRÉES']);
      rows.push(['Référence', 'Désignation', 'Quantité']);
      solution.parts.forEach(p => {
        rows.push([p.ref, p.name, String(p.qty)]);
      });
      rows.push([]);
    }

    // Outils et spécifications
    if (solution.tools && solution.tools.length > 0) {
      rows.push(['OUTILS ET SPÉCIFICATIONS']);
      rows.push(['Catégorie', 'Type/Référence', 'Détails', 'Valeur', 'Notes']);
      solution.tools.forEach(t => {
        rows.push([
          t.category,
          t.refOrType,
          t.detail,
          t.value || '',
          t.notes || ''
        ]);
      });
      rows.push([]);
    }

    // Évaluation des risques
    if (solution.risk) {
      rows.push(['ÉVALUATION DES RISQUES']);
      rows.push(['Critère', 'Valeur']);
      rows.push(['Gravité', solution.risk.severity]);
      rows.push(['Probabilité', solution.risk.probability]);
      rows.push(['Niveau de risque', solution.risk.level]);
      rows.push([]);

      rows.push(['ÉQUIPEMENTS DE PROTECTION INDIVIDUELLE (EPI)']);
      rows.push(['N°', 'EPI']);
      solution.risk.ppe.forEach((e, i) => {
        rows.push([String(i + 1), e]);
      });
      rows.push([]);

      rows.push(['ÉTAPES DE CONSIGNATION (LOTO)']);
      rows.push(['N°', 'Étape']);
      solution.risk.lotoSteps.forEach((s, i) => {
        rows.push([String(i + 1), s]);
      });
      rows.push([]);
    }

    // Ressources documentaires
    if (solution.resources && solution.resources.length > 0) {
      rows.push(['RESSOURCES DOCUMENTAIRES']);
      rows.push(['Titre', 'Source', 'URL']);
      solution.resources.forEach(r => {
        rows.push([r.title, r.source, r.url]);
      });
    }

    // Convertir en CSV avec gestion correcte des colonnes
    const csv = rows.map(row => {
      if (row.length === 0) return '';
      return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    }).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Procedure_${solution.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col space-y-4 pb-36">
      <AppBreadcrumbs values={{ 'Gen AI - Génération de procédures': '' }} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formulaire */}
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Nouvelle procédure</h2>

          <div className="space-y-2">
            <Label htmlFor="equipment">Équipement</Label>
            <Input
              id="equipment"
              placeholder="Ex: Compresseur Atlas Copco GA55"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priorité</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="faible">Faible</SelectItem>
                <SelectItem value="normale">Normale</SelectItem>
                <SelectItem value="élevée">Élevée</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description du problème *</Label>
            <Textarea
              id="description"
              placeholder="Décrivez le problème rencontré..."
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <h3 className="font-medium">Options</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="detailedSteps"
                  checked={options.detailedSteps}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, detailedSteps: !!v })
                  }
                />
                <Label htmlFor="detailedSteps">Étapes détaillées</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeSafety"
                  checked={options.includeSafety}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, includeSafety: !!v })
                  }
                />
                <Label htmlFor="includeSafety">Consignes de sécurité</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="suggestParts"
                  checked={options.suggestParts}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, suggestParts: !!v })
                  }
                />
                <Label htmlFor="suggestParts">Suggérer pièces de rechange</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeTools"
                  checked={options.includeTools}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, includeTools: !!v })
                  }
                />
                <Label htmlFor="includeTools">Outils et spécifications</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeRisk"
                  checked={options.includeRisk}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, includeRisk: !!v })
                  }
                />
                <Label htmlFor="includeRisk">Évaluation risques / LOTO</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeResources"
                  checked={options.includeResources}
                  onCheckedChange={(v) =>
                    setOptions({ ...options, includeResources: !!v })
                  }
                />
                <Label htmlFor="includeResources">Ressources documentaires</Label>
              </div>
            </div>
          </div>

          <Button onClick={() => handleGenerate()} disabled={loading} className="w-full">
            {loading ? 'Génération...' : 'Générer la procédure'}
          </Button>
          
          {sessionId && responseHistory.length > 0 && (
            <Button onClick={handleNewQuery} variant="outline" className="w-full">
              Nouvelle demande
            </Button>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Résultat */}
        <div className="space-y-4">
          {/* Response History */}
          {responseHistory.length > 0 && (
            <AIResponseHistory
              history={responseHistory}
              currentResponseId={currentInteractionId}
              onSelectResponse={handleSelectHistoricalResponse}
            />
          )}
          
          {solution && (
            <div className="space-y-4 rounded-lg border bg-card p-6">
              <div className="flex items-start justify-between">
                <h2 className="text-xl font-semibold">{solution.title}</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportToPDF}>
                    <FileText className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportToCSV}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{solution.summary}</p>
              
              {/* AI Feedback Component */}
              <AIFeedback
                onFeedback={handleFeedback}
                onRegenerate={handleRegenerate}
                regenerationCount={regenerationCount}
                maxRegenerations={5}
                isAccepted={isAccepted}
                currentRating={currentRating}
                disabled={loading}
              />

              <div className="space-y-3">
                <h3 className="font-semibold">Étapes</h3>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {solution.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              {solution.safety && solution.safety.length > 0 && (
                <div className="space-y-2 rounded-md border border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950">
                  <h3 className="flex items-center gap-2 font-semibold text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="h-4 w-4" />
                    Consignes de sécurité
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-yellow-700 dark:text-yellow-300">
                    {solution.safety.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {solution.parts && solution.parts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Pièces suggérées</h3>
                  <div className="space-y-1">
                    {solution.parts.map((part, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border p-2 text-sm"
                      >
                        <span>
                          <strong>{part.ref}</strong> - {part.name}
                        </span>
                        <span className="text-muted-foreground">Qté: {part.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {solution.tools && solution.tools.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Wrench className="h-4 w-4" />
                    Outils et spécifications
                  </h3>
                  <div className="space-y-2">
                    {solution.tools.map((tool, i) => (
                      <div key={i} className="rounded-md border p-3 text-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {tool.category} - {tool.refOrType}
                            </p>
                            <p className="text-muted-foreground">{tool.detail}</p>
                            {tool.value && (
                              <p className="mt-1 text-xs">
                                <strong>Valeur:</strong> {tool.value}
                              </p>
                            )}
                            {tool.notes && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {tool.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {solution.risk && (
                <div className="space-y-3 rounded-md border border-red-500 bg-red-50 p-4 dark:bg-red-950">
                  <h3 className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    Évaluation des risques et LOTO
                  </h3>
                  <div className="grid gap-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="font-medium">Gravité</p>
                        <p className="text-red-700 dark:text-red-300">
                          {solution.risk.severity}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Probabilité</p>
                        <p className="text-red-700 dark:text-red-300">
                          {solution.risk.probability}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Niveau de risque</p>
                        <p className="font-bold text-red-700 dark:text-red-300">
                          {solution.risk.level}
                        </p>
                      </div>
                    </div>

                    {solution.risk.ppe.length > 0 && (
                      <div>
                        <p className="font-medium">EPI requis</p>
                        <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-300">
                          {solution.risk.ppe.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {solution.risk.lotoSteps.length > 0 && (
                      <div>
                        <p className="font-medium">Étapes LOTO (Consignation)</p>
                        <ol className="mt-1 list-decimal pl-5 text-red-700 dark:text-red-300">
                          {solution.risk.lotoSteps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {solution.resources && solution.resources.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <BookOpen className="h-4 w-4" />
                    Ressources documentaires
                  </h3>
                  <div className="space-y-2">
                    {solution.resources.map((res, i) => (
                      <div key={i} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{res.title}</p>
                        <p className="text-xs text-muted-foreground">{res.source}</p>
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {res.url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}