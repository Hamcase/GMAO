'use client';

import { useState } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
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

// ========== DONNÉES MOCKÉES ==========

// Séries temporelles - Demande historique + prévisions
const demandData = [
  // Historique (6 derniers mois)
  { month: 'Avr', actual: 245, forecast: null, lower: null, upper: null, isHistorical: true },
  { month: 'Mai', actual: 268, forecast: null, lower: null, upper: null, isHistorical: true },
  { month: 'Jui', actual: 312, forecast: null, lower: null, upper: null, isHistorical: true },
  { month: 'Juil', actual: 298, forecast: null, lower: null, upper: null, isHistorical: true },
  { month: 'Aoû', actual: 335, forecast: null, lower: null, upper: null, isHistorical: true },
  { month: 'Sep', actual: 289, forecast: null, lower: null, upper: null, isHistorical: true },
  // Prévisions (3 prochains mois)
  { month: 'Oct', actual: null, forecast: 310, lower: 280, upper: 340, isHistorical: false },
  { month: 'Nov', actual: null, forecast: 325, lower: 290, upper: 360, isHistorical: false },
  { month: 'Déc', actual: null, forecast: 342, lower: 305, upper: 380, isHistorical: false },
];

// Stock actuel par pièce
const stockData = [
  { 
    id: 1, 
    name: 'Roulements SKF 6205', 
    category: 'Mécanique',
    stockActuel: 45, 
    stockSecurite: 30, 
    pointReappro: 50,
    leadTime: 7, // jours
    coutUnitaire: 45.50,
    consommationMoyenne: 12, // par mois
    status: 'warning',
    tendance: 'down',
  },
  { 
    id: 2, 
    name: 'Filtres hydrauliques HF35', 
    category: 'Hydraulique',
    stockActuel: 18, 
    stockSecurite: 25, 
    pointReappro: 40,
    leadTime: 10,
    coutUnitaire: 78.00,
    consommationMoyenne: 8,
    status: 'critical',
    tendance: 'down',
  },
  { 
    id: 3, 
    name: 'Joints toriques NBR', 
    category: 'Étanchéité',
    stockActuel: 120, 
    stockSecurite: 50, 
    pointReappro: 80,
    leadTime: 5,
    coutUnitaire: 3.20,
    consommationMoyenne: 25,
    status: 'good',
    tendance: 'stable',
  },
  { 
    id: 4, 
    name: 'Contacteurs Schneider LC1', 
    category: 'Électrique',
    stockActuel: 35, 
    stockSecurite: 20, 
    pointReappro: 30,
    leadTime: 14,
    coutUnitaire: 125.00,
    consommationMoyenne: 6,
    status: 'good',
    tendance: 'up',
  },
  { 
    id: 5, 
    name: 'Courroies trapézoïdales SPZ', 
    category: 'Transmission',
    stockActuel: 8, 
    stockSecurite: 15, 
    pointReappro: 25,
    leadTime: 7,
    coutUnitaire: 22.50,
    status: 'critical',
    tendance: 'down',
    consommationMoyenne: 5,
  },
];

// Alertes de réapprovisionnement
const alertes = [
  { 
    id: 1, 
    type: 'critical', 
    piece: 'Filtres hydrauliques HF35', 
    message: 'Stock sous seuil de sécurité (18/25)', 
    action: 'Commander immédiatement',
    delai: 'Rupture dans 2 jours',
    quantite: 40,
    cout: 3120,
  },
  { 
    id: 2, 
    type: 'critical', 
    piece: 'Courroies trapézoïdales SPZ', 
    message: 'Stock critique (8/15)', 
    action: 'Commander immédiatement',
    delai: 'Rupture dans 1 jour',
    quantite: 30,
    cout: 675,
  },
  { 
    id: 3, 
    type: 'warning', 
    piece: 'Roulements SKF 6205', 
    message: 'Proche du point de réappro (45/50)', 
    action: 'Commander sous 48h',
    delai: 'Rupture dans 4 jours',
    quantite: 50,
    cout: 2275,
  },
];

// Mission Time Impact (analyse coût de rupture)
const missionTimeData = [
  { scenario: 'Disponible', downtime: 0, cost: 0, color: '#10b981' },
  { scenario: 'Retard 1j', downtime: 8, cost: 12000, color: '#f59e0b' },
  { scenario: 'Retard 3j', downtime: 24, cost: 36000, color: '#ef4444' },
  { scenario: 'Rupture', downtime: 72, cost: 108000, color: '#991b1b' },
];

// Prévisions par catégorie
const categoryForecast = [
  { category: 'Mécanique', prev: 2850, actual: 3100, budget: 3500, variation: '+8.8%' },
  { category: 'Hydraulique', prev: 1450, actual: 1620, budget: 1800, variation: '+11.7%' },
  { category: 'Électrique', prev: 3200, actual: 2980, budget: 3000, variation: '-6.9%' },
  { category: 'Étanchéité', prev: 890, actual: 920, budget: 1000, variation: '+3.4%' },
  { category: 'Transmission', prev: 1680, actual: 1750, budget: 1900, variation: '+4.2%' },
];

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

  // Calculs KPIs
  const totalStock = stockData.reduce((sum, item) => sum + item.stockActuel, 0);
  const valeurStock = stockData.reduce((sum, item) => sum + (item.stockActuel * item.coutUnitaire), 0);
  const piecesEnAlerte = stockData.filter(item => item.status === 'critical' || item.status === 'warning').length;
  const coutReapproTotal = alertes.reduce((sum, alerte) => sum + alerte.cout, 0);

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
            <div className="text-2xl font-bold">{valeurStock.toLocaleString('fr-FR')} €</div>
            <p className="text-xs text-muted-foreground">
              {totalStock} pièces en stock
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertes Actives</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{piecesEnAlerte}</div>
            <p className="text-xs text-muted-foreground">
              {alertes.filter(a => a.type === 'critical').length} critiques
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Réappro Urgent</CardTitle>
            <ShoppingCart className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coutReapproTotal.toLocaleString('fr-FR')} €</div>
            <p className="text-xs text-muted-foreground">
              {alertes.length} commandes à passer
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
              {(stockData.reduce((sum, item) => sum + item.leadTime, 0) / stockData.length).toFixed(1)} jours
            </div>
            <p className="text-xs text-muted-foreground">
              Min 5j - Max 14j
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
              <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
                <p className="text-xs text-muted-foreground">Demande actuelle (Sep)</p>
                <p className="text-lg font-bold">289 pièces</p>
              </div>
              <div className="rounded-md bg-green-50 p-3 dark:bg-green-950">
                <p className="text-xs text-muted-foreground">Prévision Oct</p>
                <p className="text-lg font-bold">310 pièces (+7.3%)</p>
              </div>
              <div className="rounded-md bg-purple-50 p-3 dark:bg-purple-950">
                <p className="text-xs text-muted-foreground">Intervalle confiance</p>
                <p className="text-lg font-bold">280-340 (95%)</p>
              </div>
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

            <div className="mt-4 space-y-3">
              <div className="rounded-md bg-green-50 p-3 dark:bg-green-950">
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                  ✓ Stock disponible = 0€ de perte
                </p>
              </div>
              <div className="rounded-md bg-red-50 p-3 dark:bg-red-950">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  ⚠️ Rupture 3 jours = 36 000€ de coût downtime
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">
                  Calcul: 1 500€/h × 24h = 36 000€
                </p>
              </div>
              <div className="rounded-md bg-purple-50 p-3 dark:bg-purple-950">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                  💡 ROI du stock de sécurité: {((36000 / valeurStock) * 100).toFixed(0)}x
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Investir {valeurStock.toLocaleString('fr-FR')}€ évite 36k€ de pertes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prévisions Budget par Catégorie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-500" />
            Prévisions Budget par Catégorie
          </CardTitle>
          <CardDescription>
            Comparaison prévisionnel vs réalisé vs budget annuel
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
              <Bar dataKey="prev" fill="#93c5fd" name="Prévisionnel" />
              <Bar dataKey="actual" fill="#3b82f6" name="Réalisé" />
              <Bar dataKey="budget" fill="#10b981" name="Budget" />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-5 gap-3">
            {categoryForecast.map((cat) => (
              <div key={cat.category} className="rounded-md bg-muted p-3">
                <p className="mb-1 text-xs font-medium">{cat.category}</p>
                <p className="text-sm font-bold">{cat.actual.toLocaleString('fr-FR')} €</p>
                <Badge
                  variant={cat.variation.startsWith('+') ? 'default' : 'secondary'}
                  className="mt-1 text-xs"
                >
                  {cat.variation}
                </Badge>
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
              Optimisation automatique basée sur l'analyse prédictive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-md bg-white p-4 dark:bg-gray-900">
              <CheckCircle2 className="mt-1 h-5 w-5 text-green-500" />
              <div>
                <p className="font-semibold">Commander Filtres hydrauliques HF35 maintenant</p>
                <p className="text-sm text-muted-foreground">
                  Stock critique (18/25). Lead time 10j. Rupture prévue dans 2j. Coût rupture estimé: 24 000€
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md bg-white p-4 dark:bg-gray-900">
              <CheckCircle2 className="mt-1 h-5 w-5 text-green-500" />
              <div>
                <p className="font-semibold">Augmenter stock de sécurité Roulements SKF 6205</p>
                <p className="text-sm text-muted-foreground">
                  Consommation +15% vs prévision. Seuil actuel (30) insuffisant. Recommandation: 45 pièces
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md bg-white p-4 dark:bg-gray-900">
              <CheckCircle2 className="mt-1 h-5 w-5 text-green-500" />
              <div>
                <p className="font-semibold">Renégocier contrat fournisseur Contacteurs Schneider</p>
                <p className="text-sm text-muted-foreground">
                  Lead time 14j trop long. Opportunité: -20% coût si commande groupée trimestrielle
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}