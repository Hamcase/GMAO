'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, ComposedChart } from 'recharts';
import { Radar } from 'lucide-react';

export function VisualizationsTab({
  amdecRawData,
  filterMachine,
}: {
  amdecRawData: any[];
  filterMachine: string;
}) {
  const filteredData = filterMachine === 'all' 
    ? amdecRawData 
    : amdecRawData.filter((r: any) => r.machine === filterMachine);

  // Top 10 failure types by frequency
  const failuresByType = useMemo(() => {
    const counts = new Map<string, number>();
    filteredData.forEach((r: any) => {
      if (r.failureType) {
        counts.set(r.failureType, (counts.get(r.failureType) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  // Downtime by component (top 10)
  const downtimeByComponent = useMemo(() => {
    const downtime = new Map<string, number>();
    filteredData.forEach((r: any) => {
      if (r.component && r.downtimeDuration) {
        downtime.set(r.component, (downtime.get(r.component) || 0) + r.downtimeDuration);
      }
    });
    return Array.from(downtime.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }));
  }, [filteredData]);

  // Cost by component (top 10)
  const costByComponent = useMemo(() => {
    const costs = new Map<string, number>();
    filteredData.forEach((r: any) => {
      if (r.component && r.materialCost) {
        costs.set(r.component, (costs.get(r.component) || 0) + r.materialCost);
      }
    });
    return Array.from(costs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filteredData]);

  // Pareto analysis: cumulative percentage of failures
  const paretoData = useMemo(() => {
    const sorted = [...failuresByType];
    const total = sorted.reduce((sum, item) => sum + item.value, 0);
    let cumulative = 0;
    return sorted.map(item => {
      cumulative += item.value;
      return {
        name: item.name,
        count: item.value,
        cumulative: Math.round((cumulative / total) * 100),
      };
    });
  }, [failuresByType]);

  // Time series: failures per month (if dates available)
  const timeSeriesData = useMemo(() => {
    const byMonth = new Map<string, number>();
    filteredData.forEach((r: any) => {
      if (r.interventionDate && r.interventionDate instanceof Date && !isNaN(r.interventionDate.getTime())) {
        const month = `${r.interventionDate.getFullYear()}-${String(r.interventionDate.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(month, (byMonth.get(month) || 0) + 1);
      }
    });
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, count }));
  }, [filteredData]);

  // Failure type distribution (pie chart)
  const failureDistribution = useMemo(() => {
    return failuresByType.slice(0, 6); // Top 6 for pie chart
  }, [failuresByType]);

  const COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0891b2'];

  if (!filteredData.length) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Radar className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              Aucune donnée à visualiser. Importez un CSV d'abord.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pareto Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-teal-600" />
            Diagramme de Pareto
          </CardTitle>
          <CardDescription>Analyse 80/20 des types de pannes (cumul %)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={paretoData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} fontSize={11} />
              <YAxis yAxisId="left" label={{ value: 'Occurrences', angle: -90, position: 'insideLeft', fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: '% Cumulé', angle: 90, position: 'insideRight', fontSize: 12 }} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="count" fill="#06b6d4" name="Occurrences" />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#ef4444" strokeWidth={3} name="% Cumulé" dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Failure Types Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 types de pannes</CardTitle>
            <CardDescription>Par fréquence d'occurrence</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={failuresByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Failure Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition des pannes</CardTitle>
            <CardDescription>Top 6 types de défaillances</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={failureDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name.substring(0, 15)}: ${(percent * 100).toFixed(0)}%`}
                  fontSize={11}
                >
                  {failureDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Downtime by Component */}
        <Card>
          <CardHeader>
            <CardTitle>Arrêts par composant</CardTitle>
            <CardDescription>Temps d'arrêt cumulé (heures)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={downtimeByComponent} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" name="Heures" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cost by Component */}
        <Card>
          <CardHeader>
            <CardTitle>Coûts par composant</CardTitle>
            <CardDescription>Coût matériel cumulé (€)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costByComponent} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" fill="#ef4444" name="Coût (€)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Time Series */}
      {timeSeriesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Évolution temporelle des pannes</CardTitle>
            <CardDescription>Nombre de pannes par mois</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2} name="Pannes" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
