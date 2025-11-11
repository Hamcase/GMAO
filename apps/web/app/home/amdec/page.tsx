'use client';

import { useMemo, useState } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ExportPDFButton } from '~/components/export-pdf-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Input } from '@kit/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
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
  Wrench,
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
type Asset = { id: number; name: string; location?: string; criticality: 'A' | 'B' | 'C' };
type FunctionModel = { id: number; assetId: number; name: string };
type Effects = { local: string; system: string; safety: string };
type FailureMode = {
  id: number;
  functionId: number;
  component: string;
  mode: string;
  severity: number; // 1..10
  occurrence: number; // 1..10
  detection: number; // 1..10 (10 = difficile à détecter)
  frequency: number; // événements / mois
  cost: number; // € par événement
  effects: Effects;
  action: string;
  owner: string;
  dueInDays: number;
  status: 'open' | 'in-progress' | 'done';
};

// ========== Données Mock ===========
const assets: Asset[] = [
  { id: 1, name: 'Compresseur A1', location: 'Ligne 1', criticality: 'A' },
  { id: 2, name: 'Pompe P12', location: 'Ligne 2', criticality: 'B' },
  { id: 3, name: 'Convoyeur C3', location: 'Logistique', criticality: 'B' },
];

const functions: FunctionModel[] = [
  { id: 1, assetId: 1, name: 'Compression Air' },
  { id: 2, assetId: 2, name: 'Transfert Fluide' },
  { id: 3, assetId: 3, name: 'Transport Pièces' },
];

const failureModes: FailureMode[] = [
  {
    id: 1,
    functionId: 1,
    component: 'Roulements',
    mode: 'Usure prématurée',
    severity: 8,
    occurrence: 6,
    detection: 6,
    frequency: 3,
    cost: 1800,
    effects: { local: 'Vibration élevée', system: 'Perte de pression', safety: 'Risque d’échauffement' },
    action: 'Planifier remplacement conditionnel + lubrification',
    owner: 'Jean Dupont',
    dueInDays: 7,
    status: 'in-progress',
  },
  {
    id: 2,
    functionId: 2,
    component: 'Joint Mécanique',
    mode: 'Fuite hydraulique',
    severity: 7,
    occurrence: 5,
    detection: 5,
    frequency: 2,
    cost: 1200,
    effects: { local: 'Huile au sol', system: 'Baisse de débit', safety: 'Glissade opérateur' },
    action: 'Remplacer joint + upgrade qualité NBR',
    owner: 'Marie Martin',
    dueInDays: 3,
    status: 'open',
  },
  {
    id: 3,
    functionId: 3,
    component: 'Bande Transporteuse',
    mode: 'Dérive / Mauvais centrage',
    severity: 6,
    occurrence: 7,
    detection: 4,
    frequency: 4,
    cost: 600,
    effects: { local: 'Arrêts fréquents', system: 'Goulot logistique', safety: 'Pincement léger' },
    action: 'Alignement + rouleaux guide + capteurs',
    owner: 'Paul Bernard',
    dueInDays: 14,
    status: 'open',
  },
  {
    id: 4,
    functionId: 1,
    component: 'Moteur',
    mode: 'Surchauffe',
    severity: 9,
    occurrence: 3,
    detection: 7,
    frequency: 1,
    cost: 4500,
    effects: { local: 'Température > 90°C', system: 'Arrêt sécurité', safety: 'Incendie (faible)' },
    action: 'Installer capteurs T°, alarme + nettoyage échangeur',
    owner: 'Sophie Laurent',
    dueInDays: 5,
    status: 'in-progress',
  },
];

// ========== Utils ==========
const rpn = (fm: Pick<FailureMode, 'severity' | 'occurrence' | 'detection'>) => fm.severity * fm.occurrence * fm.detection;
const riskColor = (value: number) =>
  value >= 200 ? '#ef4444' : value >= 120 ? '#f59e0b' : '#10b981';

export default function AMDECPage() {
  const [tab, setTab] = useState<'light' | 'model'>('light');
  const [filterAsset, setFilterAsset] = useState<number | 'all'>('all');
  const [aiAssist, setAiAssist] = useState(true);

  const fmList = useMemo(() =>
    failureModes.filter((f) =>
      filterAsset === 'all' ? true : functions.find((fn) => fn.id === f.functionId)?.assetId === filterAsset
    ),
  [filterAsset]);

  const rpnByComponent = useMemo(
    () => fmList.map((f) => ({ component: `${f.component}`, rpn: rpn(f) })),
    [fmList]
  );

  const statusCounts = useMemo(() => {
    return ['open', 'in-progress', 'done'].map((s) => ({
      name: s,
      value: fmList.filter((f) => f.status === (s as FailureMode['status'])).length,
      color: s === 'open' ? '#e11d48' : s === 'in-progress' ? '#f59e0b' : '#10b981',
    }));
  }, [fmList]);

  const topRisk = useMemo(() => fmList.slice().sort((a, b) => rpn(b) - rpn(a))[0], [fmList]);

  // Préparer les données pour l'export PDF
  const exportData = {
    kpis: [
      { label: 'Nombre de modes', value: fmList.length },
      { label: 'RPN Moyen', value: Math.round(fmList.reduce((sum, fm) => sum + rpn(fm), 0) / fmList.length) },
      { label: 'Modes critiques (RPN>200)', value: fmList.filter(fm => rpn(fm) > 200).length },
    ],
    table: {
      headers: ['Composant', 'Mode de défaillance', 'S', 'O', 'D', 'RPN'],
      rows: fmList.slice().sort((a, b) => rpn(b) - rpn(a)).slice(0, 10).map(fm => ({
        component: fm.component,
        mode: fm.mode,
        s: fm.severity,
        o: fm.occurrence,
        d: fm.detection,
        rpn: rpn(fm),
      })),
    },
  };

  return (
    <div className="flex flex-col space-y-6 pb-36">
      <AppBreadcrumbs values={{ AMDEC: '' }} />

      {/* Hero distinctif (teal/cyan) */}
      <Card className="border-0 bg-gradient-to-r from-teal-50/90 via-cyan-50/90 to-emerald-50/90 shadow-sm dark:from-teal-900/40 dark:via-cyan-900/40 dark:to-emerald-900/40">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AMDEC — Analyse des Modes de Défaillance</h1>
            <p className="text-sm text-muted-foreground">
              Vue Light (RPN + plan d’action) et Modèle complet (Asset → Function → FailureMode → Effects)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportPDFButton 
              data={exportData}
              filename="rapport_amdec.pdf"
              title="Rapport AMDEC"
            />
            <Select value={String(filterAsset)} onValueChange={(v) => setFilterAsset(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="w-[200px] bg-white/70 backdrop-blur dark:bg-black/30">
                <SelectValue placeholder="Filtrer équipement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les équipements</SelectItem>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} (Crit. {a.criticality})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-md bg-white/70 px-3 py-2 text-sm backdrop-blur dark:bg-black/30">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span className="hidden sm:inline">Assistance IA</span>
              <Switch checked={aiAssist} onCheckedChange={setAiAssist} />
            </div>
            <div className="hidden sm:block h-6 w-px bg-muted" />
            <div className="flex rounded-md p-1 ring-1 ring-teal-200 dark:ring-teal-900">
              <Button size="sm" variant={tab === 'light' ? 'default' : 'ghost'} onClick={() => setTab('light')} className="gap-2">
                <ListChecks className="h-4 w-4" /> Light
              </Button>
              <Button size="sm" variant={tab === 'model' ? 'default' : 'ghost'} onClick={() => setTab('model')} className="gap-2">
                <Cog className="h-4 w-4" /> Modèle
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {tab === 'light' ? <LightTab fmList={fmList} statusCounts={statusCounts} topRisk={topRisk} /> : <ModelTab />}
    </div>
  );
}

// ========== Onglet AMDEC Light ==========
function LightTab({
  fmList,
  statusCounts,
  topRisk,
}: {
  fmList: FailureMode[];
  statusCounts: { name: string; value: number; color: string }[];
  topRisk?: FailureMode;
}) {
  const rpnByComponent = useMemo<{ component: string; rpn: number }[]>(
    () => fmList.map((f) => ({ component: f.component, rpn: rpn(f) })),
    [fmList]
  );
  return (
    <>
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Modes de défaillance</CardTitle>
            <CardDescription>Total analysés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmList.length}</div>
            <p className="text-xs text-muted-foreground">échantillon</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">RPN moyen</CardTitle>
            <CardDescription>Criticité globale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(
                fmList.reduce((s, f) => s + rpn(f), 0) / Math.max(1, fmList.length)
              )}
            </div>
            <p className="text-xs text-muted-foreground">Seuil critique ≥ 200</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top RPN</CardTitle>
            <CardDescription>Plus risqué</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topRisk ? rpn(topRisk) : '-'}</div>
            <p className="text-xs text-muted-foreground">{topRisk?.component} — {topRisk?.mode}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Actions</CardTitle>
            <CardDescription>Ouvertes / En cours / Done</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-sm">
              {statusCounts.map((s) => (
                <div key={s.name} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-medium">
                    {s.name}: {s.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-5 w-5 text-teal-600" />
              RPN par composant
            </CardTitle>
            <CardDescription>Barres colorées selon criticité</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rpnByComponent}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="component" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="rpn" name="RPN">
                  {rpnByComponent.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={riskColor(entry.rpn)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Matrice de Risque (S x O) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-cyan-600" />
              Matrice de Risque
            </CardTitle>
            <CardDescription>Gravité (S) vs Occurrence (O)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="severity" name="S" domain={[1, 10]} tickCount={10} />
                <YAxis type="number" dataKey="occurrence" name="O" domain={[1, 10]} tickCount={10} />
                <ZAxis type="number" dataKey={(d: FailureMode) => 11 - d.detection} range={[60, 200]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Modes" data={fmList} fill="#22d3ee">
                  {fmList.map((f) => (
                    <Cell key={f.id} fill={riskColor(rpn(f))} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-2 text-xs text-muted-foreground">
              Taille du point ~ (11 - D) → plus grand = plus difficile à détecter
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan d'action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
            Plan d’action priorisé
          </CardTitle>
          <CardDescription>Trié par RPN décroissant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fmList
            .slice()
            .sort((a, b) => rpn(b) - rpn(a))
            .map((f) => (
              <Card key={f.id} className="border-l-4" style={{ borderLeftColor: riskColor(rpn(f)) }}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold">
                        {f.component} — {f.mode}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        S:{f.severity} • O:{f.occurrence} • D:{f.detection} • RPN:
                        <span className="ml-1 font-bold">{rpn(f)}</span>
                      </p>
                    </div>
                    <Badge variant={f.status === 'done' ? 'default' : f.status === 'in-progress' ? 'secondary' : 'destructive'}>
                      {f.status}
                    </Badge>
                  </div>
                  <div className="mb-3 rounded-md bg-muted p-2 text-xs">
                    <p><strong>Effets:</strong> {f.effects.local} • {f.effects.system} • {f.effects.safety}</p>
                    <p><strong>Impact business:</strong> {f.frequency}/mois • {f.cost.toLocaleString('fr-FR')}€ / événement</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">{f.action}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Resp. {f.owner}
                      </span>
                      <span className="rounded-md bg-cyan-100 px-2 py-1 text-xs text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200">
                        Échéance {f.dueInDays}j
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </CardContent>
      </Card>
    </>
  );
}

// ========== Onglet Modèle de Données ==========
function ModelTab() {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Modèle AMDEC — Entités & Relations</CardTitle>
            <CardDescription>Asset → Function → FailureMode → Effects (→ Action)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
                <h4 className="mb-1 font-semibold">Asset</h4>
                <p className="text-sm text-muted-foreground">{`{ id: number, name: string, location?: string, criticality: 'A'|'B'|'C' }`}</p>
              </div>
              <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
                <h4 className="mb-1 font-semibold">Function</h4>
                <p className="text-sm text-muted-foreground">{`{ id, assetId, name }`}</p>
              </div>
              <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
                <h4 className="mb-1 font-semibold">FailureMode</h4>
                <p className="text-sm text-muted-foreground">{`{ id, functionId, component, mode, severity (S), occurrence (O), detection (D), frequency/mois, cost/événement, effects, action, owner, dueInDays, status }`}</p>
              </div>
              <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
                <h4 className="mb-1 font-semibold">Effects</h4>
                <p className="text-sm text-muted-foreground">{`{ local, system, safety }`}</p>
              </div>
              <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
                <h4 className="mb-1 font-semibold">RPN (criticité)</h4>
                <p className="text-sm text-muted-foreground">RPN = S × O × D (1..1000). Seuil critique ≥ 200.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exemple instancié */}
        <Card>
          <CardHeader>
            <CardTitle>Exemple — Asset → Failure Modes</CardTitle>
            <CardDescription>Données d’exemple instanciées</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {assets.map((a) => (
              <div key={a.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-teal-600" />
                    <h4 className="font-semibold">{a.name}</h4>
                  </div>
                  <Badge>Crit. {a.criticality}</Badge>
                </div>
                <div className="space-y-3">
                  {functions
                    .filter((fn) => fn.assetId === a.id)
                    .map((fn) => (
                      <div key={fn.id} className="rounded-md border p-3">
                        <p className="mb-2 text-sm font-medium">Fonction: {fn.name}</p>
                        <div className="space-y-2">
                          {failureModes
                            .filter((fm) => fm.functionId === fn.id)
                            .map((fm) => (
                              <div key={fm.id} className="rounded-md bg-muted p-2 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">{fm.component} — {fm.mode}</span>
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">RPN {rpn(fm)}</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Effets: {fm.effects.local}; {fm.effects.system}; {fm.effects.safety}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}