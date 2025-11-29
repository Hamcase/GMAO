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
  Filter,
  ArrowUp,
  ArrowDown,
  Upload
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
import { importWorkOrdersFromRows, parseCsv, clearAllLocalData } from '@kit/shared/localdb/import';
import { importKpisFromExcelFile } from '@kit/shared/localdb/excelImport';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'mtbf-mttr' | 'availability' | 'workload'>('overview');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
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
  
  // Build workload data from work orders with staff details
  const workloadData = workOrders 
    ? Object.values(
        workOrders.reduce((acc: any, wo) => {
          // Build full name from customColumns if available, otherwise use assignee
          const firstName = wo.customColumns?.staffFirstName;
          const lastName = wo.customColumns?.staffLastName;
          const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : wo.assignee?.trim();
          
          if (!fullName) return acc;
          
          if (!acc[fullName]) {
            acc[fullName] = { 
              technician_name: fullName, 
              completed: 0, 
              in_progress: 0, 
              planned: 0, 
              internalHours: 0,
              totalHours: 0,
              externalHours: 0,
              utilization_pct: 0 
            };
          }
          
          // Count work order states
          if (wo.endAt) acc[fullName].completed += 1;
          else if (wo.startAt) acc[fullName].in_progress += 1;
          else acc[fullName].planned += 1;
          
          // Sum hours from customColumns
          if (wo.customColumns?.internalHours) {
            acc[fullName].internalHours += wo.customColumns.internalHours;
          }
          if (wo.customColumns?.totalHours) {
            acc[fullName].totalHours += wo.customColumns.totalHours;
          }
          if (wo.customColumns?.externalHours) {
            acc[fullName].externalHours += wo.customColumns.externalHours;
          }
          
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

      {/* Dashboard Header */}
      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Dashboard GMAO</h2>
              <p className="text-blue-100">Vue d'ensemble rapide de votre maintenance industrielle</p>
            </div>
            <ExportPDFButton
              data={dashboardExportData}
              filename="rapport_dashboard_gmao.pdf"
              title="Dashboard GMAO - Rapport de Performance"
            />
          </div>
        </CardContent>
      </Card>

      {/* Import / Clear Controls */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importer des Données
          </CardTitle>
          <CardDescription>Chargez vos fichiers Excel pour alimenter le dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-blue-100 p-3 dark:bg-blue-900/20">
            <Zap className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Importation des Données</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">Étape 1: Sélectionnez vos fichiers | Étape 2: Cliquez sur Importer</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
            <div className="space-y-2">
              <Label htmlFor="file-input" className="text-sm font-medium">
                📁 Fichiers à importer
              </Label>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".csv,.xlsx"
                disabled={importing}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setSelectedFiles(files);
                }}
                className="w-full rounded border-2 border-dashed p-3 text-sm transition hover:border-blue-400"
              />
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="lg"
              disabled={importing || selectedFiles.length === 0}
              onClick={async () => {
                if (!selectedFiles.length) return;
                setImporting(true);
                setImportStatus('Importation en cours...');
                let successCount = 0;
                for (const file of selectedFiles) {
                  const nameLower = file.name.toLowerCase();
                  try {
                    if (nameLower.endsWith('.csv')) {
                      setImportStatus(`📄 CSV: ${file.name}...`);
                      const buf = await file.arrayBuffer();
                      let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
                      if (text.includes('\ufffd')) {
                        text = new TextDecoder('latin1').decode(buf);
                      }
                      const rows = parseCsv(text, ';');
                      if (!rows.length) continue;
                      const headers = rows[0]!;
                      const dataRows = rows.slice(1);
                      await importWorkOrdersFromRows(headers, dataRows);
                      successCount++;
                      console.log(`✅ CSV importé: ${file.name}, ${dataRows.length} lignes`);
                    } else if (nameLower.endsWith('.xlsx')) {
                      setImportStatus(`📊 Excel: ${file.name}...`);
                      const summary = await importKpisFromExcelFile(file);
                      successCount++;
                      console.log(`✅ Excel importé: ${file.name}`);
                      console.log(`  📋 Feuilles traitées: ${summary.sheetsProcessed}`);
                      console.log(`  ✨ KPIs insérés: ${summary.kpisInserted}, mis à jour: ${summary.kpisUpdated}`);
                      console.log(`  ⏭️ Feuilles ignorées: ${summary.skippedSheets.join(', ') || 'aucune'}`);
                    }
                  } catch (err) {
                    console.error('❌ Erreur import', file.name, err);
                    setImportStatus(`Erreur: ${file.name}`);
                  }
                }
                setImportStatus(`✅ ${successCount} fichier(s) importé(s) avec succès`);
                setTimeout(() => {
                  setImporting(false);
                  setImportStatus('');
                  setSelectedFiles([]);
                  window.location.reload();
                }, 2000);
              }}
              className="self-end gap-2"
            >
              <Zap className="h-4 w-4" />
              Importer
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={importing}
              onClick={async () => {
                if (!confirm('⚠️ Effacer toutes les données locales ?\n\nCette action est irréversible.')) return;
                await clearAllLocalData();
                console.log('🧹 Données locales effacées');
                setSelectedFiles([]);
                window.location.reload();
              }}
              className="self-end"
            >
              Vider DB
            </Button>
          </div>
          {importing && (
            <div className="flex items-center gap-2 rounded-md bg-blue-100 p-3 dark:bg-blue-900">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">{importStatus}</span>
            </div>
          )}
          <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-xs dark:bg-blue-950">
            <strong>💡 Types de fichiers:</strong>
            <ul className="ml-4 mt-1 list-disc space-y-1">
              <li><strong>CSV</strong> (Workload.csv): Ordres de travail avec colonnes Date/Désignation/Durée/etc.</li>
              <li><strong>XLSX</strong> (Dispo_MTBF_MTTR.xlsx): Feuilles mensuelles (Janvier, Février...) avec Machine/MTBF/MTTR/Disponibilité</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation - Enhanced */}
      <div className="rounded-lg border bg-gradient-to-r from-gray-50 to-white p-4 shadow-md">
        <div className="flex flex-wrap gap-3">
          <Button
            variant={activeTab === 'overview' ? 'default' : 'outline'}
            onClick={() => setActiveTab('overview')}
            className="gap-2 shadow-sm transition-all hover:scale-105"
            size="lg"
          >
            <BarChart3 className="h-4 w-4" />
            Vue Générale
          </Button>
          <Button
            variant={activeTab === 'mtbf-mttr' ? 'default' : 'outline'}
            onClick={() => setActiveTab('mtbf-mttr')}
            className="gap-2 shadow-sm transition-all hover:scale-105"
            size="lg"
          >
            <Activity className="h-4 w-4" />
            MTBF/MTTR
          </Button>
          <Button
            variant={activeTab === 'availability' ? 'default' : 'outline'}
            onClick={() => setActiveTab('availability')}
            className="gap-2 shadow-sm transition-all hover:scale-105"
            size="lg"
          >
            <CheckCircle2 className="h-4 w-4" />
            Disponibilité
          </Button>
          <Button
            variant={activeTab === 'workload' ? 'default' : 'outline'}
            onClick={() => setActiveTab('workload')}
            className="gap-2 shadow-sm transition-all hover:scale-105"
            size="lg"
          >
            <Users className="h-4 w-4" />
            Charge Travail
          </Button>
        </div>
      </div>

      {/* Content Area */}

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'overview' && (
        <OverviewTab 
          selectedMachine={selectedMachine}
          selectedPeriod={selectedPeriod}
          selectedStatus={selectedStatus}
          kpiData={kpiData || []}
          workloadData={workloadData}
          workOrders={workOrders || []}
        />
      )}
      {activeTab === 'mtbf-mttr' && (
        <MTBFMTTRTab 
          kpiData={kpiData || []}
          workOrders={workOrders || []}
          selectedMachine={selectedMachine}
          selectedPeriod={selectedPeriod}
        />
      )}
      {activeTab === 'availability' && (
        <AvailabilityTab 
          kpiData={kpiData || []}
          workOrders={workOrders || []}
          selectedMachine={selectedMachine}
        />
      )}
      {activeTab === 'workload' && (
        <WorkloadTab 
          workOrders={workOrders || []}
          workloadData={workloadData}
        />
      )}
    </div>
  );
}

// ========== ONGLET Vue d'Ensemble (Overview) - Quick Summary Dashboard ==========
function OverviewTab({ 
  selectedMachine, 
  selectedPeriod, 
  selectedStatus,
  kpiData: propKpiData,
  workloadData: propWorkloadData,
  workOrders: propWorkOrders
}: { 
  selectedMachine: string;
  selectedPeriod: string;
  selectedStatus: string;
  kpiData: any[];
  workloadData: any[];
  workOrders: any[];
}) {
  // Auto-calculate MTBF/MTTR from work orders on mount
  useEffect(() => {
    if (propWorkOrders && propWorkOrders.length > 0) {
      import('@kit/shared/localdb/kpi').then(({ recalcKpis }) => {
        recalcKpis().catch(err => console.error('MTBF/MTTR calculation error:', err));
      });
    }
  }, [propWorkOrders?.length]);

  // Simple aggregations
  const totalMachines = propKpiData?.length ? Array.from(new Set(propKpiData.map(k => k.assetCode))).length : 0;
  const totalWorkOrders = propWorkOrders?.length || 0;
  const totalTechnicians = propWorkloadData?.length || 0;
  
  const mtbfKpis = propKpiData?.filter(k => k.metricType === 'mtbf') || [];
  const mttrKpis = propKpiData?.filter(k => k.metricType === 'mttr') || [];
  const availKpis = propKpiData?.filter(k => k.metricType === 'availability') || [];
  
  const avgMtbf = mtbfKpis.length ? mtbfKpis.reduce((s, k) => s + k.metricValue, 0) / mtbfKpis.length : null;
  const avgMttr = mttrKpis.length ? mttrKpis.reduce((s, k) => s + k.metricValue, 0) / mttrKpis.length : null;
  const avgAvail = availKpis.length ? availKpis.reduce((s, k) => s + k.metricValue, 0) / availKpis.length : null;
  
  console.log('Vue Générale averages:', { avgMtbf, avgMttr, mtbfKpisCount: mtbfKpis.length, mttrKpisCount: mttrKpis.length, sampleMtbf: mtbfKpis.slice(0, 3) });
  
  // Additional KPIs
  const completedOrders = propWorkOrders?.filter(wo => wo.status === 'completed').length || 0;
  const inProgressOrders = propWorkOrders?.filter(wo => wo.status === 'in-progress' || wo.status === 'in_progress').length || 0;
  const totalDowntime = propWorkOrders?.reduce((sum, wo) => sum + (wo.downtimeMinutes || 0), 0) || 0;
  const avgDowntime = totalWorkOrders > 0 ? totalDowntime / totalWorkOrders : 0;
  
    // Machines with objectives - group by machine (not by period) to count unique machines
    const machineObjMap = new Map<string, { availability: number, objective: number }>();
    availKpis.forEach(k => {
      if (k.customColumns?.objective && k.customColumns?.moyenne !== undefined) {
        // Use moyenne (yearly average) from summary sheet, not individual monthly values
        const existing = machineObjMap.get(k.assetCode);
        if (!existing || k.customColumns.moyenne > existing.availability) {
          machineObjMap.set(k.assetCode, { 
            availability: k.customColumns.moyenne, 
            objective: k.customColumns.objective 
          });
        }
      }
    });
    const machinesWithObj = Array.from(machineObjMap.values());
    const machinesAboveObj = machinesWithObj.filter(m => m.availability >= m.objective).length;
    const machinesBelowObj = machinesWithObj.length - machinesAboveObj;  return (
    <div className="space-y-6">
      {/* Executive Summary - Premium Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Machines Card with Status Indicator */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-blue-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Factory className="h-4 w-4 text-blue-500" />
              Machines Suivies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold bg-gradient-to-br from-blue-600 to-blue-400 bg-clip-text text-transparent">
              {totalMachines || '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Équipements actifs
            </p>
          </CardContent>
        </Card>

        {/* Work Orders Card with Progress */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-purple-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-purple-500" />
              Ordres de Travail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-purple-400 bg-clip-text text-transparent">
              {totalWorkOrders || '—'}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span className="font-semibold text-green-600">{completedOrders}</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3 text-blue-600" />
                <span className="font-semibold text-blue-600">{inProgressOrders}</span>
              </div>
              <div className="flex-1 ml-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${totalWorkOrders > 0 ? (completedOrders / totalWorkOrders) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technicians Card */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-orange-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              Techniciens Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold bg-gradient-to-br from-orange-600 to-orange-400 bg-clip-text text-transparent">
              {totalTechnicians || '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ressources humaines</p>
          </CardContent>
        </Card>

        {/* Availability Card with Gauge Effect */}
        <Card className={`relative overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 ${
          avgAvail && avgAvail >= 95 ? 'border-l-green-500' : 
          avgAvail && avgAvail >= 85 ? 'border-l-blue-500' : 'border-l-red-500'
        }`}>
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 ${
            avgAvail && avgAvail >= 95 ? 'bg-green-500/5' : 
            avgAvail && avgAvail >= 85 ? 'bg-blue-500/5' : 'bg-red-500/5'
          }`} />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Disponibilité Moyenne
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold bg-gradient-to-br bg-clip-text text-transparent ${
              avgAvail && avgAvail >= 95 ? 'from-green-600 to-green-400' : 
              avgAvail && avgAvail >= 85 ? 'from-blue-600 to-blue-400' : 'from-red-600 to-red-400'
            }`}>
              {avgAvail ? `${avgAvail.toFixed(1)}%` : '—'}
            </div>
            <Badge className="mt-2" variant={avgAvail && avgAvail >= 95 ? 'default' : 'secondary'}>
              {avgAvail && avgAvail >= 95 ? '🏆 Excellent' : avgAvail && avgAvail >= 85 ? '✓ Bon' : '⚠ À améliorer'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Key Performance Indicators - Enhanced Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* MTBF Card with Trend */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              MTBF Moyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {avgMtbf ? `${avgMtbf.toFixed(1)}h` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Temps moyen entre pannes</p>
            {avgMtbf && (
              <div className="mt-2 flex items-center gap-1">
                {avgMtbf >= 70 ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={`text-xs font-medium ${avgMtbf >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                  {avgMtbf >= 70 ? 'Performance élevée' : 'À surveiller'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* MTTR Card with Trend */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              MTTR Moyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {avgMttr ? `${avgMttr.toFixed(1)}h` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Temps moyen de réparation</p>
            {avgMttr && (
              <div className="mt-2 flex items-center gap-1">
                {avgMttr <= 40 ? (
                  <TrendingDown className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingUp className="h-3 w-3 text-red-600" />
                )}
                <span className={`text-xs font-medium ${avgMttr <= 40 ? 'text-green-600' : 'text-red-600'}`}>
                  {avgMttr <= 40 ? 'Réactivité excellente' : 'Temps élevé'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Downtime Card */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-600" />
              Temps d'Arrêt Moyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {avgDowntime > 0 ? `${(avgDowntime / 60).toFixed(1)}h` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Par intervention</p>
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground">Total: {totalDowntime > 0 ? `${(totalDowntime / 60).toFixed(0)}h` : '0h'}</div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Score Card */}
        <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-green-600" />
              Machines {`>`} Objectif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {machinesAboveObj}/{machinesWithObj.length || totalMachines}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{machinesBelowObj} sous objectif</p>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${machinesWithObj.length > 0 ? (machinesAboveObj / machinesWithObj.length) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional KPIs Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {/* Completion Rate with Visual Progress */}
        <Card className="hover:shadow-xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-cyan-600" />
                Taux de Complétion
              </span>
              <Badge variant="outline" className="text-xs">
                {completedOrders}/{totalWorkOrders}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-3xl font-bold text-cyan-600">
                {totalWorkOrders > 0 ? `${((completedOrders / totalWorkOrders) * 100).toFixed(1)}%` : '—'}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Complétés</span>
                  <span>En cours</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden flex">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                    style={{ width: `${totalWorkOrders > 0 ? (completedOrders / totalWorkOrders) * 100 : 0}%` }}
                  />
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                    style={{ width: `${totalWorkOrders > 0 ? (inProgressOrders / totalWorkOrders) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Failure Types Breakdown */}
        <Card className="hover:shadow-xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-pink-600" />
              Types de Pannes (Top 5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const typeCount: Record<string, number> = {};
              propWorkOrders?.forEach(wo => {
                const type = wo.type || 'Non spécifié';
                typeCount[type] = (typeCount[type] || 0) + 1;
              });
              const topTypes = Object.entries(typeCount)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);
              const maxCount = topTypes[0]?.[1] || 1;
              
              return topTypes.length > 0 ? (
                <div className="space-y-2">
                  {topTypes.map(([type, count]) => (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium truncate max-w-[120px]" title={type}>{type}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-pink-500 to-rose-400 transition-all duration-500"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Aucune donnée disponible</div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Machine Performance Matrix */}
      <Card className="hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-blue-600" />
                Performance par Machine
              </CardTitle>
              <CardDescription className="mt-1">Vue d'ensemble des équipements critiques</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {totalMachines} machines
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            // Group KPIs by machine
            const machinePerf: Record<string, { avail?: number; mtbf?: number; mttr?: number; workOrders: number }> = {};
            
            propKpiData?.forEach(k => {
              if (!machinePerf[k.assetCode]) {
                machinePerf[k.assetCode] = { workOrders: 0 };
              }
              const perf = machinePerf[k.assetCode];
              if (!perf) return;
              
              if (k.metricType === 'availability' && k.customColumns?.moyenne !== undefined) {
                perf.avail = k.customColumns.moyenne;
              } else if (k.metricType === 'mtbf') {
                perf.mtbf = k.metricValue;
              } else if (k.metricType === 'mttr') {
                perf.mttr = k.metricValue;
              }
            });
            
            propWorkOrders?.forEach(wo => {
              const assetCode = wo.assetId || wo.customColumns?.asset || wo.customColumns?.machine;
              if (assetCode && machinePerf[assetCode]) {
                machinePerf[assetCode].workOrders++;
              }
            });
            
            const machines = Object.entries(machinePerf)
              .map(([code, perf]) => ({ code, ...perf }))
              .sort((a, b) => (b.avail || 0) - (a.avail || 0))
              .slice(0, 8);
            
            return machines.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {machines.map(machine => {
                  const availColor = 
                    machine.avail && machine.avail >= 95 ? 'text-green-600 bg-green-50 dark:bg-green-950/20' :
                    machine.avail && machine.avail >= 85 ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' :
                    'text-orange-600 bg-orange-50 dark:bg-orange-950/20';
                  
                  return (
                    <div 
                      key={machine.code}
                      className="p-3 rounded-lg border hover:border-primary/50 transition-all duration-200 cursor-pointer hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{machine.code}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {machine.workOrders} interventions
                          </div>
                        </div>
                        <Badge className={`text-xs font-bold ${availColor} border-0`}>
                          {machine.avail ? `${machine.avail.toFixed(1)}%` : 'N/A'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3 text-blue-500" />
                          <span className="text-muted-foreground">MTBF:</span>
                          <span className="font-medium">{machine.mtbf ? `${machine.mtbf.toFixed(0)}h` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-orange-500" />
                          <span className="text-muted-foreground">MTTR:</span>
                          <span className="font-medium">{machine.mttr ? `${machine.mttr.toFixed(0)}h` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Factory className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucune donnée de performance disponible</p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Quick Stats Summary */}
      <Card className="border-2 border-dashed hover:border-primary/50 transition-all duration-300">
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold mb-2 flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Explorer les Détails
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Utilisez les onglets ci-dessus pour des analyses approfondies:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Badge variant="outline" className="text-sm">📈 MTBF/MTTR - Évolution temporelle</Badge>
            <Badge variant="outline" className="text-sm">✅ Disponibilité - Par machine</Badge>
            <Badge variant="outline" className="text-sm">👷 Charge Travail - Techniciens & équipements</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Insights */}
      {propKpiData?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              Insights Rapides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {avgMtbf && avgMtbf > 500 && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 p-3 dark:bg-green-950">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">Excellente fiabilité</p>
                  <p className="text-sm text-green-700 dark:text-green-200">MTBF élevé ({avgMtbf.toFixed(0)}h) indique des équipements robustes</p>
                </div>
              </div>
            )}
            {avgMttr && avgMttr < 2 && (
              <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 dark:bg-blue-950">
                <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Réactivité optimale</p>
                  <p className="text-sm text-blue-700 dark:text-blue-200">MTTR sous 2h - interventions rapides</p>
                </div>
              </div>
            )}
            {avgAvail && avgAvail < 85 && (
              <div className="flex items-start gap-2 rounded-md bg-orange-50 p-3 dark:bg-orange-950">
                <Target className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-900 dark:text-orange-100">Amélioration possible</p>
                  <p className="text-sm text-orange-700 dark:text-orange-200">Disponibilité {avgAvail.toFixed(1)}% - objectif: &gt;95%</p>
                </div>
              </div>
            )}
            {(!propKpiData || propKpiData.length === 0) && (
              <div className="flex items-start gap-2 rounded-md bg-gray-50 p-3 dark:bg-gray-950">
                <Filter className="h-5 w-5 text-gray-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Données insuffisantes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">Importez vos fichiers CSV/XLSX pour voir les analyses</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== ONGLET MTBF/MTTR ==========
function MTBFMTTRTab({ 
  kpiData, 
  workOrders, 
  selectedMachine,
  selectedPeriod 
}: { 
  kpiData: any[]; 
  workOrders: any[]; 
  selectedMachine: string;
  selectedPeriod: string;
}) {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    if (!kpiData?.length) return;

    // Extract unique years from periods
    const yearSet = new Set<string>();
    kpiData.forEach((k: any) => {
      if (k.period) {
        const year = k.period.split('-')[0];
        yearSet.add(year);
      }
    });
    const sortedYears = Array.from(yearSet).sort();
    setYears(sortedYears);

    // Filter by selected machine and year
    let filtered = kpiData;
    if (selectedMachine !== 'all') {
      filtered = filtered.filter((k: any) => k.assetCode === selectedMachine);
    }
    if (selectedYear !== 'all') {
      filtered = filtered.filter((k: any) => k.period?.startsWith(selectedYear));
    }

    // Group by period and calculate average MTBF/MTTR
    const byPeriod: Record<string, { mtbf: number[]; mttr: number[] }> = {};
    filtered.forEach((k: any) => {
      if (!k.period) return;
      if (!byPeriod[k.period]) byPeriod[k.period] = { mtbf: [], mttr: [] };
      
      if (k.metricType === 'mtbf') byPeriod[k.period]!.mtbf.push(k.metricValue);
      else if (k.metricType === 'mttr') byPeriod[k.period]!.mttr.push(k.metricValue);
    });

    const monthly = Object.entries(byPeriod)
      .map(([period, data]) => ({
        period,
        mtbf: data.mtbf.length ? data.mtbf.reduce((a, b) => a + b, 0) / data.mtbf.length : null,
        mttr: data.mttr.length ? data.mttr.reduce((a, b) => a + b, 0) / data.mttr.length : null,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    setMonthlyData(monthly);
  }, [kpiData, selectedMachine, selectedYear]);

  const avgMtbf = monthlyData.length && monthlyData.some(d => d.mtbf)
    ? monthlyData.reduce((s, d) => s + (d.mtbf || 0), 0) / monthlyData.filter(d => d.mtbf).length
    : null;
  const avgMttr = monthlyData.length && monthlyData.some(d => d.mttr)
    ? monthlyData.reduce((s, d) => s + (d.mttr || 0), 0) / monthlyData.filter(d => d.mttr).length
    : null;

  console.log('MTBF/MTTR Tab averages:', { avgMtbf, avgMttr, monthlyDataCount: monthlyData.length, selectedMachine, selectedYear });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-blue-500" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label>Année</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les années</SelectItem>
                {years.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTBF Moyen</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMtbf ? `${avgMtbf.toFixed(1)} h` : '—'}</div>
            <p className="text-xs text-muted-foreground">Mean Time Between Failures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTTR Moyen</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMttr ? `${avgMttr.toFixed(1)} h` : '—'}</div>
            <p className="text-xs text-muted-foreground">Mean Time To Repair</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Évolution MTBF & MTTR
          </CardTitle>
          <CardDescription>Tendance temporelle des indicateurs de fiabilité</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyData.length ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis yAxisId="left" label={{ value: 'MTBF (h)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'MTTR (h)', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="mtbf" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  name="MTBF (h)"
                  dot={{ r: 4 }}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="mttr" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  name="MTTR (h)"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========== ONGLET DISPONIBILITÉ ==========
function AvailabilityTab({ 
  kpiData, 
  workOrders,
  selectedMachine 
}: { 
  kpiData: any[]; 
  workOrders: any[];
  selectedMachine: string;
}) {
  const [availData, setAvailData] = useState<any[]>([]);
  const [sectorData, setSectorData] = useState<any[]>([]);

  useEffect(() => {
    if (!kpiData?.length) return;

    let filtered = kpiData.filter((k: any) => k.metricType === 'availability');
    if (selectedMachine !== 'all') {
      filtered = filtered.filter((k: any) => k.assetCode === selectedMachine);
    }

    // Group by asset and calculate average with objective and sector info
    const byAsset: Record<string, { 
      values: number[], 
      objective?: number, 
      sector?: string,
      indispoSubi?: number,
      indispoSubiProg?: number,
      indispoTotal?: number
    }> = {};
    
    filtered.forEach((k: any) => {
      if (!byAsset[k.assetCode]) {
        byAsset[k.assetCode] = { 
          values: [],
          objective: k.customColumns?.objective,
          sector: k.customColumns?.sector,
          indispoSubi: k.customColumns?.indispoSubi,
          indispoSubiProg: k.customColumns?.indispoSubiProg,
          indispoTotal: k.customColumns?.indispoTotal
        };
      }
      byAsset[k.assetCode]!.values.push(k.metricValue);
    });

    const avail = Object.entries(byAsset).map(([assetCode, data]) => {
      const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
      const objective = data.objective || 93; // Default to 93% if not set
      const vsObjective = avg - objective;
      
      return {
        assetCode,
        availability: Number(avg.toFixed(1)),
        objective: Number(objective.toFixed(1)),
        vsObjective: Number(vsObjective.toFixed(1)),
        sector: data.sector || 'Non défini',
        status: avg >= objective ? (avg >= 95 ? 'Excellent' : 'Bon') : 'Attention',
        indispoSubi: data.indispoSubi ? Number(data.indispoSubi.toFixed(1)) : undefined,
        indispoSubiProg: data.indispoSubiProg ? Number(data.indispoSubiProg.toFixed(1)) : undefined,
        indispoTotal: data.indispoTotal ? Number(data.indispoTotal.toFixed(1)) : undefined
      };
    }).sort((a, b) => b.availability - a.availability);

    setAvailData(avail);
    
    // Calculate sector aggregates
    const bySector: Record<string, number[]> = {};
    avail.forEach(a => {
      if (!bySector[a.sector]) bySector[a.sector] = [];
      bySector[a.sector]!.push(a.availability);
    });
    
    const sectors = Object.entries(bySector).map(([sector, values]) => ({
      sector,
      avgDispo: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
      machineCount: values.length
    })).sort((a, b) => b.avgDispo - a.avgDispo);
    
    setSectorData(sectors);
  }, [kpiData, selectedMachine]);

  const avgAvailability = availData.length
    ? availData.reduce((s, d) => s + d.availability, 0) / availData.length
    : null;
  const minAvailability = availData.length ? Math.min(...availData.map(d => d.availability)) : null;
  const maxAvailability = availData.length ? Math.max(...availData.map(d => d.availability)) : null;
  const avgObjective = availData.length
    ? availData.reduce((s, d) => s + d.objective, 0) / availData.length
    : null;

  const getStatusColor = (status: string) => {
    if (status === 'Excellent') return 'bg-green-500';
    if (status === 'Bon') return 'bg-blue-500';
    return 'bg-orange-500';
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards with Objective Comparison */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Moyenne Dispo</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgAvailability ? `${avgAvailability.toFixed(1)}%` : '—'}</div>
            {avgObjective && avgAvailability && (
              <p className={`text-xs ${avgAvailability >= avgObjective ? 'text-green-600' : 'text-orange-600'}`}>
                {avgAvailability >= avgObjective ? '✓' : '⚠'} Obj: {avgObjective.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Min</CardTitle>
            <ArrowDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{minAvailability ? `${minAvailability.toFixed(1)}%` : '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max</CardTitle>
            <ArrowUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{maxAvailability ? `${maxAvailability.toFixed(1)}%` : '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Machines &gt; Obj</CardTitle>
            <Target className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {availData.length ? `${availData.filter(a => a.availability >= a.objective).length}/${availData.length}` : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sector Aggregates */}
      {sectorData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-indigo-500" />
              Disponibilité par Secteur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sectorData.map((s, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="font-semibold">{s.sector}</div>
                  <div className="mt-1 text-2xl font-bold text-blue-600">{s.avgDispo}%</div>
                  <div className="text-xs text-muted-foreground">{s.machineCount} machines</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Time Series - Disponibilité per Machine - INTERACTIVE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Évolution Mensuelle - Disponibilité par Machine
          </CardTitle>
          <CardDescription>
            Sélectionnez une machine pour voir son évolution temporelle
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const [selectedMachineForChart, setSelectedMachineForChart] = useState<string>('');
            
            // Group KPIs by machine and build monthly time series
            const monthlyByMachine: Record<string, Array<{ period: string; value: number; objective: number; sector: string }>> = {};
            
            kpiData
              ?.filter((k: any) => k.metricType === 'availability')
              .forEach((k: any) => {
                if (!monthlyByMachine[k.assetCode]) {
                  monthlyByMachine[k.assetCode] = [];
                }
                monthlyByMachine[k.assetCode]!.push({
                  period: k.period,
                  value: k.metricValue,
                  objective: k.customColumns?.objective || 93,
                  sector: k.customColumns?.sector || 'Non défini'
                });
              });
            
            // Sort each machine's data by period
            Object.keys(monthlyByMachine).forEach(machine => {
              monthlyByMachine[machine]!.sort((a, b) => a.period.localeCompare(b.period));
            });
            
            // Get all machines sorted by average availability
            const machineOptions = Object.entries(monthlyByMachine)
              .map(([machine, data]) => ({
                machine,
                avg: data.reduce((s, d) => s + d.value, 0) / data.length,
                sector: data[0]?.sector || 'Non défini',
                data
              }))
              .sort((a, b) => b.avg - a.avg);
            
            if (machineOptions.length === 0) {
              return (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  Aucune donnée mensuelle disponible
                </div>
              );
            }
            
            // Auto-select first machine if none selected
            const displayMachine = selectedMachineForChart || machineOptions[0]!.machine;
            const machineData = monthlyByMachine[displayMachine] || [];
            const machineInfo = machineOptions.find(m => m.machine === displayMachine);
            
            return (
              <>
                {/* Machine Selector */}
                <div className="mb-4 flex items-center gap-3">
                  <Label className="text-sm font-medium">Machine:</Label>
                  <Select 
                    value={displayMachine} 
                    onValueChange={setSelectedMachineForChart}
                  >
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {machineOptions.map((m) => (
                        <SelectItem key={m.machine} value={m.machine}>
                          {m.machine} - {m.sector} ({m.avg.toFixed(1)}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {machineInfo && (
                    <Badge variant="outline">
                      {machineInfo.sector} | Moy: {machineInfo.avg.toFixed(1)}%
                    </Badge>
                  )}
                </div>
                
                {/* Time Series Chart */}
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={machineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis domain={[85, 100]} label={{ value: 'Disponibilité (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload[0]) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-white p-3 shadow-md dark:bg-gray-800">
                              <p className="font-semibold mb-2">{data.period}</p>
                              <p className="text-sm">
                                <span className="font-semibold">Disponibilité:</span>{' '}
                                <span style={{ color: data.value >= data.objective ? '#10b981' : '#ef4444' }}>
                                  {data.value.toFixed(1)}%
                                </span>
                              </p>
                              <p className="text-sm text-gray-600">Objectif: {data.objective.toFixed(1)}%</p>
                              <p className={`text-xs font-semibold mt-1 ${data.value >= data.objective ? 'text-green-600' : 'text-red-600'}`}>
                                {data.value >= data.objective ? '✓ Au-dessus objectif' : '✗ Sous objectif'}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    {/* Objective line */}
                    <Line 
                      type="monotone" 
                      dataKey="objective" 
                      stroke="#94a3b8" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Objectif"
                    />
                    {/* Availability line with color based on objective */}
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      name="Disponibilité"
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        const isAboveObj = payload.value >= payload.objective;
                        return (
                          <circle 
                            key={`dot-${index}`}
                            cx={cx} 
                            cy={cy} 
                            r={6} 
                            fill={isAboveObj ? '#10b981' : '#ef4444'}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                
                {/* Summary Stats */}
                <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">Moy. Disponibilité</div>
                    <div className="text-lg font-bold text-blue-600">
                      {machineInfo?.avg.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">Mois au-dessus obj</div>
                    <div className="text-lg font-bold text-green-600">
                      {machineData.filter(d => d.value >= d.objective).length}/{machineData.length}
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">Meilleur mois</div>
                    <div className="text-lg font-bold">
                      {Math.max(...machineData.map(d => d.value)).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">Pire mois</div>
                    <div className="text-lg font-bold">
                      {Math.min(...machineData.map(d => d.value)).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Légende & Analyse Indisponibilité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-green-500" />
                <span className="text-sm">Au-dessus objectif (≥obj)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-red-500" />
                <span className="text-sm">Sous objectif (&lt;obj)</span>
              </div>
            </div>
            <div className="rounded-lg border bg-blue-50 p-3">
              <p className="text-sm text-blue-900">
                💡 <strong>Indisponibilité:</strong> L'analyse détaille les arrêts subi (pannes), programmés (maintenance), 
                et préventifs niveau 1 pour identifier les sources de perte de disponibilité.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== ONGLET CHARGE TRAVAIL ==========
function WorkloadTab({ 
  workOrders, 
  workloadData 
}: { 
  workOrders: any[]; 
  workloadData: any[];
}) {
  const [machineWorkload, setMachineWorkload] = useState<any[]>([]);
  const [techWorkload, setTechWorkload] = useState<any[]>([]);

  useEffect(() => {
    if (!workOrders?.length) {
      console.log('⚠️ WorkloadTab: No work orders data');
      return;
    }
    console.log(`📊 WorkloadTab: Processing ${workOrders.length} work orders`);

    // Machine workload: count interventions per asset (use assetId as primary, assetCode as fallback)
    const byMachine: Record<string, number> = {};
    workOrders.forEach((wo: any) => {
      const asset = wo.assetId || wo.assetCode || wo.asset || wo.machine;
      if (asset) {
        byMachine[asset] = (byMachine[asset] || 0) + 1;
      }
    });
    const machineData = Object.entries(byMachine)
      .map(([machine, count]) => ({ machine, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    console.log(`🏭 Machine workload: ${machineData.length} machines found`, machineData);
    setMachineWorkload(machineData);

    // Technician workload: SEPARATE internal staff from external subcontractors
    interface TechWorkload {
      technician: string;
      hours: number;
    }
    const internalStaff: Record<string, TechWorkload> = {};
    const externalSubcontractors: Record<string, number> = {}; // Just track total externe hours
    
    workOrders.forEach((wo: any) => {
      // Build full name from customColumns if available, otherwise use assignee
      const firstName = wo.customColumns?.staffFirstName;
      const lastName = wo.customColumns?.staffLastName;
      const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : wo.assignee?.trim();
      
      if (!fullName) return;
      
      // INTERNAL HOURS - per technician
      const internalHours = wo.customColumns?.internalHours || 0;
      if (internalHours > 0) {
        if (!internalStaff[fullName]) {
          internalStaff[fullName] = { technician: fullName, hours: 0 };
        }
        internalStaff[fullName].hours += internalHours;
      }
      
      // EXTERNAL HOURS - aggregated (not per technician, it's subcontractors)
      const externalHours = wo.customColumns?.externalHours || 0;
      if (externalHours > 0) {
        const key = 'Sous-traitance externe';
        externalSubcontractors[key] = (externalSubcontractors[key] || 0) + externalHours;
      }
    });
    
    const techData = Object.values(internalStaff)
      .map(t => ({
        technician: t.technician,
        hours: Number(t.hours.toFixed(1))
      }))
      .sort((a, b) => b.hours - a.hours);
    
    // Store external hours separately for summary cards (not in chart)
    const totalExternalHours = Object.values(externalSubcontractors).reduce((sum, hours) => sum + hours, 0);
    
    console.log(`👷 Technician workload: ${techData.length} technicians found`);
    console.log(`🛠️ External hours: ${totalExternalHours.toFixed(1)}h`);
    setTechWorkload(techData);
    console.log(`👷 Technician workload: ${techData.length} technicians found`, techData);
    setTechWorkload(techData);
  }, [workOrders]);

  return (
    <div className="space-y-6">
      {/* Machine Workload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-500" />
            Charge par Machine
          </CardTitle>
          <CardDescription>Nombre d'interventions par équipement</CardDescription>
        </CardHeader>
        <CardContent>
          {machineWorkload.length ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={machineWorkload}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="machine" />
                <YAxis label={{ value: 'Interventions', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technician Workload with Internal/External Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Charge par Technicien
          </CardTitle>
        </CardHeader>
        <CardContent>
          {techWorkload.length ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(400, techWorkload.length * 50)}>
                <BarChart data={techWorkload} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" label={{ value: 'Heures MO Interne', position: 'insideBottom', offset: -5 }} />
                  <YAxis type="category" dataKey="technician" width={120} />
                  <Tooltip 
                    formatter={(value: number) => [value + ' h', 'Heures internes']}
                  />
                  <Bar dataKey="hours" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded bg-green-50 p-3 dark:bg-green-950">
                  <div className="font-medium text-green-700 dark:text-green-300">Heures MO Interne</div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {techWorkload.reduce((s, t) => s + t.hours, 0).toFixed(1)} h
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {techWorkload.length} techniciens
                  </div>
                </div>
                <div className="rounded bg-orange-50 p-3 dark:bg-orange-950">
                  <div className="font-medium text-orange-700 dark:text-orange-300">Heures Sous-traitance</div>
                  <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                    {(() => {
                      // Calculate from work orders directly
                      const externalTotal = workOrders
                        .filter((wo: any) => wo.customColumns?.externalHours)
                        .reduce((sum: number, wo: any) => sum + (wo.customColumns?.externalHours || 0), 0);
                      return externalTotal.toFixed(1);
                    })()} h
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    Personnel externe
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technician Summary - Internal Hours Only */}
      {techWorkload.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Récapitulatif MO Interne</CardTitle>
            <CardDescription>Heures de travail du personnel interne uniquement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Technicien</th>
                    <th className="pb-2 text-right text-green-700">Heures Internes</th>
                  </tr>
                </thead>
                <tbody>
                  {techWorkload.map((row: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                      <td className="py-2 font-medium">{row.technician}</td>
                      <td className="py-2 text-right font-semibold text-green-700">
                        {row.hours.toFixed(1)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right text-green-700">
                      {techWorkload.reduce((s: number, r: any) => s + r.hours, 0).toFixed(1)} h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== HELPER FUNCTIONS ==========
