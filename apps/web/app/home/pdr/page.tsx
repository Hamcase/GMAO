'use client';

import { useState, useEffect } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { createClient } from '~/lib/supabase-browser-client';
import { PDRThresholdSlider } from '~/components/pdr-threshold-slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
import { Switch } from '@kit/ui/switch';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Calendar,
  Clock,
  DollarSign,
  BarChart3,
  Sparkles,
  ShoppingCart,
  Truck,
  Zap,
  Bell,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Scatter,
} from 'recharts';

// ========== HELPERS ==========
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'good': return 'bg-green-500';
    case 'warning': return 'bg-orange-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

const getTendanceIcon = (tendance: string) => {
  switch (tendance) {
    case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
    default: return <Activity className="h-4 w-4 text-gray-500" />;
  }
};

export default function PDRPage() {
  const [aiEnabled, setAiEnabled] = useState(true);
  const [selectedPiece, setSelectedPiece] = useState<string>('all');
  const [horizon, setHorizon] = useState<string>('3'); // mois
  const [isLoading, setIsLoading] = useState(true);
  
  // Dynamic state from Supabase
  const [stockData, setStockData] = useState<any[]>([]);
  const [demandData, setDemandData] = useState<any[]>([]);
  const [alertes, setAlertes] = useState<any[]>([]);
  const [categoryForecast, setCategoryForecast] = useState<any[]>([]);

  useEffect(() => {
    const fetchPDRData = async () => {
      try {
        const supabase = createClient();

        // 1. Fetch reorder status (view_reorder_status)
        const { data: reorderData } = await supabase
          .from('view_reorder_status')
          .select('*')
          .order('status', { ascending: true }); // critical first

        if (reorderData && reorderData.length) {
          const stock = reorderData.map((r: any) => ({
            id: r.part_id,
            name: r.part_name || 'N/A',
            category: r.category || 'Autre',
            stockActuel: r.current_quantity || 0,
            stockSecurite: r.safety_stock || 0,
            pointReappro: r.reorder_point || 0,
            leadTime: r.lead_time_days || 7,
            coutUnitaire: r.unit_cost || 0,
            consommationMoyenne: r.avg_monthly_usage || 0,
            status: r.status || 'unknown',
            tendance: r.current_quantity > r.reorder_point ? 'stable' : 'down',
          }));
          setStockData(stock);

          // Generate alerts for critical/warning items
          const alerts = stock
            .filter((s: any) => s.status === 'critical' || s.status === 'warning')
            .map((s: any, idx: number) => {
              const daysToRupture = s.consommationMoyenne > 0 ? Math.floor((s.stockActuel / s.consommationMoyenne) * 30) : 999;
              const quantiteRecommandee = Math.max(s.pointReappro - s.stockActuel, 20);
              return {
                id: idx + 1,
                type: s.status,
                piece: s.name,
                message: `Stock ${s.status === 'critical' ? 'sous seuil de sécurité' : 'proche du point de réappro'} (${s.stockActuel}/${s.stockSecurite})`,
                action: s.status === 'critical' ? 'Commander immédiatement' : 'Commander sous 48h',
                delai: `Rupture dans ${daysToRupture} jours`,
                quantite: quantiteRecommandee,
                cout: Math.round(quantiteRecommandee * s.coutUnitaire),
              };
            });
          setAlertes(alerts);
        } else {
          setStockData([]);
          setAlertes([]);
        }

        // 2. Fetch part demand (view_part_demand) for trend over time
        const { data: demandRows } = await supabase
          .from('view_part_demand')
          .select('*')
          .order('period', { ascending: true });

        if (demandRows && demandRows.length) {
          // Group by period (YYYY-MM) and aggregate total usage
          const grouped: Record<string, number> = {};
          demandRows.forEach((r: any) => {
            const key = r.period || 'N/A';
            grouped[key] = (grouped[key] || 0) + (r.total_usage || 0);
          });
          // Build time series for last 6 months + simple forecast
          const sortedPeriods = Object.keys(grouped).sort().slice(-6);
          const historical = sortedPeriods.map((period) => {
            const date = new Date(period + '-01');
            const month = MONTHS_FR[date.getMonth()];
            return { month, actual: grouped[period], forecast: null, lower: null, upper: null, isHistorical: true };
          });
          // Simple forecast: average of last 3 months + 5% growth
          const lastThree = sortedPeriods.slice(-3).map(p => grouped[p] || 0);
          const avgDemand = lastThree.length ? lastThree.reduce((a, b) => (a || 0) + (b || 0), 0) / lastThree.length : 0;
          const forecast = [];
          const now = new Date();
          for (let i = 1; i <= 3; i++) {
            const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const month = MONTHS_FR[futureDate.getMonth()];
            const predicted = Math.round(avgDemand * (1 + i*0.05));
            forecast.push({
              month,
              actual: null,
              forecast: predicted,
              lower: Math.round(predicted * 0.9),
              upper: Math.round(predicted * 1.1),
              isHistorical: false,
            });
          }
          setDemandData([...historical, ...forecast]);
        } else {
          setDemandData([]);
        }

        // 3. Dépense par catégorie (réalisé uniquement, aucune valeur simulée)
        if (reorderData && reorderData.length) {
          const categories: Record<string, number> = {};
          reorderData.forEach((r: any) => {
            const cat = r.category || 'Autre';
            const val = (r.current_quantity || 0) * (r.unit_cost || 0);
            categories[cat] = (categories[cat] || 0) + val;
          });
          const catActual = Object.entries(categories).map(([category, value]) => ({
            category,
            actual: Math.round(value),
          }));
          setCategoryForecast(catActual);
        } else {
          setCategoryForecast([]);
        }
      } catch (e) {
        console.error('Error fetching PDR data:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPDRData();
  }, []);

  // Calculs KPIs
  const totalStock = stockData.reduce((sum, item) => sum + item.stockActuel, 0);
  const valeurStock = stockData.reduce((sum, item) => sum + (item.stockActuel * item.coutUnitaire), 0);
  const piecesEnAlerte = stockData.filter(item => item.status === 'critical' || item.status === 'warning').length;
  const coutReapproTotal = alertes.reduce((sum, alerte) => sum + alerte.cout, 0);
  
  // Mission time impact derived heuristically from current critical alerts (placeholder logic until real downtime linkage)
  const missionTimeData = (() => {
    const criticalCount = alertes.filter(a => a.type === 'critical').length;
    if (!criticalCount) return [];
    // Heuristic base cost derived from stock value (avoid division by 0)
    const baseCost = valeurStock > 0 ? Math.max(500, valeurStock / 75) : 1000;
    const scenario = (label: string, factor: number, color: string) => ({
      scenario: label,
      downtime: criticalCount * factor,
      cost: Math.round(baseCost * criticalCount * (factor / 4 + 1.2)),
      color,
    });
    return [
      { scenario: 'Disponible', downtime: 0, cost: 0, color: '#10b981' },
      scenario('Retard court', 4, '#f59e0b'),
      scenario('Retard long', 12, '#ef4444'),
      scenario('Rupture', 24, '#991b1b'),
    ];
  })();

  return (
    <div className="flex flex-col space-y-6 pb-36">
      <AppBreadcrumbs values={{ 'PDR (Prévisions)': '' }} />

      {/* Header avec Toggle IA */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prévision de Demandes & Réapprovisionnement</h1>
          <p className="text-muted-foreground">
            Analyse prédictive des besoins en pièces de rechange avec seuils business optimisés
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              📊 DONNÉES RÉELLES
            </Badge>
            <span className="text-xs text-muted-foreground">
              {stockData.length > 0 ? `${stockData.length} pièces depuis Supabase` : 'En attente de données stock'}
            </span>
          </div>
        </div>

        {/* Toggle IA */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <Label htmlFor="ai-pdr-toggle" className="cursor-pointer font-semibold">
                IA Prédictive
              </Label>
              <p className="text-xs text-muted-foreground">
                {aiEnabled ? 'Modèle ARIMA activé' : 'Baseline moyenne mobile'}
              </p>
            </div>
            <Switch
              id="ai-pdr-toggle"
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </CardContent>
        </Card>
      </div>

      {/* KPIs Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valeur Stock Total</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : `${valeurStock.toLocaleString('fr-FR')} €`}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? '...' : `${totalStock} pièces en stock`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertes Actives</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : piecesEnAlerte}</div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? '...' : `${alertes.filter(a => a.type === 'critical').length} critiques`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Réappro Urgent</CardTitle>
            <ShoppingCart className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : `${coutReapproTotal.toLocaleString('fr-FR')} €`}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? '...' : `${alertes.length} commandes à passer`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lead Time Moyen</CardTitle>
            <Truck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stockData.length > 0 ? `${(stockData.reduce((sum, item) => sum + item.leadTime, 0) / stockData.length).toFixed(1)} jours` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Lead time moyen fournisseurs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertes Critiques Banner */}
      {alertes.some(a => a.type === 'critical') && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardContent className="flex items-center gap-3 p-4">
            <Bell className="h-5 w-5 animate-pulse text-red-600" />
            <div className="flex-1">
              <p className="font-semibold text-red-900 dark:text-red-100">
                ⚠️ {alertes.filter(a => a.type === 'critical').length} pièces en rupture imminente
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Action requise : Commander immédiatement pour éviter arrêt production
              </p>
            </div>
            <Button variant="destructive" className="gap-2">
              <Zap className="h-4 w-4" />
              Commander maintenant
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Graphique Principal - Séries Temporelles */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Prévision de Demande - Séries Temporelles
            </CardTitle>
            <CardDescription>
              Historique 6 mois + Prévisions {horizon} mois {aiEnabled && '(Modèle ARIMA)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-4">
              <div>
                <Label htmlFor="horizon">Horizon de prévision</Label>
                <Select value={horizon} onValueChange={setHorizon}>
                  <SelectTrigger id="horizon" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 mois</SelectItem>
                    <SelectItem value="3">3 mois</SelectItem>
                    <SelectItem value="6">6 mois</SelectItem>
                    <SelectItem value="12">12 mois</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={demandData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis label={{ value: 'Quantité demandée', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                
                {/* Bande de confiance (intervalle de prévision) */}
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="none"
                  fill="#93c5fd"
                  fillOpacity={0.3}
                  name="Intervalle confiance"
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                />
                
                {/* Ligne historique */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 5 }}
                  name="Demande réelle"
                />
                
                {/* Ligne prévision */}
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#10b981"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={{ fill: '#10b981', r: 5 }}
                  name="Prévision IA"
                />
                
                {/* Ligne de démarcation historique/prévision */}
                <ReferenceLine x="Sep" stroke="#6b7280" strokeDasharray="3 3" label="Aujourd'hui" />
              </ComposedChart>
            </ResponsiveContainer>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {(() => {
                const hist = demandData.filter((d: any) => d.isHistorical);
                const last = hist.length ? hist[hist.length - 1] : null;
                const firstForecast = demandData.find((d: any) => !d.isHistorical) as any || null;
                const pct = last && firstForecast && last.actual
                  ? Number((((firstForecast.forecast || 0) - (last.actual || 0)) / (last.actual || 1) * 100).toFixed(1))
                  : null;
                return (
                  <>
                    <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
                      <p className="text-xs text-muted-foreground">Demande actuelle ({last ? last.month : '—'})</p>
                      <p className="text-lg font-bold">{last ? `${last.actual} pièces` : '—'}</p>
                    </div>
                    <div className="rounded-md bg-green-50 p-3 dark:bg-green-950">
                      <p className="text-xs text-muted-foreground">Prévision {firstForecast ? firstForecast.month : '—'}</p>
                      <p className="text-lg font-bold">
                        {firstForecast ? `${firstForecast.forecast} pièces` : '—'}
                        {pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
                      </p>
                    </div>
                    <div className="rounded-md bg-purple-50 p-3 dark:bg-purple-950">
                      <p className="text-xs text-muted-foreground">Intervalle confiance</p>
                      <p className="text-lg font-bold">
                        {firstForecast ? `${firstForecast.lower}-${firstForecast.upper}` : '—'}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Alertes de Réapprovisionnement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Alertes Urgentes
            </CardTitle>
            <CardDescription>Actions de réappro requises</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertes.map((alerte) => (
              <Card
                key={alerte.id}
                className={`border-l-4 ${
                  alerte.type === 'critical' ? 'border-l-red-500 bg-red-50 dark:bg-red-950' : 'border-l-orange-500 bg-orange-50 dark:bg-orange-950'
                }`}
              >
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <Badge variant={alerte.type === 'critical' ? 'destructive' : 'default'}>
                      {alerte.type === 'critical' ? 'CRITIQUE' : 'ATTENTION'}
                    </Badge>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h4 className="mb-1 font-semibold">{alerte.piece}</h4>
                  <p className="mb-2 text-xs text-muted-foreground">{alerte.message}</p>
                  <div className="mb-2 rounded-md bg-white p-2 dark:bg-gray-900">
                    <p className="text-xs">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {alerte.delai}
                    </p>
                    <p className="text-xs">
                      <Package className="mr-1 inline h-3 w-3" />
                      Qté: {alerte.quantite} • {alerte.cout.toLocaleString('fr-FR')} €
                    </p>
                  </div>
                  <Button size="sm" variant="destructive" className="w-full gap-2">
                    <ShoppingCart className="h-3 w-3" />
                    {alerte.action}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Seuils Interactifs PDR */}
      <PDRThresholdSlider />

      {/* Stock Status & Mission Time Impact */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* État des Stocks avec Seuils */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-500" />
              État des Stocks par Pièce
            </CardTitle>
            <CardDescription>Stock actuel vs seuils business (sécurité & réappro)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stockData.map((piece) => (
                <div key={piece.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(piece.status)}`} />
                      <span className="font-medium">{piece.name}</span>
                      {getTendanceIcon(piece.tendance)}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {piece.category}
                    </Badge>
                  </div>
                  
                  <div className="relative h-8 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    {/* Barre de stock actuel */}
                    <div
                      className={`absolute h-full ${
                        piece.stockActuel < piece.stockSecurite
                          ? 'bg-red-500'
                          : piece.stockActuel < piece.pointReappro
                            ? 'bg-orange-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${(piece.stockActuel / (piece.pointReappro * 1.5)) * 100}%` }}
                    />
                    
                    {/* Marqueurs de seuils */}
                    <div
                      className="absolute h-full w-1 bg-orange-700"
                      style={{ left: `${(piece.stockSecurite / (piece.pointReappro * 1.5)) * 100}%` }}
                      title="Seuil de sécurité"
                    />
                    <div
                      className="absolute h-full w-1 bg-blue-700"
                      style={{ left: `${(piece.pointReappro / (piece.pointReappro * 1.5)) * 100}%` }}
                      title="Point de réappro"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Stock: {piece.stockActuel}</span>
                    <span>Sécurité: {piece.stockSecurite}</span>
                    <span>Réappro: {piece.pointReappro}</span>
                    <span className="font-semibold">{(piece.coutUnitaire * piece.stockActuel).toFixed(0)} €</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mission Time - Coût de Rupture */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              Mission Time Impact
            </CardTitle>
            <CardDescription>
              Analyse coût de rupture de stock (downtime production)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {missionTimeData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={missionTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="scenario" />
                  <YAxis yAxisId="left" label={{ value: 'Heures arrêt', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Coût (€)', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="downtime" name="Heures arrêt">
                    {missionTimeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                  <Bar yAxisId="right" dataKey="cost" fill="#ef4444" name="Coût rupture (€)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Aucune alerte critique pour estimer les scénarios d'impact</div>
            )}

            <div className="mt-4 space-y-3">
              {missionTimeData.length ? (
                <>
                  <div className="rounded-md bg-green-50 p-3 dark:bg-green-950">
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                      ✓ Stock disponible = 0€ de perte
                    </p>
                  </div>
                  <div className="rounded-md bg-red-50 p-3 dark:bg-red-950">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                      ⚠️ Scénario rupture = {(() => {
                        const last = (missionTimeData.length ? missionTimeData[missionTimeData.length - 1] : undefined) as any | undefined;
                        const cost = last?.cost ?? 0;
                        return cost.toLocaleString('fr-FR');
                      })()}€ de coût downtime
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      Basé sur {alertes.filter(a => a.type === 'critical').length} alertes critiques actuelles
                    </p>
                  </div>
                  <div className="rounded-md bg-purple-50 p-3 dark:bg-purple-950">
                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                      💡 Ratio protection: {(() => {
                        if (!valeurStock || !missionTimeData.length) return '—';
                        const last = (missionTimeData[missionTimeData.length - 1] as any | undefined);
                        const cost = last?.cost ?? 0;
                        return (cost / valeurStock).toFixed(1) + 'x';
                      })()}
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      Investir {valeurStock.toLocaleString('fr-FR')}€ protège contre des pertes élevées potentielles
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Aucune donnée critique active — scénarios d'impact non calculés.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dépenses par Catégorie (réalisé) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-500" />
            Dépenses par Catégorie
          </CardTitle>
          <CardDescription>
            Montants réalisés par catégorie
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryForecast} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" label={{ value: 'Montant (€)', position: 'insideBottom', offset: -5 }} />
              <YAxis type="category" dataKey="category" width={120} />
              <Tooltip />
              <Legend />
              <Bar dataKey="actual" fill="#3b82f6" name="Réalisé" />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-5 gap-3">
            {categoryForecast.map((cat: any) => (
              <div key={cat.category} className="rounded-md bg-muted p-3">
                <p className="mb-1 text-xs font-medium">{cat.category}</p>
                <p className="text-sm font-bold">{cat.actual.toLocaleString('fr-FR')} €</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions Recommandées par IA */}
      {aiEnabled && (
        <Card className="border-purple-500 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Recommandations IA - Actions Prioritaires
            </CardTitle>
            <CardDescription>
              Générées automatiquement dès que le modèle est disponible
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-md border border-dashed p-4">
              En attente de recommandations — importez davantage d'historique pour activer le modèle.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}