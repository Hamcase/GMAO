'use client';

import { useState, useEffect } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ExportPDFButton } from '~/components/export-pdf-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Switch } from '@kit/ui/switch';
import { Label } from '@kit/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Users, 
  CheckCircle2, 
  BarChart3,
  Factory,
  Sparkles,
  Target,
  Zap,
  ListTodo,
  Filter
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
} from 'recharts';
import { useKpis, useAggregatedKpiAverages, useWorkOrders } from '@kit/shared/localdb/hooks';

// Helpers
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Note: sections historiques mockées (formation, OEE, 5S, Kanban) remplacées par données dynamiques ou états vides

const getStatusColor = (status: string) => {
  switch (status) {
    case 'excellent': return '#10b981';
    case 'good': return '#3b82f6';
    case 'warning': return '#f59e0b';
    default: return '#6b7280';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-500';
    default: return 'bg-gray-500';
  }
};

// Helpers for fallbacks
function getWindowHours(period: string): number {
  switch (period) {
    case '7days': return 7 * 24;
    case '30days': return 30 * 24;
    case '90days': return 90 * 24;
    case '6months': return 6 * 30 * 24;
    case '1year': return 365 * 24;
    default: return 30 * 24;
  }
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

function getDowntimeHours(wo: any, s?: Date | null, e?: Date | null): number {
  const downtime = Number(wo.downtimeHours ?? wo.downtime ?? wo['Durée arrêt (h)'] ?? wo['Duree arret (h)'] ?? 0);
  if (downtime && Number.isFinite(downtime) && downtime > 0) return downtime;
  if (s && e && e > s) return (e.getTime() - s.getTime()) / 3600000;
  return 0;
}

function computeFallbackAggregates(workOrders: any[], selectedPeriod: string): { mtbf: number|null; mttr: number|null; availability: number|null } {
  if (!workOrders || !workOrders.length) return { mtbf: null, mttr: null, availability: null };
  const now = new Date();
  const windowHours = getWindowHours(selectedPeriod);
  const windowStart = new Date(now.getTime() - windowHours * 3600000);
  const perAsset: Record<string, { dtSum: number; count: number; mttrSum: number; mttrN: number }> = {};
  for (const wo of workOrders) {
    const asset = wo.assetCode || wo.asset || wo.machine || 'N/A';
    const s = wo.startAt ? new Date(wo.startAt) : null;
    const e = wo.endAt ? new Date(wo.endAt) : null;
    const inWindow = (s && s >= windowStart) || (e && e >= windowStart);
    if (!inWindow) continue;
    const dt = getDowntimeHours(wo, s, e);
    if (!perAsset[asset]) perAsset[asset] = { dtSum: 0, count: 0, mttrSum: 0, mttrN: 0 };
    perAsset[asset].dtSum += dt;
    perAsset[asset].count += 1;
    if (s && e && e > s) {
      perAsset[asset].mttrSum += (e.getTime() - s.getTime()) / 3600000;
      perAsset[asset].mttrN += 1;
    } else if (dt > 0) {
      perAsset[asset].mttrSum += dt;
      perAsset[asset].mttrN += 1;
    }
  }
  const mtbfList: number[] = [];
  const mttrList: number[] = [];
  const availList: number[] = [];
  Object.values(perAsset).forEach(v => {
    if (v.count > 0) {
      const uptime = Math.max(0, windowHours - v.dtSum);
      const mtbf = uptime / v.count;
      if (Number.isFinite(mtbf) && mtbf >= 0) mtbfList.push(mtbf);
      const mttr = v.mttrN ? v.mttrSum / v.mttrN : 0;
      if (Number.isFinite(mttr) && mttr >= 0) mttrList.push(mttr);
      const availability = clampPct(100 * (1 - (v.dtSum / Math.max(1, windowHours))));
      availList.push(availability);
    }
  });
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return { mtbf: avg(mtbfList), mttr: avg(mttrList), availability: avg(availList) };
}

export default function DashboardPage() {
  // Using local IndexedDB instead of // supabase
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'kpis' | 'lean' | 'kanban'>('kpis');
  
  // Local DB hooks - live reactive queries
  const kpiData = useKpis();
  const aggregatedKpis = useAggregatedKpiAverages();
  const workOrders = useWorkOrders();
  
  // Debug: Log data to verify database state
  useEffect(() => {
    console.log('📊 Dashboard data state:', {
      kpiCount: kpiData?.length ?? 0,
      workOrderCount: workOrders?.length ?? 0,
      aggregatedKpis,
      sampleKpi: kpiData?.[0]
    });
  }, [kpiData, workOrders, aggregatedKpis]);
  
  // Filter states
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30days');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  // Derive machine options from KPI data
  const machineOptions = kpiData 
    ? Array.from(new Set(kpiData.map(k => k.assetCode).filter(Boolean)))
    : [];
  
  // Build workload data from work orders
  const workloadData = workOrders 
    ? Object.values(
        workOrders.reduce((acc: any, wo) => {
          const tech = wo.assignee?.trim();
          if (!tech) return acc;
          if (!acc[tech]) {
            acc[tech] = { technician_name: tech, completed: 0, in_progress: 0, planned: 0, utilization_pct: 0 };
          }
          if (wo.endAt) acc[tech].completed += 1;
          else if (wo.startAt) acc[tech].in_progress += 1;
          else acc[tech].planned += 1;
          return acc;
        }, {})
      )
    : [];
  
  const isLoading = !kpiData; // Data is loading if hooks haven't returned yet

  // Use aggregated KPI averages from the hook (already calculated)
  const avgMtbf = aggregatedKpis?.mtbf ?? null;
  const avgMttr = aggregatedKpis?.mttr ?? null;
  const avgAvailability = aggregatedKpis?.availability ?? null;

  const avgUtilization = workloadData.length > 0
    ? (workloadData.reduce((sum: number, row: any) => sum + (row.utilization_pct || 0), 0) / workloadData.length).toFixed(1)
    : null;

  // Group KPIs by asset for table display
  const kpisByAsset: Record<string, { mtbf?: number; mttr?: number; availability?: number; assetCode: string }> = {};
  if (kpiData) {
    kpiData.forEach((row) => {
      const key = row.assetCode;
      if (!kpisByAsset[key]) kpisByAsset[key] = { assetCode: key };
      if (row.metricType === 'mtbf') kpisByAsset[key].mtbf = row.metricValue;
      else if (row.metricType === 'mttr') kpisByAsset[key].mttr = row.metricValue;
      else if (row.metricType === 'availability') kpisByAsset[key].availability = row.metricValue;
    });
  }
  const pivotedKpis = Object.values(kpisByAsset);

  // Prepare export data for PDF
  const dashboardExportData = {
    kpis: [
      { label: 'MTBF Moyen', value: avgMtbf ? `${avgMtbf.toFixed(1)} heures` : '—' },
      { label: 'MTTR Moyen', value: avgMttr ? `${avgMttr.toFixed(1)} heures` : '—' },
      { label: 'Disponibilité', value: avgAvailability ? `${avgAvailability.toFixed(1)}%` : '—' },
      { label: 'Utilisation', value: avgUtilization ? `${avgUtilization}%` : '—' },
      { label: 'Techniciens actifs', value: String(workloadData.length || 0) },
      { label: 'Machines suivies', value: String(machineOptions.length || 0) },
    ],
    table: {
      headers: ['Machine', 'MTBF (h)', 'MTTR (h)', 'Disponibilité (%)', 'Statut'],
      rows: pivotedKpis.length
        ? pivotedKpis.slice(0, 10).map((k: any) => ({
            machine: k.assetCode || 'N/A',
            mtbf: k.mtbf?.toFixed(1) || 'N/A',
            mttr: k.mttr?.toFixed(1) || 'N/A',
            availability: k.availability?.toFixed(1) || 'N/A',
            status: (k.availability || 0) > 95 ? 'Excellent' : (k.availability || 0) > 85 ? 'Bon' : 'Attention',
          }))
        : [],
    },
  };

  return (
    <div className="flex flex-col space-y-6 pb-36">
      <AppBreadcrumbs values={{ Dashboard: '' }} />

      {/* Header with Export Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard GMAO</h1>
          <p className="text-muted-foreground">Vue d'ensemble des KPIs et performances</p>
        </div>
        <ExportPDFButton
          data={dashboardExportData}
          filename="rapport_dashboard_gmao.pdf"
          title="Dashboard GMAO - Rapport de Performance"
        />
      </div>

      {/* Dynamic Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-blue-500" />
            Filtres Dynamiques
          </CardTitle>
          <CardDescription>
            Personnalisez la vue des données en temps réel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Machine Filter */}
            <div className="space-y-2">
              <Label htmlFor="machine-filter" className="text-sm font-medium">
                🏭 Machine
              </Label>
              <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger id="machine-filter">
                  <SelectValue placeholder="Toutes les machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les machines</SelectItem>
                  {machineOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Period Filter */}
            <div className="space-y-2">
              <Label htmlFor="period-filter" className="text-sm font-medium">
                📅 Période
              </Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger id="period-filter">
                  <SelectValue placeholder="Derniers 30 jours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">7 derniers jours</SelectItem>
                  <SelectItem value="30days">30 derniers jours</SelectItem>
                  <SelectItem value="90days">90 derniers jours</SelectItem>
                  <SelectItem value="6months">6 derniers mois</SelectItem>
                  <SelectItem value="1year">1 an</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status-filter" className="text-sm font-medium">
                🚦 Statut
              </Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="excellent">✅ Excellent (&gt;95%)</SelectItem>
                  <SelectItem value="good">🟢 Bon (85-95%)</SelectItem>
                  <SelectItem value="warning">⚠️ Attention (&lt;85%)</SelectItem>
                  <SelectItem value="critical">🔴 Critique (&lt;70%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Summary */}
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedMachine !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Machine: {selectedMachine}
                <button
                  onClick={() => setSelectedMachine('all')}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {selectedPeriod !== '30days' && (
              <Badge variant="secondary" className="gap-1">
                Période: {selectedPeriod}
                <button
                  onClick={() => setSelectedPeriod('30days')}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {selectedStatus !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Statut: {selectedStatus}
                <button
                  onClick={() => setSelectedStatus('all')}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {(selectedMachine !== 'all' || selectedPeriod !== '30days' || selectedStatus !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedMachine('all');
                  setSelectedPeriod('30days');
                  setSelectedStatus('all');
                }}
                className="h-6 text-xs"
              >
                Réinitialiser tout
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Toggle IA Enhancement + Onglets */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Toggle IA */}
        <Card className="flex-1 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900">
                <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <Label htmlFor="ai-toggle" className="cursor-pointer font-semibold">
                  IA Enhancement
                </Label>
                <p className="text-xs text-muted-foreground">
                  {aiEnabled ? 'Prédictions et recommandations actives' : 'Données historiques uniquement'}
                </p>
              </div>
            </div>
            <Switch
              id="ai-toggle"
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </CardContent>
        </Card>

        {/* Onglets */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'kpis' ? 'default' : 'outline'}
            onClick={() => setActiveTab('kpis')}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            KPIs
          </Button>
          <Button
            variant={activeTab === 'lean' ? 'default' : 'outline'}
            onClick={() => setActiveTab('lean')}
            className="gap-2"
          >
            <Target className="h-4 w-4" />
            Lean Analytics
          </Button>
          <Button
            variant={activeTab === 'kanban' ? 'default' : 'outline'}
            onClick={() => setActiveTab('kanban')}
            className="gap-2"
          >
            <ListTodo className="h-4 w-4" />
            Kanban Board
          </Button>
        </div>
      </div>

      {/* Alerte IA si activée */}
      {aiEnabled && (
        <Card className="border-purple-500 bg-purple-50 dark:bg-purple-950">
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-5 w-5 text-purple-600" />
            <div className="flex-1">
              <p className="font-semibold text-purple-900 dark:text-purple-100">
                IA activée - Prédictions en temps réel
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'kpis' && (
        <KPIsTab 
          aiEnabled={aiEnabled}
          selectedMachine={selectedMachine}
          selectedPeriod={selectedPeriod}
          selectedStatus={selectedStatus}
          kpiData={kpiData || []}
          workloadData={workloadData}
          workOrders={workOrders || []}
        />
      )}
      {activeTab === 'lean' && (
        <LeanAnalyticsTab 
          workOrders={workOrders || []}
          kpiData={kpiData || []}
        />
      )}
      {activeTab === 'kanban' && <KanbanBoardTab />}
    </div>
  );
}

// ========== ONGLET KPIs ==========
function KPIsTab({ 
  aiEnabled, 
  selectedMachine, 
  selectedPeriod, 
  selectedStatus,
  kpiData: propKpiData,
  workloadData: propWorkloadData,
  workOrders: propWorkOrders
}: { 
  aiEnabled: boolean;
  selectedMachine: string;
  selectedPeriod: string;
  selectedStatus: string;
  kpiData: any[];
  workloadData: any[];
  workOrders: any[];
}) {
  const [mtbfMttrSeries, setMtbfMttrSeries] = useState<any[]>([]);
  const [availabilityList, setAvailabilityList] = useState<any[]>([]);
  const [workloadStack, setWorkloadStack] = useState<any[]>([]);
  const [fallbackAgg, setFallbackAgg] = useState<{ mtbf: number|null; mttr: number|null; availability: number|null }>({ mtbf: null, mttr: null, availability: null });
  const [periodAgg, setPeriodAgg] = useState<{ mtbf: number|null; mttr: number|null; availability: number|null }>({ mtbf: null, mttr: null, availability: null });

  useEffect(() => {
    const windowHours = getWindowHours(selectedPeriod);
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * 3600000);
    const inWindowPeriod = (periodStr: string) => {
      if (!periodStr) return false;
      const [y, m] = periodStr.split('-').map(Number);
      if (!y || !m) return false;
      const d = new Date(y, m - 1, 1);
      return d >= windowStart && d <= now;
    };

    const kpisFiltered = propKpiData.filter((k: any) => inWindowPeriod(k.period || ''));

    // Monthly series
    const monthlyData: Record<string, { month: string; mtbf?: number; mttr?: number; count: number }> = {};
    propWorkOrders.forEach((wo: any) => {
      if (!wo.startAt) return;
      const date = wo.startAt instanceof Date ? wo.startAt : new Date(wo.startAt);
      if (date < windowStart || date > now) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) monthlyData[monthKey] = { month: monthKey, count: 0 };
      monthlyData[monthKey].count += 1;
    });
    kpisFiltered.forEach((kpi: any) => {
      const monthKey = kpi.period;
      if (!monthlyData[monthKey]) monthlyData[monthKey] = { month: monthKey, count: 0 };
      const type = (kpi.metricType || '').toLowerCase();
      if (type === 'mtbf') monthlyData[monthKey].mtbf = kpi.metricValue;
      if (type === 'mttr') monthlyData[monthKey].mttr = kpi.metricValue;
    });
    const series = Object.values(monthlyData).sort((a,b) => a.month.localeCompare(b.month));
    setMtbfMttrSeries(series.slice(-12));

    // Availability list
    let availList = kpisFiltered
      .filter((k: any) => (k.metricType || '').toLowerCase() === 'availability')
      .map((k: any) => ({ asset: k.assetCode, availability: Number(k.metricValue) }))
      .slice(0, 10);
    if (!availList.length && propWorkOrders?.length) {
      const hoursMap: Record<string, { downtime: number; count: number }> = {};
      propWorkOrders.forEach((wo: any) => {
        const s = wo.startAt ? new Date(wo.startAt) : null;
        const e = wo.endAt ? new Date(wo.endAt) : null;
        const inWindow = (s && s >= windowStart) || (e && e >= windowStart);
        if (!inWindow) return;
        const asset = wo.assetCode || wo.asset || wo.machine || 'N/A';
        const dt = getDowntimeHours(wo, s, e);
        if (!hoursMap[asset]) hoursMap[asset] = { downtime: 0, count: 0 };
        hoursMap[asset].downtime += dt;
        hoursMap[asset].count += 1;
      });
      availList = Object.entries(hoursMap).map(([asset, v]) => {
        const availability = clampPct(100 * (1 - (v.downtime / Math.max(1, windowHours))));
        return { asset, availability };
      }).slice(0, 10);
    }
    availList = availList.map((row: any) => ({
      ...row,
      status: row.availability > 95 ? 'excellent' : row.availability > 85 ? 'good' : 'warning',
    }));
    setAvailabilityList(availList);

    // Workload stack
    const wl = (propWorkloadData || []).map((r: any) => ({
      name: r.name || r.technician_name || r.technician || '—',
      completed: r.completed ?? 0,
      inProgress: r.inProgress ?? r.in_progress ?? 0,
      planned: r.planned ?? 0,
      utilization: r.utilization ?? r.utilization_pct ?? 0,
    }));
    setWorkloadStack(wl);

    // Period aggregates from work orders
    const periodAggregates = computeFallbackAggregates(propWorkOrders, selectedPeriod);
    setPeriodAgg(periodAggregates);

    // Fallback usage
    const mtbfPresent = kpisFiltered.some((k: any) => (k.metricType || '').toLowerCase() === 'mtbf');
    const mttrPresent = kpisFiltered.some((k: any) => (k.metricType || '').toLowerCase() === 'mttr');
    const availPresent = kpisFiltered.some((k: any) => (k.metricType || '').toLowerCase() === 'availability');
    if (!(mtbfPresent && mttrPresent && availPresent)) {
      setFallbackAgg(periodAggregates);
    } else {
      setFallbackAgg({ mtbf: null, mttr: null, availability: null });
    }
  }, [propKpiData, propWorkloadData, propWorkOrders, selectedPeriod]);

  const kpiData = propKpiData.filter((k: any) => {
    const [y, m] = (k.period || '').split('-').map(Number);
    if (!y || !m) return false;
    const d = new Date(y, m - 1, 1);
    const now = new Date();
    const windowStart = new Date(now.getTime() - getWindowHours(selectedPeriod) * 3600000);
    return d >= windowStart && d <= now;
  });
  const workloadData = propWorkloadData;
  const isLoading = false; // Data comes from props

  // Calculate aggregated KPIs from real data (pivot metric rows)
  const kpisByAssetPeriod2: Record<string, { mtbf?: number; mttr?: number; availability?: number }> = {};
  if (kpiData && Array.isArray(kpiData)) {
    kpiData.forEach((row: any) => {
      const key = `${row.assetCode || ''}|${row.period || ''}`;
      if (!kpisByAssetPeriod2[key]) kpisByAssetPeriod2[key] = {};
      const metric = (row.metricType || '').toLowerCase();
      const val = Number(row.metricValue) || 0;
      if (metric === 'mtbf') kpisByAssetPeriod2[key].mtbf = val;
      else if (metric === 'mttr') kpisByAssetPeriod2[key].mttr = val;
      else if (metric === 'availability') kpisByAssetPeriod2[key].availability = val;
    });
  }
  const pivotedKpis2 = Object.values(kpisByAssetPeriod2);

  const avgMtbf = (() => {
    const mtbfValues = pivotedKpis2.map((k: any) => k.mtbf).filter((v: any) => v !== undefined && v !== null);
    if (mtbfValues.length) return Math.round(mtbfValues.reduce((a: number, b: number) => a + b, 0) / mtbfValues.length);
    return fallbackAgg.mtbf !== null ? Math.round(fallbackAgg.mtbf) : (periodAgg.mtbf !== null ? Math.round(periodAgg.mtbf) : null);
  })();

  const avgMttr = (() => {
    const mttrValues = pivotedKpis2.map((k: any) => k.mttr).filter((v: any) => v !== undefined && v !== null);
    if (mttrValues.length) return (mttrValues.reduce((a: number, b: number) => a + b, 0) / mttrValues.length).toFixed(1);
    return fallbackAgg.mttr !== null ? fallbackAgg.mttr.toFixed(1) : (periodAgg.mttr !== null ? periodAgg.mttr.toFixed(1) : null);
  })();

  const avgAvailability = (() => {
    const aVals = pivotedKpis2.map((k: any) => k.availability).filter((v: any) => v !== undefined && v !== null);
    if (aVals.length) return (aVals.reduce((a: number, b: number) => a + b, 0) / aVals.length).toFixed(1);
    return fallbackAgg.availability !== null ? fallbackAgg.availability.toFixed(1) : (periodAgg.availability !== null ? periodAgg.availability.toFixed(1) : null);
  })();

  const avgUtilization = workloadData?.length
    ? (workloadData.reduce((sum: number, w: any) => sum + (w.utilization || w.utilization_pct || 0), 0) / workloadData.length).toFixed(1)
    : null;

  return (
    <>
      {/* Hero Section - KPIs principaux */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* MTBF */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTBF Moyen</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">...</span>
              ) : avgMtbf ? (
                <>
                  {`${avgMtbf} heures`}
                  {kpiData?.length ? (
                    <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                  ) : null}
                </>
              ) : (
                <>
                  {periodAgg.mtbf !== null ? `${Math.round(periodAgg.mtbf)} heures` : '—'}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              {avgMtbf ? 'Calculé depuis vos données' : 'En attente de données'}
            </p>
            {!avgMtbf && periodAgg.mtbf === null && (
              <div className="mt-2 text-xs text-muted-foreground">Aucune donnée MTBF disponible</div>
            )}
          </CardContent>
        </Card>

        {/* MTTR */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTTR Moyen</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">...</span>
              ) : avgMttr ? (
                <>
                  {`${avgMttr} heures`}
                  {kpiData?.length ? (
                    <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                  ) : null}
                </>
              ) : (
                <>
                  {periodAgg.mttr !== null ? `${periodAgg.mttr.toFixed(1)} heures` : '—'}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="mr-1 h-3 w-3 text-green-500" />
              {avgMttr || periodAgg.mttr ? 'Calculé depuis vos données' : 'En attente de données'}
            </p>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                Objectif: &lt;2h
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Disponibilité */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponibilité</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">...</span>
              ) : avgAvailability ? (
                <>
                  {`${avgAvailability}%`}
                  {kpiData?.length ? (
                    <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                  ) : null}
                </>
              ) : (
                <>
                  {periodAgg.availability !== null ? `${periodAgg.availability.toFixed(1)}%` : '—'}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              {avgAvailability || periodAgg.availability ? 'Calculé depuis vos données' : 'En attente de données'}
            </p>
            <div className="mt-2">
              <Badge className="bg-green-500 text-xs">Excellent</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Taux d'utilisation techniciens */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisation Équipe</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse">...</span>
              ) : avgUtilization ? (
                <>
                  {`${avgUtilization}%`}
                  {workloadData?.length ? (
                    <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                  ) : null}
                </>
              ) : (
                <>
                  {workloadData.length === 0 ? '—' : '0%'}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              {avgUtilization ? (
                <>
                  <Activity className="mr-1 h-3 w-3 text-blue-500" />
                  {workloadData.length} techniciens actifs
                </>
              ) : (
                <>
                  <Activity className="mr-1 h-3 w-3 text-blue-500" />
                  {workloadData.length} techniciens actifs
                </>
              )}
            </p>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                Optimal: 80-90%
              </Badge>
            </div>
            {workloadData.length === 0 && (
              <div className="mt-2 text-xs text-muted-foreground">Ajoutez une colonne "assignee" dans vos CSV pour voir l'utilisation équipe.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Supabase section removed: now local-only KPIs */}

      {/* Section Graphiques */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Évolution MTBF/MTTR avec prédiction IA */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Évolution MTBF/MTTR
            </CardTitle>
            <CardDescription>
              Tendances avec prédiction IA (ligne pointillée)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mtbfMttrSeries.length ? (
              <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mtbfMttrSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="mtbf"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="MTBF (heures)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="mttr"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="MTTR (heures)"
                />
              </LineChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Aucune série MTBF/MTTR disponible</div>
            )}
          </CardContent>
        </Card>

        {/* Disponibilité par équipement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-green-500" />
              Disponibilité par Équipement
            </CardTitle>
            <CardDescription>
              Performance des machines critiques
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availabilityList.length ? (
              <ResponsiveContainer width="100%" height={300}>
              <BarChart data={availabilityList} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="asset" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="availability" name="Disponibilité (%)">
                  {availabilityList.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Aucune disponibilité machine</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section Charge Techniciens */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Charge par technicien */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Charge de Travail par Technicien
            </CardTitle>
            <CardDescription>
              Interventions planifiées vs complétées
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workloadStack.length ? (
              <ResponsiveContainer width="100%" height={300}>
              <BarChart data={workloadStack}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#10b981" name="Complétées" />
                <Bar dataKey="inProgress" fill="#f59e0b" name="En cours" />
                <Bar dataKey="planned" fill="#e5e7eb" name="Planifiées" />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Aucune charge technicien</div>
            )}
            <div className="mt-4 space-y-2">
              {workloadStack.map((tech) => (
                <div key={tech.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{tech.name}</span>
                  <Badge variant={tech.utilization > 90 ? 'destructive' : tech.utilization > 80 ? 'default' : 'secondary'}>
                    {tech.utilization}% utilisation
                  </Badge>
                </div>
              ))}
              {workloadStack.length === 0 && (
                <div className="text-sm text-muted-foreground">Aucune donnée de charge disponible.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
    </>
  );
}

// ========== ONGLET LEAN ANALYTICS ==========
function LeanAnalyticsTab({ workOrders, kpiData }: { workOrders: any[]; kpiData: any[] }) {
  const [cycleData, setCycleData] = useState<any[]>([]);
  const [oeeData, setOeeData] = useState<{ availability: number; performance: number | null; quality: number | null; oee: number }>({ 
    availability: 0, performance: null, quality: null, oee: 0 
  });

  useEffect(() => {
    // 1. Calculate OEE from KPI data
    const availKpis = kpiData.filter((k: any) => k.metricType === 'availability');
    if (availKpis.length) {
      const avgAvail = availKpis.reduce((s: number, k: any) => s + (Number(k.metricValue) || 0), 0) / availKpis.length;
      const availability = Number(avgAvail.toFixed(1));
      setOeeData({ availability, performance: null, quality: null, oee: availability });
    }

    // 2. Calculate cycle time distribution from work orders
    if (workOrders && workOrders.length) {
      const groups: Record<string, number[]> = {};
      workOrders.forEach((wo: any) => {
        const type = wo.type || 'Autre';
        const typeCap = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        
        if (wo.startAt && wo.endAt) {
          const start = wo.startAt instanceof Date ? wo.startAt : new Date(wo.startAt);
          const end = wo.endAt instanceof Date ? wo.endAt : new Date(wo.endAt);
          if (end > start) {
            const hours = (end.getTime() - start.getTime()) / 3600000;
            if (!groups[typeCap]) groups[typeCap] = [];
            groups[typeCap].push(hours);
          }
        }
      });

      const cyData = Object.entries(groups).map(([type, arr]) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        return { 
          type, 
          avg: Number(avg.toFixed(1)), 
          min: Number(min.toFixed(1)), 
          max: Number(max.toFixed(1)) 
        };
      });
      setCycleData(cyData);
    }
  }, [workOrders, kpiData]);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* OEE Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              OEE (Proxy)
            </CardTitle>
            <CardDescription>
              Basé sur la disponibilité des équipements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative h-48 w-48">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                  {oeeData.oee > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="8"
                      strokeDasharray={`${oeeData.oee * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold">{oeeData.oee ? `${oeeData.oee}%` : '—'}</span>
                  <span className="text-xs text-muted-foreground">OEE (proxy)</span>
                </div>
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Disponibilité</span>
                  <span className="font-semibold">{oeeData.availability ? `${oeeData.availability}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Performance</span>
                  <span className="font-semibold text-muted-foreground">Non disponible</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Qualité</span>
                  <span className="font-semibold text-muted-foreground">Non disponible</span>
                </div>
              </div>
              <Badge variant={oeeData.oee >= 85 ? 'default' : 'secondary'}>
                {oeeData.oee >= 85 ? 'Classe Mondiale' : 'À améliorer'}
              </Badge>
              <p className="text-xs text-center text-muted-foreground">
                💡 OEE calculé uniquement avec disponibilité. Pour un OEE complet, ajoutez données de performance et qualité.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cycle Time Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Temps de Cycle par Type
            </CardTitle>
            <CardDescription>
              Durée moyenne des interventions (heures)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cycleData.length ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cycleData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis label={{ value: 'Heures', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avg" fill="#f59e0b" name="Moyenne" />
                    <Bar dataKey="min" fill="#10b981" name="Min" />
                    <Bar dataKey="max" fill="#ef4444" name="Max" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 rounded-md bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950 dark:text-orange-100">
                  <strong>Lean Insight: </strong>
                  Analyser la variance élevée pour standardiser les temps d'intervention.
                </div>
              </>
            ) : (
              <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
                <span>Aucune donnée de cycle temps</span>
                <span className="text-xs">Importez des work orders avec dates de début/fin</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pareto - Placeholder */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              Analyse Pareto - Causes de Pannes (80/20)
            </CardTitle>
            <CardDescription>
              80% des pannes proviennent de ~20% des causes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-md border-2 border-dashed">
              <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
              <div className="text-center">
                <p className="font-semibold">Données AMDEC requises</p>
                <p className="text-sm text-muted-foreground">
                  Importez un fichier AMDEC avec modes de défaillance pour voir l'analyse Pareto
                </p>
              </div>
              <Badge variant="outline">Fonctionnalité à venir</Badge>
            </div>
          </CardContent>
        </Card>

        {/* 5S Audit - Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              Audit 5S
            </CardTitle>
            <CardDescription>
              Scores d'audit par zone
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
              <span>Pas de données d'audits 5S</span>
              <span className="text-xs">Ajoutez un schéma audits_5s (zone, score, date)</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ========== ONGLET KANBAN BOARD ==========
// TODO: Re-implement with local DB hooks - Supabase version temporarily removed
function KanbanBoardTab() {
  return (
    <div className="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed">
      <div className="text-center">
        <p className="text-lg font-semibold">Kanban Board - En cours de migration</p>
        <p className="text-sm text-muted-foreground">Bientôt disponible avec données locales</p>
      </div>
    </div>
  );
}

// ========== HELPER FUNCTIONS ==========
