'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, Clock, AlertTriangle } from 'lucide-react';
import { createClient } from '~/lib/supabase-browser-client';

/**
 * Real KPI Dashboard Component
 * Queries asset_kpis table for Availability, MTBF, MTTR trends
 */

interface KpiData {
  period: string;
  metric_type: string;
  value: number;
  asset_code?: string;
}

interface KpiStats {
  current: number;
  previous: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

export default function RealKpiDashboard({ localDataPresent }: { localDataPresent: boolean }) {
  // Detect Supabase configuration at build time (client-safe)
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const supabase = hasSupabase ? createClient() : null as any;
  
  const [availabilityData, setAvailabilityData] = useState<any[]>([]);
  const [mtbfData, setMtbfData] = useState<any[]>([]);
  const [mttrData, setMttrData] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, KpiStats>>({});
  const [loading, setLoading] = useState(true);
  const [showRemote, setShowRemote] = useState<boolean>(localDataPresent); // if no local data, hide remote until user opts in

  useEffect(() => {
    if (hasSupabase) {
      loadKpiData();
    } else {
      setLoading(false);
    }
  }, [hasSupabase]);

  async function loadKpiData() {
    try {
      if (!hasSupabase) return;
      // Get last 12 months of KPI data
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const { data, error } = await supabase
        .from('asset_kpis')
        .select('*')
        .gte('period', twelveMonthsAgo.toISOString().split('T')[0])
        .order('period', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('No KPI data yet - upload MTBF_MTTR.xlsx to see trends');
        setLoading(false);
        return;
      }

      // Group by metric type
      const availability = data.filter((d: any) => d.metric_type === 'availability');
      const mtbf = data.filter((d: any) => d.metric_type === 'mtbf');
      const mttr = data.filter((d: any) => d.metric_type === 'mttr');

      // Aggregate by period (month)
      const aggregateByPeriod = (items: any[]) => {
        const grouped = items.reduce((acc, item) => {
          const period = item.period; // Already in YYYY-MM format
          if (!acc[period]) {
            acc[period] = { period, values: [] };
          }
          acc[period].values.push(parseFloat(item.metric_value));
          return acc;
        }, {} as Record<string, { period: string; values: number[] }>);

        return Object.values(grouped).map((g: any) => ({
          period: g.period,
          value: g.values.reduce((a: number, b: number) => a + b, 0) / g.values.length, // Average
        }));
      };

      const availabilityTrend = aggregateByPeriod(availability);
      const mtbfTrend = aggregateByPeriod(mtbf);
      const mttrTrend = aggregateByPeriod(mttr);

      // Calculate stats (current vs previous month)
      const calculateStats = (trend: any[], metricName: string): KpiStats => {
        if (trend.length < 2) {
          return { current: trend[0]?.value || 0, previous: 0, change: 0, trend: 'stable' };
        }
        const current = trend[trend.length - 1].value;
        const previous = trend[trend.length - 2].value;
        // Guard against division by ~0 inflating percentages
        if (!previous || previous < 0.0001) {
          return { current, previous, change: 0, trend: 'stable' };
        }
        const rawChange = ((current - previous) / previous) * 100;
        const change = Number(rawChange.toFixed(1));
        return {
          current,
          previous,
            change,
          trend: change > 2 ? 'up' : change < -2 ? 'down' : 'stable',
        };
      };

      setAvailabilityData(availabilityTrend);
      setMtbfData(mtbfTrend);
      setMttrData(mttrTrend);
      
      setStats({
        availability: calculateStats(availabilityTrend, 'Availability'),
        mtbf: calculateStats(mtbfTrend, 'MTBF'),
        mttr: calculateStats(mttrTrend, 'MTTR'),
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading KPI data:', err);
      setLoading(false);
    }
  }

  if (!hasSupabase) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800">
              Hors-ligne
            </Badge>
            <CardTitle>📊 Données Réelles - asset_kpis</CardTitle>
          </div>
          <CardDescription>
            Connectez Supabase (NEXT_PUBLIC_SUPABASE_URL/KEY) pour afficher les tendances MTBF/MTTR/Disponibilité.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Section désactivée en mode local (IndexedDB uniquement)
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || (!showRemote && hasSupabase)) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 bg-muted animate-pulse rounded w-24" />
            </CardHeader>
            <CardContent>
              <div className="h-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
        {!loading && !showRemote && (
          <Card className="md:col-span-3 border-dashed">
            <CardHeader>
              <CardTitle className="text-sm">Données cloud masquées</CardTitle>
              <CardDescription>Aucune donnée locale présente. Activez l'affichage des séries historiques Supabase si nécessaire.</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => setShowRemote(true)}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
              >Afficher les tendances cloud</button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (showRemote && availabilityData.length === 0 && mtbfData.length === 0 && mttrData.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            KPI Trends
          </CardTitle>
          <CardDescription>
            No KPI data available yet. Upload MTBF_MTTR.xlsx or KPI CSV to see trends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Upload your KPI data to visualize:</p>
            <ul className="text-sm mt-2 space-y-1">
              <li>• Availability % trends</li>
              <li>• MTBF (Mean Time Between Failures)</li>
              <li>• MTTR (Mean Time To Repair)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!localDataPresent && (
        <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950">
          <CardContent className="p-4 text-xs text-blue-900 dark:text-blue-200">
            Aucune donnée locale (IndexedDB) détectée. Les métriques ci-dessous proviennent uniquement de la base cloud Supabase et ne sont pas affectées par la suppression locale. Utilisez le bouton pour masquer/afficher.
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setShowRemote(!showRemote)}
                className="rounded bg-blue-600 px-2 py-1 text-white text-xs hover:bg-blue-700"
              >{showRemote ? 'Masquer' : 'Afficher'} les tendances cloud</button>
            </div>
          </CardContent>
        </Card>
      )}
      {!showRemote && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Affichage des données cloud désactivé.
          </CardContent>
        </Card>
      )}
      {showRemote && (
        <>
        {/* KPI Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
        {/* Availability */}
        {stats.availability && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Disponibilité</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats.availability.current * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stats.availability.trend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : stats.availability.trend === 'down' ? (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                ) : null}
                <span className={stats.availability.trend === 'up' ? 'text-green-600' : stats.availability.trend === 'down' ? 'text-red-600' : ''}>
                  {stats.availability.change > 0 ? '+' : ''}{stats.availability.change.toFixed(1)}%
                </span>
                {' '}vs mois précédent
              </p>
            </CardContent>
          </Card>
        )}

        {/* MTBF */}
        {stats.mtbf && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">MTBF</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.mtbf.current.toFixed(0)}h
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stats.mtbf.trend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : stats.mtbf.trend === 'down' ? (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                ) : null}
                <span className={stats.mtbf.trend === 'up' ? 'text-green-600' : stats.mtbf.trend === 'down' ? 'text-red-600' : ''}>
                  {stats.mtbf.change > 0 ? '+' : ''}{stats.mtbf.change.toFixed(1)}%
                </span>
                {' '}vs mois précédent
              </p>
            </CardContent>
          </Card>
        )}

        {/* MTTR */}
        {stats.mttr && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">MTTR</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.mttr.current.toFixed(1)}h
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stats.mttr.trend === 'down' ? (
                  <TrendingDown className="h-3 w-3 text-green-600" />
                ) : stats.mttr.trend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-red-600" />
                ) : null}
                <span className={stats.mttr.trend === 'down' ? 'text-green-600' : stats.mttr.trend === 'up' ? 'text-red-600' : ''}>
                  {stats.mttr.change > 0 ? '+' : ''}{stats.mttr.change.toFixed(1)}%
                </span>
                {' '}vs mois précédent (↓ = mieux)
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Availability Trend Chart */}
      {availabilityData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Évolution Disponibilité (%)</CardTitle>
            <CardDescription>
              Tendance mensuelle - Données réelles de asset_kpis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={availabilityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis 
                  domain={[0, 1]}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                />
                <Tooltip 
                  formatter={(value: any) => `${(value * 100).toFixed(1)}%`}
                  labelFormatter={(label) => `Période: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#10b981" 
                  fill="#10b98120" 
                  name="Disponibilité"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* MTBF & MTTR Combined Chart */}
      {(mtbfData.length > 0 || mttrData.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>MTBF & MTTR (heures)</CardTitle>
            <CardDescription>
              Comparaison des temps - Données réelles de asset_kpis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart 
                data={mtbfData.map((m, i) => ({
                  period: m.period,
                  mtbf: m.value,
                  mttr: mttrData[i]?.value || 0,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="mtbf" 
                  stroke="#3b82f6" 
                  name="MTBF (↑ = mieux)"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="mttr" 
                  stroke="#ef4444" 
                  name="MTTR (↓ = mieux)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Data Source Badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Source: Supabase asset_kpis</Badge>
        <Badge variant="outline">Synchro mensuelle</Badge>
        {!localDataPresent && <Badge variant="outline" className="border-blue-300">Mode cloud seul</Badge>}
      </div>
      </>
      )}
    </div>
  );
}
