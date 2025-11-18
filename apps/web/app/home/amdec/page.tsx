'use client';

import { useMemo, useState } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ExportPDFButton } from '~/components/export-pdf-button';
import { useAssets, useFunctions, useAllFailureModes, useAMDECRawData } from '@kit/shared/localdb/hooks';
import { db } from '@kit/shared/localdb/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Input } from '@kit/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
import { AMDECUpload } from './_components/amdec-upload';
import { AMDECAITab } from './_components/amdec-ai-tab';
import { VisualizationsTab } from './_components/visualizations-tab';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cog,
  ListChecks,
  Radar,
  Sparkles,
  TriangleAlert,
  Trash2,
  Wrench,
  Upload as UploadIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// ========== Types AMDEC ==========
type Asset = { 
  id: string; 
  code: string;
  name: string; 
  location?: string; 
  criticality?: 'A' | 'B' | 'C';
};

type FunctionModel = { 
  id: string; 
  assetId: string; 
  name: string;
  description?: string;
};

type Effects = { local: string; system: string; safety: string };

type FailureMode = {
  id: string;
  functionId: string;
  component: string;
  mode: string;
  severity: number; // 1..10
  occurrence: number; // 1..10
  detection: number; // 1..10 (10 = difficile à détecter)
  effects: Effects;
  action?: string;
  owner?: string;
  dueInDays?: number;
  status?: 'open' | 'in-progress' | 'done';
};

// ========== Utils ==========
const rpn = (fm: Pick<FailureMode, 'severity' | 'occurrence' | 'detection'>) => fm.severity * fm.occurrence * fm.detection;
const riskColor = (value: number) =>
  value >= 200 ? '#ef4444' : value >= 120 ? '#f59e0b' : '#10b981';

export default function AMDECPage() {
  const [tab, setTab] = useState<'upload' | 'amdec-ai' | 'visualizations'>('upload');
  const [filterAsset, setFilterAsset] = useState<string | 'all'>('all');
  const [aiAssist, setAiAssist] = useState(true);
  const [uploadKey, setUploadKey] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any[] | null>(null);

  // Use local IndexedDB hooks
  const assets = useAssets() || [];
  const functions = useFunctions() || [];
  const failureModes = useAllFailureModes() || [];
  const amdecRawData = useAMDECRawData() || [];

  // Convert local DB data to component types
  const assetList: Asset[] = useMemo(() => 
    assets.map(a => ({
      id: a.id,
      code: a.name, // Use name as code since code field doesn't exist
      name: a.name,
      location: a.location,
      criticality: (a.criticality || 'C') as 'A' | 'B' | 'C',
    })),
    [assets]
  );

  const functionList: FunctionModel[] = useMemo(() => 
    functions.map(f => ({
      id: f.id,
      assetId: f.assetId,
      name: f.name,
    })),
    [functions]
  );

  const failureModeList: FailureMode[] = useMemo(() => 
    failureModes.map(fm => ({
      id: fm.id,
      functionId: fm.functionId,
      component: fm.component,
      mode: fm.mode,
      severity: fm.severity,
      occurrence: fm.occurrence,
      detection: fm.detection,
      effects: {
        local: fm.effectsLocal || 'N/A',
        system: fm.effectsSystem || 'N/A',
        safety: fm.effectsSafety || 'N/A',
      },
      action: fm.action,
      owner: fm.owner,
      dueInDays: fm.dueInDays,
      status: (fm.status || 'open') as 'open' | 'in-progress' | 'done',
    })),
    [failureModes]
  );

  const fmList = useMemo(() =>
    failureModeList.filter((f) =>
      filterAsset === 'all' ? true : functionList.find((fn) => fn.id === f.functionId)?.assetId === filterAsset
    ),
  [filterAsset, failureModeList, functionList]);

  const rpnByComponent = useMemo(
    () => fmList.map((f) => ({ component: `${f.component}`, rpn: rpn(f) })),
    [fmList]
  );

  const matrixData = useMemo(() => {
    const grid: { x: number; y: number; count: number }[] = [];
    for (let s = 1; s <= 10; s++) {
      for (let o = 1; o <= 10; o++) {
        const count = fmList.filter((f) => f.severity === s && f.occurrence === o).length;
        if (count > 0) grid.push({ x: o, y: s, count });
      }
    }
    return grid;
  }, [fmList]);

  const statusCounts = useMemo(() => {
    return ['open', 'in-progress', 'done'].map((s) => ({
      name: s,
      value: fmList.filter((f) => f.status === (s as FailureMode['status'])).length,
      color: s === 'open' ? '#e11d48' : s === 'in-progress' ? '#f59e0b' : '#10b981',
    }));
  }, [fmList]);

  const topRisk = useMemo(() => fmList.slice().sort((a, b) => rpn(b) - rpn(a))[0], [fmList]);

  // Filter data by selected machine
  const filteredAMDECData = useMemo(() => 
    filterAsset === 'all' ? amdecRawData : amdecRawData.filter(r => r.machine === filterAsset),
    [filterAsset, amdecRawData]
  );

  // Préparer les données pour l'export PDF (machine-specific)
  const exportData = {
    title: 'Rapport AMDEC - Analyse des modes de défaillance',
    date: new Date().toLocaleDateString('fr-FR'),
    machine: filterAsset === 'all' ? 'Toutes machines' : filterAsset,
    kpis: [
      { label: 'Pannes totales', value: filteredAMDECData.length },
      { label: 'Machines', value: filterAsset === 'all' ? new Set(filteredAMDECData.map(r => r.machine).filter(Boolean)).size : 1 },
      { label: 'Coût total', value: `${Math.round(filteredAMDECData.reduce((sum, r) => sum + (r.materialCost || 0), 0)).toLocaleString()}€` },
      { label: 'Arrêts cumulés', value: `${Math.round(filteredAMDECData.reduce((sum, r) => sum + (r.downtimeDuration || 0), 0))}h` },
    ],
    summary: {
      topFailures: Array.from(
        filteredAMDECData.reduce((map, r) => {
          if (r.failureType) map.set(r.failureType, (map.get(r.failureType) || 0) + 1);
          return map;
        }, new Map<string, number>())
      ).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topComponents: Array.from(
        filteredAMDECData.reduce((map, r) => {
          if (r.component) {
            const current = map.get(r.component) || { count: 0, cost: 0 };
            map.set(r.component, {
              count: current.count + 1,
              cost: current.cost + (r.materialCost || 0),
            });
          }
          return map;
        }, new Map<string, { count: number; cost: number }>())
      ).sort((a, b) => b[1].count - a[1].count).slice(0, 5),
    },
    analysisTable: analysisResults || [], // Include AMDEC AI analysis
  };

  return (
    <div className="flex flex-col space-y-6 pb-36">
      <AppBreadcrumbs values={{ AMDEC: '' }} />

      {/* Hero distinctif (teal/cyan) */}
      <Card className="border-0 bg-gradient-to-br from-teal-600 via-cyan-600 to-emerald-600 text-white shadow-lg">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">AMDEC / Fiabilité & Risques</h1>
            <p className="text-sm text-teal-100">
              Analyse structurée des modes de défaillance. Import, synthèse IA et visualisations avancées.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-teal-300 bg-teal-500/20 text-teal-50 backdrop-blur">
                Local DB
              </Badge>
              <span className="text-xs text-teal-100">
                {amdecRawData.length > 0
                  ? `${amdecRawData.length} lignes • ${new Set(amdecRawData.map(r => r.machine).filter(Boolean)).size} machines`
                  : 'Aucune donnée AMDEC — Importez un CSV'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full bg-white/10 p-1 ring-1 ring-white/20 backdrop-blur">
                <Button 
                  size="sm" 
                  variant={tab === 'upload' ? 'default' : 'ghost'} 
                  onClick={() => setTab('upload')} 
                  className={`gap-1 ${tab === 'upload' ? 'bg-white text-teal-700 hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                >
                  <UploadIcon className="h-4 w-4" /> Import
                </Button>
                <Button 
                  size="sm" 
                  variant={tab === 'amdec-ai' ? 'default' : 'ghost'} 
                  onClick={() => setTab('amdec-ai')} 
                  className={`gap-1 ${tab === 'amdec-ai' ? 'bg-white text-teal-700 hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                >
                  <Sparkles className="h-4 w-4" /> AMDEC IA
                </Button>
                <Button 
                  size="sm" 
                  variant={tab === 'visualizations' ? 'default' : 'ghost'} 
                  onClick={() => setTab('visualizations')} 
                  className={`gap-1 ${tab === 'visualizations' ? 'bg-white text-teal-700 hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                >
                  <Radar className="h-4 w-4" /> Visualisations
                </Button>
              </div>
              <Select value={String(filterAsset)} onValueChange={(v) => setFilterAsset(v === 'all' ? 'all' : v)}>
                <SelectTrigger className="w-[210px] bg-white/10 text-white backdrop-blur ring-1 ring-white/30">
                  <SelectValue placeholder="Filtrer machine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les machines</SelectItem>
                  {Array.from(new Set(amdecRawData.map(r => r.machine).filter(Boolean))).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur ring-1 ring-white/20">
                <Sparkles className="h-4 w-4 text-teal-200" /> IA
                <Switch checked={aiAssist} onCheckedChange={setAiAssist} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {amdecRawData.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-2 bg-red-500/20 text-white border-red-300/30 backdrop-blur hover:bg-red-500/40"
                  onClick={async () => {
                    if (confirm(`Supprimer toutes les ${amdecRawData.length} lignes AMDEC de la base locale ?`)) {
                      await db.amdecRawData.clear();
                      setUploadKey(k => k + 1);
                      window.location.reload();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Vider base
                </Button>
              )}
              <ExportPDFButton
                data={exportData}
                filename="rapport_amdec.pdf"
                title="Rapport AMDEC"
                className="gap-2 bg-white text-teal-700 border-white/30 hover:bg-white/90"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {tab === 'upload' && (
        <div className="space-y-6">
          <AMDECUpload
            key={uploadKey}
            onUploadComplete={() => {
              setUploadKey((k) => k + 1);
            }}
          />
          {amdecRawData.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Inventaire actuel</CardTitle>
                <CardDescription className="text-xs">
                  {amdecRawData.length} lignes • {new Set(amdecRawData.map(r => r.machine).filter(Boolean)).size} machines • {new Set(amdecRawData.map(r => r.component).filter(Boolean)).size} composants
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                Données importées. Passez à l'onglet "AMDEC IA" pour générer l'analyse.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'amdec-ai' && (
        <AMDECAITab 
          amdecRawData={amdecRawData} 
          filterMachine={filterAsset} 
          aiEnabled={aiAssist}
          onAnalysisGenerated={setAnalysisResults}
        />
      )}

      {tab === 'visualizations' && <VisualizationsTab amdecRawData={amdecRawData} filterMachine={filterAsset} />}
    </div>
  );
}
