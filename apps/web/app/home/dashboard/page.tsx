'use client';

import { useState, useEffect } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { createClient } from '~/lib/supabase-browser-client';
import { ETLJobsTable } from '~/components/etl-jobs-table';
import { ExportPDFButton } from '~/components/export-pdf-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Switch } from '@kit/ui/switch';
import { Label } from '@kit/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
import { ScrollArea } from '@kit/ui/scroll-area';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Wrench, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  Cpu,
  Database,
  BarChart3,
  Factory,
  Sparkles,
  Target,
  Zap,
  ListTodo,
  Filter,
  Calendar
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
  PieChart,
  Pie,
  ComposedChart,
} from 'recharts';

// Données mockées pour MTBF/MTTR
const mtbfMttrData = [
  { month: 'Jan', mtbf: 168, mttr: 2.5, predicted: 175 },
  { month: 'Fév', mtbf: 172, mttr: 2.3, predicted: 180 },
  { month: 'Mar', mtbf: 165, mttr: 2.8, predicted: 185 },
  { month: 'Avr', mtbf: 180, mttr: 2.1, predicted: 190 },
  { month: 'Mai', mtbf: 185, mttr: 1.9, predicted: 195 },
  { month: 'Juin', mtbf: 190, mttr: 1.8, predicted: 200 },
];

// Disponibilité par équipement
const availabilityData = [
  { equipment: 'Compresseur A1', availability: 98.5, status: 'excellent' },
  { equipment: 'Pompe P12', availability: 95.2, status: 'good' },
  { equipment: 'Moteur M8', availability: 89.1, status: 'warning' },
  { equipment: 'Convoyeur C3', availability: 85.3, status: 'warning' },
  { equipment: 'Robot R5', availability: 92.7, status: 'good' },
];

// Charge par technicien
const technicianWorkload = [
  { name: 'Jean Dupont', planned: 12, completed: 10, inProgress: 2, utilization: 85 },
  { name: 'Marie Martin', planned: 15, completed: 14, inProgress: 1, utilization: 93 },
  { name: 'Paul Bernard', planned: 10, completed: 8, inProgress: 2, utilization: 80 },
  { name: 'Sophie Laurent', planned: 13, completed: 11, inProgress: 2, utilization: 88 },
];

// Priorités de formation
const trainingPriorities = [
  { skill: 'Électrique', current: 75, target: 90 },
  { skill: 'Mécanique', current: 85, target: 90 },
  { skill: 'Hydraulique', current: 65, target: 85 },
  { skill: 'Pneumatique', current: 70, target: 85 },
  { skill: 'Automatisme', current: 60, target: 80 },
  { skill: 'Sécurité', current: 90, target: 95 },
];

// Jobs ETL
const etlJobs = [
  { id: 1, name: 'MTBF Calculation', status: 'success', lastRun: '2 min ago', duration: '1.2s' },
  { id: 2, name: 'MTTR Analytics', status: 'success', lastRun: '5 min ago', duration: '0.8s' },
  { id: 3, name: 'Availability ETL', status: 'running', lastRun: 'En cours...', duration: '-' },
  { id: 4, name: 'Workload Sync', status: 'success', lastRun: '10 min ago', duration: '2.1s' },
];

// Données Pareto (80/20)
const paretoData = [
  { cause: 'Usure roulements', failures: 42, cumulative: 42 },
  { cause: 'Fuite hydraulique', failures: 28, cumulative: 70 },
  { cause: 'Surchauffe moteur', failures: 18, cumulative: 88 },
  { cause: 'Défaut électrique', failures: 8, cumulative: 96 },
  { cause: 'Autres', failures: 4, cumulative: 100 },
];

// OEE Components
const oeeData = {
  availability: 92.1,
  performance: 88.5,
  quality: 96.2,
  oee: 78.4, // 92.1 × 88.5 × 96.2 / 10000
};

// 5S Audit
const fiveSData = [
  { aspect: 'Seiri (Tri)', score: 85 },
  { aspect: 'Seiton (Rangement)', score: 78 },
  { aspect: 'Seiso (Nettoyage)', score: 92 },
  { aspect: 'Seiketsu (Standardiser)', score: 75 },
  { aspect: 'Shitsuke (Discipline)', score: 88 },
];

// Kanban Board Data Types
type KanbanItem = {
  id: number;
  title: string;
  equipment: string;
  priority: string;
  assignee: string;
  reason?: string;
};

type KanbanData = {
  todo: KanbanItem[];
  inProgress: KanbanItem[];
  blocked: KanbanItem[];
  done: KanbanItem[];
};

const kanbanData: KanbanData = {
  todo: [
    { id: 1, title: 'Révision Compresseur A1', equipment: 'Compresseur A1', priority: 'high', assignee: 'Jean Dupont' },
    { id: 2, title: 'Changement filtres Pompe P12', equipment: 'Pompe P12', priority: 'medium', assignee: 'Marie Martin' },
  ],
  inProgress: [
    { id: 3, title: 'Réparation Moteur M8', equipment: 'Moteur M8', priority: 'high', assignee: 'Paul Bernard' },
    { id: 4, title: 'Calibration Robot R5', equipment: 'Robot R5', priority: 'low', assignee: 'Sophie Laurent' },
  ],
  blocked: [
    { id: 5, title: 'Remplacement Convoyeur C3', equipment: 'Convoyeur C3', priority: 'critical', assignee: 'Jean Dupont', reason: 'Pièce en commande' },
  ],
  done: [
    { id: 6, title: 'Lubrification Ligne 1', equipment: 'Ligne 1', priority: 'medium', assignee: 'Marie Martin' },
    { id: 7, title: 'Test CVC', equipment: 'Système CVC', priority: 'low', assignee: 'Paul Bernard' },
  ],
};

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

export default function DashboardPage() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'kpis' | 'lean' | 'kanban'>('kpis');
  const [realKpiData, setRealKpiData] = useState<any>(null);
  const [realWorkloadData, setRealWorkloadData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter states
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30days');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Fetch real data from Supabase
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      
      // Fetch KPI data
      const { data: kpiData } = await supabase
        .from('view_asset_kpis')
        .select('*')
        .limit(10);
      
      // Fetch technician workload
      const { data: workloadData } = await supabase
        .from('view_technician_workload')
        .select('*');

      setRealKpiData(kpiData);
      setRealWorkloadData(workloadData || []);
      setIsLoading(false);
    }

    fetchData();
  }, []);

  // Calculate aggregates from real data
  const avgMtbf = realKpiData && realKpiData.length > 0 
    ? Math.round(realKpiData.reduce((sum: number, row: any) => sum + (row.mtbf_hours || 0), 0) / realKpiData.length)
    : null;
  
  const avgMttr = realKpiData && realKpiData.length > 0
    ? (realKpiData.reduce((sum: number, row: any) => sum + (row.mttr_hours || 0), 0) / realKpiData.length).toFixed(1)
    : null;

  const avgAvailability = realKpiData && realKpiData.length > 0
    ? (realKpiData.reduce((sum: number, row: any) => sum + (row.availability_pct || 0), 0) / realKpiData.length).toFixed(1)
    : null;

  const avgUtilization = realWorkloadData.length > 0
    ? (realWorkloadData.reduce((sum: number, row: any) => sum + (row.utilization_pct || 0), 0) / realWorkloadData.length).toFixed(1)
    : null;

  // Prepare export data for PDF
  const dashboardExportData = {
    kpis: [
      { label: 'MTBF Moyen', value: avgMtbf ? `${avgMtbf} heures` : '190 heures' },
      { label: 'MTTR Moyen', value: avgMttr ? `${avgMttr} heures` : '1.8 heures' },
      { label: 'Disponibilité', value: avgAvailability ? `${avgAvailability}%` : '92.1%' },
      { label: 'Utilisation', value: avgUtilization ? `${avgUtilization}%` : '86.5%' },
      { label: 'Techniciens actifs', value: realWorkloadData.length || '12' },
      { label: 'Machines critiques', value: '8' },
    ],
    table: {
      headers: ['Machine', 'MTBF (h)', 'MTTR (h)', 'Disponibilité (%)', 'Statut'],
      rows: realKpiData && realKpiData.length > 0 
        ? realKpiData.slice(0, 10).map((row: any) => ({
            machine: row.asset_name || 'N/A',
            mtbf: row.mtbf_hours?.toFixed(1) || 'N/A',
            mttr: row.mttr_hours?.toFixed(1) || 'N/A',
            availability: row.availability_pct?.toFixed(1) || 'N/A',
            status: row.availability_pct > 95 ? 'Excellent' : row.availability_pct > 85 ? 'Bon' : 'Attention',
          }))
        : [
            { machine: 'Compresseur A1', mtbf: '190', mttr: '1.8', availability: '95.2', status: 'Excellent' },
            { machine: 'Pompe B2', mtbf: '156', mttr: '2.1', availability: '89.4', status: 'Bon' },
            { machine: 'Convoyeur C3', mtbf: '220', mttr: '1.2', availability: '97.8', status: 'Excellent' },
          ],
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
                  <SelectItem value="compresseur-a1">Compresseur A1</SelectItem>
                  <SelectItem value="pompe-b2">Pompe B2</SelectItem>
                  <SelectItem value="convoyeur-c3">Convoyeur C3</SelectItem>
                  <SelectItem value="moteur-d4">Moteur D4</SelectItem>
                  <SelectItem value="chaudiere-e5">Chaudière E5</SelectItem>
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
              <p className="text-sm text-purple-700 dark:text-purple-300">
                ⚠️ Risque de panne Compresseur A1 dans 3 jours • Recommandation: Planifier maintenance préventive
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
        />
      )}
      {activeTab === 'lean' && <LeanAnalyticsTab />}
      {activeTab === 'kanban' && <KanbanBoardTab />}
    </div>
  );
}

// ========== ONGLET KPIs ==========
function KPIsTab({ 
  aiEnabled, 
  selectedMachine, 
  selectedPeriod, 
  selectedStatus 
}: { 
  aiEnabled: boolean;
  selectedMachine: string;
  selectedPeriod: string;
  selectedStatus: string;
}) {
  // Real-time data from Supabase
  const [realKpiData, setRealKpiData] = useState<any>(null);
  const [realWorkloadData, setRealWorkloadData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();

        // Fetch asset KPIs
        const { data: kpiData } = await supabase
          .from('view_asset_kpis')
          .select('*')
          .limit(10);

        // Fetch technician workload
        const { data: workloadData } = await supabase
          .from('view_technician_workload')
          .select('*');

        setRealKpiData(kpiData);
        setRealWorkloadData(workloadData || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate aggregated KPIs from real data
  const avgMtbf = realKpiData?.length
    ? Math.round(realKpiData.reduce((sum: number, k: any) => sum + (k.mtbf_hours || 0), 0) / realKpiData.length)
    : null;

  const avgMttr = realKpiData?.length
    ? (realKpiData.reduce((sum: number, k: any) => sum + (k.mttr_hours || 0), 0) / realKpiData.length).toFixed(1)
    : null;

  const avgAvailability = realKpiData?.length
    ? (realKpiData.reduce((sum: number, k: any) => sum + (k.availability_pct || 0), 0) / realKpiData.length).toFixed(1)
    : null;

  const avgUtilization = realWorkloadData?.length
    ? (realWorkloadData.reduce((sum: number, w: any) => sum + (w.utilization_pct || 0), 0) / realWorkloadData.length).toFixed(1)
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
                  {aiEnabled ? `${Math.round(avgMtbf * 1.05)} heures` : `${avgMtbf} heures`}
                  <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                </>
              ) : (
                <>
                  {aiEnabled ? '200 heures' : '190 heures'}
                  {aiEnabled && <Badge className="bg-purple-500 text-xs">IA</Badge>}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              {avgMtbf ? 'Calculé depuis vos données' : (aiEnabled ? '+10h prédit' : '+12% vs mois dernier')}
            </p>
            {!avgMtbf && !aiEnabled && (
              <div className="mt-2">
                <Badge variant="outline" className="text-xs">
                  Prédiction IA: 200h
                </Badge>
              </div>
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
                  {aiEnabled ? `${(parseFloat(avgMttr) * 0.85).toFixed(1)} heures` : `${avgMttr} heures`}
                  <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                </>
              ) : (
                <>
                  {aiEnabled ? '1.5 heures' : '1.8 heures'}
                  {aiEnabled && <Badge className="bg-purple-500 text-xs">IA</Badge>}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="mr-1 h-3 w-3 text-green-500" />
              {avgMttr ? 'Calculé depuis vos données' : (aiEnabled ? '-0.3h optimisé' : '-24% vs mois dernier')}
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
                  {aiEnabled ? `${(parseFloat(avgAvailability) * 1.02).toFixed(1)}%` : `${avgAvailability}%`}
                  <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                </>
              ) : (
                <>
                  {aiEnabled ? '94.5%' : '92.1%'}
                  {aiEnabled && <Badge className="bg-purple-500 text-xs">IA</Badge>}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              {avgAvailability ? 'Calculé depuis vos données' : (aiEnabled ? '+2.4% avec maintenance prédictive' : '+3.2% vs mois dernier')}
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
                  {aiEnabled ? `${(parseFloat(avgUtilization) * 0.95).toFixed(1)}%` : `${avgUtilization}%`}
                  <Badge className="bg-green-500 text-xs">REAL DATA</Badge>
                </>
              ) : (
                <>
                  {aiEnabled ? '82.0%' : '86.5%'}
                  {aiEnabled && <Badge className="bg-purple-500 text-xs">IA</Badge>}
                </>
              )}
            </div>
            <p className="flex items-center text-xs text-muted-foreground">
              {avgUtilization ? (
                <>
                  <Activity className="mr-1 h-3 w-3 text-blue-500" />
                  {realWorkloadData.length} techniciens actifs
                </>
              ) : aiEnabled ? (
                <>
                  <TrendingDown className="mr-1 h-3 w-3 text-orange-500" />
                  -4.5% (maintenance préventive)
                </>
              ) : (
                <>
                  <Activity className="mr-1 h-3 w-3 text-blue-500" />
                  4 techniciens actifs
                </>
              )}
            </p>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                Optimal: 80-90%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mtbfMttrData}>
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
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="predicted"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Prédiction IA"
                />
              </LineChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={availabilityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="equipment" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="availability" name="Disponibilité (%)">
                  {availabilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section Charge Techniciens et Formation */}
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
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={technicianWorkload}>
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
            <div className="mt-4 space-y-2">
              {technicianWorkload.map((tech) => (
                <div key={tech.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{tech.name}</span>
                  <Badge variant={tech.utilization > 90 ? 'destructive' : tech.utilization > 80 ? 'default' : 'secondary'}>
                    {tech.utilization}% utilisation
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Priorités de formation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              Priorités de Formation
            </CardTitle>
            <CardDescription>
              Compétences actuelles vs objectifs (IA)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={trainingPriorities}>
                <PolarGrid />
                <PolarAngleAxis dataKey="skill" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar
                  name="Niveau actuel"
                  dataKey="current"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.5}
                />
                <Radar
                  name="Objectif"
                  dataKey="target"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-4">
              <Badge variant="outline" className="text-xs">
                <Cpu className="mr-1 h-3 w-3" />
                Recommandations générées par IA
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section ETL Analytics */}
      <ETLJobsTable />
    </>
  );
}

// ========== ONGLET LEAN ANALYTICS ==========
function LeanAnalyticsTab() {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pareto Chart - 80/20 Rule */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              Analyse Pareto - Causes de Pannes (80/20)
            </CardTitle>
            <CardDescription>
              80% des pannes proviennent de 20% des causes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cause" angle={-15} textAnchor="end" height={80} />
                <YAxis yAxisId="left" label={{ value: 'Nombre de pannes', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: '% Cumulatif', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="failures" fill="#8b5cf6" name="Pannes" />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#ef4444" strokeWidth={2} name="% Cumulatif" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-4 rounded-md bg-purple-50 p-3 dark:bg-purple-950">
              <p className="text-sm text-purple-900 dark:text-purple-100">
                <strong>Insight:</strong> 70% des pannes sont causées par usure roulements et fuites hydrauliques. 
                Prioriser la maintenance préventive sur ces 2 causes pour un impact maximal.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* OEE Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              OEE (Overall Equipment Effectiveness)
            </CardTitle>
            <CardDescription>
              Disponibilité × Performance × Qualité
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative h-48 w-48">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
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
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold">{oeeData.oee}%</span>
                  <span className="text-sm text-muted-foreground">OEE Total</span>
                </div>
              </div>
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Disponibilité</span>
                  <span className="font-semibold">{oeeData.availability}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Performance</span>
                  <span className="font-semibold">{oeeData.performance}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Qualité</span>
                  <span className="font-semibold">{oeeData.quality}%</span>
                </div>
              </div>
              <Badge className="bg-green-500">
                Classe Mondiale (OEE &gt; 85% = 78.4%)
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* 5S Audit Radar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              Audit 5S
            </CardTitle>
            <CardDescription>
              Évaluation terrain des 5 piliers Lean
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={fiveSData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="aspect" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {fiveSData.map((item) => (
                <div key={item.aspect} className="flex items-center justify-between text-sm">
                  <span>{item.aspect}</span>
                  <Badge variant={item.score >= 85 ? 'default' : item.score >= 75 ? 'secondary' : 'destructive'}>
                    {item.score}/100
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cycle Time Distribution */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Distribution Temps de Cycle (VSM Simplified)
            </CardTitle>
            <CardDescription>
              Analyse des temps de réparation par type d'intervention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={[
                  { type: 'Préventive', avg: 2.1, min: 1.5, max: 3.2 },
                  { type: 'Corrective', avg: 4.5, min: 2.8, max: 7.2 },
                  { type: 'Urgence', avg: 1.2, min: 0.5, max: 2.5 },
                  { type: 'Amélioration', avg: 6.8, min: 5.0, max: 9.5 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis label={{ value: 'Heures', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg" fill="#f59e0b" name="Temps moyen" />
                <Bar dataKey="min" fill="#10b981" name="Min" />
                <Bar dataKey="max" fill="#ef4444" name="Max" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 rounded-md bg-orange-50 p-3 dark:bg-orange-950">
              <p className="text-sm text-orange-900 dark:text-orange-100">
                <strong>Lean Insight:</strong> Les interventions correctives ont 2x plus de variance. 
                Augmenter la maintenance préventive pour réduire les urgences et stabiliser le flow.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ========== ONGLET KANBAN BOARD ==========
function KanbanBoardTab() {
  const columns = [
    { id: 'todo', title: 'À faire', items: kanbanData.todo, color: 'border-blue-500' },
    { id: 'inProgress', title: 'En cours', items: kanbanData.inProgress, color: 'border-orange-500' },
    { id: 'blocked', title: 'Bloqué', items: kanbanData.blocked, color: 'border-red-500' },
    { id: 'done', title: 'Terminé', items: kanbanData.done, color: 'border-green-500' },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Interventions Kanban</h2>
          <p className="text-sm text-muted-foreground">
            Gestion visuelle des tâches de maintenance (Drag & Drop à venir)
          </p>
        </div>
        <Button className="gap-2">
          <Factory className="h-4 w-4" />
          Nouvelle Intervention
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => (
          <Card key={column.id} className={`border-t-4 ${column.color}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{column.title}</span>
                <Badge variant="outline">{column.items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {column.items.map((item) => (
                <Card key={item.id} className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-semibold">{item.title}</h3>
                      <div className={`h-2 w-2 rounded-full ${getPriorityColor(item.priority)}`} />
                    </div>
                    <p className="mb-2 text-sm text-muted-foreground">{item.equipment}</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {item.assignee}
                      </Badge>
                      <Badge className={`text-xs ${getPriorityColor(item.priority)} text-white`}>
                        {item.priority}
                      </Badge>
                    </div>
                    {'reason' in item && item.reason && (
                      <div className="mt-2 rounded-md bg-red-50 p-2 dark:bg-red-950">
                        <p className="text-xs text-red-900 dark:text-red-100">
                          🚧 {String(item.reason)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {column.items.length === 0 && (
                <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
                  <p className="text-sm text-muted-foreground">Aucune tâche</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Métriques Kanban */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lead Time Moyen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3.2 jours</div>
            <p className="text-xs text-muted-foreground">De création à terminé</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cycle Time Moyen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.8 jours</div>
            <p className="text-xs text-muted-foreground">De en cours à terminé</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">WIP Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kanbanData.inProgress.length}/5
            </div>
            <p className="text-xs text-muted-foreground">
              {kanbanData.inProgress.length >= 5 ? (
                <span className="text-red-500">⚠️ Limite atteinte</span>
              ) : (
                <span className="text-green-500">✓ Sous contrôle</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}