'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Database, CheckCircle2, Activity, AlertTriangle, BarChart3 } from 'lucide-react';

interface ETLJob {
  id: number;
  run_id: string;
  name: string;
  status: 'success' | 'running' | 'failed';
  started_at: string;
  duration: string;
}

const mockJobs: ETLJob[] = [
  { 
    id: 1, 
    run_id: 'ETL-2024-001', 
    name: 'MTBF Calculation', 
    status: 'success', 
    started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), 
    duration: '1.2s' 
  },
  { 
    id: 2, 
    run_id: 'ETL-2024-002', 
    name: 'MTTR Analytics', 
    status: 'success', 
    started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), 
    duration: '0.8s' 
  },
  { 
    id: 3, 
    run_id: 'ETL-2024-003', 
    name: 'Availability ETL', 
    status: 'running', 
    started_at: new Date().toISOString(), 
    duration: '-' 
  },
  { 
    id: 4, 
    run_id: 'ETL-2024-004', 
    name: 'Workload Sync', 
    status: 'success', 
    started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), 
    duration: '2.1s' 
  },
];

export function ETLJobsTable() {
  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = Date.now();
    const diff = Math.floor((now - date.getTime()) / 1000 / 60);
    
    if (diff < 1) return 'À l\'instant';
    if (diff < 60) return `${diff} min ago`;
    return date.toLocaleString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-500" />
          Jobs ETL & Analytics
        </CardTitle>
        <CardDescription>
          Pipelines de données pour calculs MTBF/MTTR, disponibilité et workload
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="pb-3 text-left text-sm font-semibold">Run ID</th>
                <th className="pb-3 text-left text-sm font-semibold">Job Name</th>
                <th className="pb-3 text-left text-sm font-semibold">Started At</th>
                <th className="pb-3 text-left text-sm font-semibold">Duration</th>
                <th className="pb-3 text-left text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockJobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0">
                  <td className="py-3 font-mono text-xs">{job.run_id}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {job.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {job.status === 'running' && <Activity className="h-4 w-4 animate-pulse text-blue-500" />}
                      {job.status === 'failed' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      {job.name}
                    </div>
                  </td>
                  <td className="py-3 text-sm text-muted-foreground">
                    {formatTimestamp(job.started_at)}
                  </td>
                  <td className="py-3">{job.duration}</td>
                  <td className="py-3">
                    <Badge
                      variant={
                        job.status === 'success'
                          ? 'default'
                          : job.status === 'running'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {job.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Données actualisées toutes les 5 minutes • Prochaine mise à jour dans 2 min
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
