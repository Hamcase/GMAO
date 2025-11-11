'use client';

import { useState } from 'react';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Progress } from '@kit/ui/progress';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Database,
  TrendingUp,
  Download,
  Loader2
} from 'lucide-react';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    assets_created: number;
    technicians_created: number;
    work_orders_created: number;
    parts_used: number;
  };
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        alert('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)');
        return;
      }
      setFile(selectedFile);
      setStatus('idle');
      setResponse(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setProgress(0);
    setProgressMessage('Téléchargement du fichier...');

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev; // Stop at 90% until we get response
        return prev + 10;
      });
    }, 300);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgressMessage('Lecture du fichier Excel...');
      
      const res = await fetch('/api/upload-maintenance', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgressMessage('Traitement des données...');
      setProgress(95);

      const data: UploadResponse = await res.json();
      
      setProgress(100);
      setProgressMessage('Terminé !');

      if (res.ok && data.success) {
        setStatus('success');
        setResponse(data);
      } else {
        setStatus('error');
        setResponse(data);
      }
    } catch (error) {
      clearInterval(progressInterval);
      setStatus('error');
      setProgress(0);
      setResponse({
        success: false,
        message: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      });
    }
  };

  const downloadTemplate = () => {
    // This would ideally download a template from /public or generate one
    alert('Téléchargement du template Excel (à implémenter)');
  };

  return (
    <div className="flex flex-col space-y-6 pb-36">
      <AppBreadcrumbs values={{ Upload: '' }} />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Upload Maintenance Data</h1>
        <p className="mt-2 text-muted-foreground">
          Importez vos données de maintenance depuis un fichier Excel pour alimenter le Dashboard, AMDEC et PDR.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Upload Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-500" />
              Importer Données Excel
            </CardTitle>
            <CardDescription>
              Format attendu: colonnes asset_code, wo_code, start_at, end_at, type, cause_text, technician, part_sku, quantity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Input */}
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-blue-500">
              <Upload className="mb-4 h-12 w-12 text-gray-400" />
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Cliquez pour sélectionner un fichier
                </span>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Formats acceptés: .xlsx, .xls (max 10MB)
              </p>
            </div>

            {/* Selected File */}
            {file && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-md border p-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleUpload}
                    disabled={status === 'uploading'}
                    className="gap-2"
                  >
                    {status === 'uploading' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importation...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4" />
                        Importer
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress Bar */}
                {status === 'uploading' && (
                  <div className="space-y-2 rounded-lg border border-blue-500 bg-blue-50 p-4 dark:bg-blue-950">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-blue-900 dark:text-blue-100">
                        {progressMessage}
                      </span>
                      <span className="text-blue-700 dark:text-blue-300">
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Traitement en cours, veuillez patienter...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status Messages */}
            {status === 'success' && response && (
              <div className="rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-900 dark:text-green-100">
                      ✅ Import réussi !
                    </p>
                    <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                      {response.message}
                    </p>
                    {response.data && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <Badge variant="outline" className="bg-white">
                            Assets: {response.data.assets_created}
                          </Badge>
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-white">
                            Techniciens: {response.data.technicians_created}
                          </Badge>
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-white">
                            Ordres de travail: {response.data.work_orders_created}
                          </Badge>
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-white">
                            Pièces utilisées: {response.data.parts_used}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && response && (
              <div className="rounded-lg border border-red-500 bg-red-50 p-4 dark:bg-red-950">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900 dark:text-red-100">
                      ❌ Erreur d'import
                    </p>
                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                      {response.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="mb-2 font-semibold">1. Télécharger le template</h4>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Template Excel
              </Button>
            </div>

            <div>
              <h4 className="mb-2 font-semibold">2. Remplir les données</h4>
              <p className="text-xs text-muted-foreground">
                Incluez les colonnes: asset_code, wo_code, start_at, end_at, type, technician, etc.
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-semibold">3. Importer le fichier</h4>
              <p className="text-xs text-muted-foreground">
                Les données seront traitées et les KPIs automatiquement recalculés.
              </p>
            </div>

            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-900 dark:text-blue-100">
                💡 <strong>Astuce:</strong> L'import est incrémental. Vous pouvez importer plusieurs fichiers successivement.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-purple-500" />
            Pipeline de Données
          </CardTitle>
          <CardDescription>
            Comprendre le flux de traitement des données
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 overflow-x-auto">
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
                <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="mt-2 text-xs font-medium">Excel Upload</p>
            </div>

            <div className="h-0.5 w-12 bg-gray-300" />

            <div className="flex flex-col items-center">
              <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900">
                <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="mt-2 text-xs font-medium">Python ETL</p>
            </div>

            <div className="h-0.5 w-12 bg-gray-300" />

            <div className="flex flex-col items-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
                <Database className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="mt-2 text-xs font-medium">Supabase</p>
            </div>

            <div className="h-0.5 w-12 bg-gray-300" />

            <div className="flex flex-col items-center">
              <div className="rounded-full bg-orange-100 p-3 dark:bg-orange-900">
                <TrendingUp className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="mt-2 text-xs font-medium">Dashboard/AMDEC/PDR</p>
            </div>
          </div>

          <div className="mt-4 rounded-md bg-purple-50 p-3 dark:bg-purple-950">
            <p className="text-xs text-purple-900 dark:text-purple-100">
              <strong>Flow:</strong> Excel → Next.js API → Python ETL → Supabase Tables → Computed Views → Frontend Queries
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
