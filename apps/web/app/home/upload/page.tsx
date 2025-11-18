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
  Loader2,
  RefreshCcw,
  Eye,
  Activity
} from 'lucide-react';
import { parseCsv, importWorkOrdersFromRows, importFailureModes, importAMDECFromWorkOrders, importParts, importPartDemand, clearAllLocalData } from '@kit/shared/localdb/import';
import { exportLocalDb, importLocalDb } from '@kit/shared/localdb/export';
import { recalcKpis } from '@kit/shared/localdb/kpi';
import { db } from '@kit/shared/localdb/schema';
import { useAssets, useWorkOrders, useAllFailureModes, useParts, usePartDemand, useKpis } from '@kit/shared/localdb/hooks';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface LocalImportStats {
  workOrders?: number;
  failureModes?: number;
  functions?: number;
  parts?: number;
  partDemand?: number;
  kpis?: number;
  assets?: number;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [stats, setStats] = useState<LocalImportStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [showDbViewer, setShowDbViewer] = useState(false);
  
  // Live DB stats
  const assets = useAssets();
  const workOrders = useWorkOrders();
  const failureModes = useAllFailureModes();
  const parts = useParts();
  const partDemand = usePartDemand();
  const kpis = useKpis();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      alert('Formats supportés: .csv, .xlsx, .xls');
      return;
    }
    setFile(selectedFile);
    setStatus('idle');
    setStats(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setProgress(0);
    setProgressMessage('Lecture du fichier…');
    setStats(null);
    try {
      let rows: string[][] = [];
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.csv')) {
        // Try UTF-8 first, then Windows-1252 if encoding issues detected
        let text = await file.text();
        
        // Check for encoding issues (replacement character � or weird accents)
        if (text.includes('�') || text.match(/Dur[^\w]e arr[^\w]t/)) {
          console.log('⚠️  UTF-8 encoding issue detected, trying Windows-1252...');
          try {
            const arrayBuffer = await file.arrayBuffer();
            const decoder = new TextDecoder('windows-1252');
            text = decoder.decode(arrayBuffer);
            console.log('✅ Successfully decoded with Windows-1252');
          } catch (e) {
            console.warn('Could not decode with Windows-1252, using UTF-8 with issues');
          }
        }
        
        // Auto-detect delimiter
        const firstLine = text.split(/\r?\n/)[0] || '';
        const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
        rows = parseCsv(text, delimiter);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Parse XLSX file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = xlsxRead(arrayBuffer, { type: 'array' });
        
        console.log('📊 XLSX Analysis - Total sheets:', workbook.SheetNames.length);
        console.log('📊 Sheet names:', workbook.SheetNames.join(', '));
        
        // Try to find a sheet with work order structure
        let bestSheet: any = null;
        let bestSheetName = '';
        let bestScore = 0;
        
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          
          const lowerName = sheetName.toLowerCase();
          console.log(`\n🔍 Analyzing sheet: "${sheetName}"`);
          
          // Skip obvious metadata sheets
          if (lowerName.includes('metadata') || lowerName.includes('info') || lowerName.includes('legend') || lowerName.includes('legende')) {
            console.log('  ⏭️  Skipped: Metadata sheet');
            continue;
          }
          
          // Convert to check structure
          const jsonData: any[][] = xlsxUtils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
          const nonEmptyRows = jsonData.filter(row => row.some(cell => String(cell || '').trim().length > 0));
          
          if (nonEmptyRows.length < 5) {
            console.log('  ⏭️  Skipped: Too few rows (<5)');
            continue;
          }
          
          // Score this sheet based on work order indicators
          let score = 0;
          let foundHeaderRow = false;
          
          // Check first 10 rows for work order headers
          for (let i = 0; i < Math.min(10, nonEmptyRows.length); i++) {
            const row = nonEmptyRows[i];
            if (!row) continue;
            
            const rowText = row.map(c => String(c || '').trim().toLowerCase()).join(' ');
            
            // Look for French work order column indicators
            if (rowText.includes('type de panne') || rowText.includes('type_panne')) score += 10;
            if (rowText.includes('durée') || rowText.includes('duree')) score += 10;
            if (rowText.includes('arrêt') || rowText.includes('arret')) score += 10;
            if (rowText.includes('date intervention') || rowText.includes('date_intervention')) score += 10;
            if (rowText.includes('désignation') || rowText.includes('designation')) score += 10;
            if (rowText.includes('résumé') || rowText.includes('resume')) score += 5;
            if (rowText.includes('technicien') || rowText.includes('operateur')) score += 5;
            if (rowText.includes('cause')) score += 5;
            if (rowText.includes('organe') || rowText.includes('composant')) score += 5;
            if (rowText.includes('pièce') || rowText.includes('piece')) score += 3;
            
            if (score >= 10) {
              foundHeaderRow = true;
              break;
            }
          }
          
          // Negative score for KPI summary sheets
          const firstRow = nonEmptyRows[0] || [];
          const firstRowText = firstRow.map(c => String(c || '').trim().toLowerCase()).join(' ');
          if (firstRowText.match(/^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i)) {
            score -= 50; // Strong penalty for month-based sheets
            console.log('  ⚠️  KPI summary detected (month headers)');
          }
          if (firstRowText.includes('dispo') && firstRowText.includes('mtbf')) {
            score -= 30;
            console.log('  ⚠️  KPI summary detected (dispo/mtbf)');
          }
          
          console.log(`  📊 Score: ${score} (header found: ${foundHeaderRow})`);
          
          if (score > bestScore) {
            bestScore = score;
            bestSheet = sheet;
            bestSheetName = sheetName;
          }
        }
        
        if (!bestSheet || bestScore < 10) {
          const sheetList = workbook.SheetNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
          
          // Check if this is a KPI/availability tracking file
          const isAvailabilityFile = workbook.SheetNames.some(name => 
            name.match(/^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i)
          ) && workbook.SheetNames.length > 5;
          
          if (isAvailabilityFile) {
            throw new Error(
              `📊 Ce fichier contient des données de disponibilité/KPIs, pas des interventions.\n\n` +
              `Feuilles détectées: ${workbook.SheetNames.length} feuilles mensuelles (${workbook.SheetNames.slice(0, 3).join(', ')}...)\n\n` +
              `✅ Format détecté:\n` +
              `• Suivi journalier de disponibilité par machine\n` +
              `• Données d'arrêt (Arrêt Subi, Arrêt Prog, Prev niv 1)\n` +
              `• Heures de production par jour\n\n` +
              `❌ Ce qui manque:\n` +
              `Ce fichier ne contient pas l'historique des interventions détaillées.\n\n` +
              `💡 Import supporté:\n` +
              `Utilisez des fichiers CSV/XLSX avec les colonnes:\n` +
              `• Type de panne\n` +
              `• Durée arrêt (h)\n` +
              `• Date intervention\n` +
              `• Désignation (équipement)\n` +
              `• Résultat / Description\n\n` +
              `📄 Fichiers déjà importés avec succès:\n` +
              `• GMAO_Integrator.csv (9,349 interventions)\n` +
              `• Workload.csv (3,169 interventions)`
            );
          }
          
          throw new Error(
            `❌ Aucune feuille de données brutes trouvée.\n\n` +
            `Feuilles disponibles:\n${sheetList}\n\n` +
            `Le système recherche des colonnes comme:\n` +
            `• Type de panne\n` +
            `• Durée arrêt\n` +
            `• Date intervention\n` +
            `• Désignation\n\n` +
            `💡 Astuce: Utilisez la feuille avec les interventions détaillées, pas les résumés KPIs.`
          );
        }
        
        console.log(`\n✅ Selected sheet: "${bestSheetName}" (score: ${bestScore})`);
        
        // Convert to array of arrays (rows of strings)
        const jsonData: any[][] = xlsxUtils.sheet_to_json(bestSheet, { header: 1, raw: false, defval: '' });
        
        // Filter out completely empty rows and find the actual header row
        const nonEmptyRows = jsonData.filter(row => row.some(cell => String(cell || '').trim().length > 0));
        
        // Find first row that looks like headers (has multiple non-empty cells and no purely numeric first cell)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(10, nonEmptyRows.length); i++) {
          const row = nonEmptyRows[i];
          if (!row) continue;
          const nonEmpty = row.filter(c => String(c || '').trim().length > 0);
          // Good header row should have multiple columns and text-like content
          if (nonEmpty.length >= 3) {
            const firstCell = String(row[0] || '').trim().toLowerCase();
            const secondCell = String(row[1] || '').trim().toLowerCase();
            
            // Skip month rows (Avril, Mai, etc.) or metadata rows
            const isMonthRow = firstCell.match(/^(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|jan|fév|feb|mar|avr|apr|mai|may|jun|jui|juil|jul|aoû|aou|aug|sep|oct|nov|déc|dec)$/i);
            const isMetricRow = firstCell.match(/^(dispo|disponibilité|disponibilite|taux|mtbf|mttr|oee)$/i);
            const isPercentageRow = nonEmpty.every(c => String(c).includes('%'));
            
            // Skip rows that start with dates, numbers, months, or metrics
            if (!firstCell.match(/^\d+$/) && 
                !firstCell.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/) &&
                !isMonthRow &&
                !isMetricRow &&
                !isPercentageRow) {
              // Check if this looks like a real data header
              const hasDataColumns = secondCell && !secondCell.match(/^\d+\.?\d*%?$/);
              if (hasDataColumns || nonEmpty.length >= 5) {
                headerRowIndex = i;
                console.log('Found header row at index:', i, 'with cells:', row.slice(0, 5));
                break;
              }
            }
          }
        }
        
        // If we couldn't find a good header, check if this is a KPI summary sheet
        if (headerRowIndex === 0 && nonEmptyRows.length > 0) {
          const firstRow = nonEmptyRows[0];
          const firstCell = String(firstRow?.[0] || '').trim().toLowerCase();
          const isKpiSheet = firstCell.match(/^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|jan|fév|mar|avr|mai|jun|juil|aoû|sep|oct|nov|déc|dispo|mtbf|mttr)$/i);
          
          if (isKpiSheet) {
            throw new Error(
              `📊 Feuille détectée: Résumé KPIs (${firstCell}).\n\n` +
              `Cette feuille contient des KPIs agrégés, pas des données brutes.\n\n` +
              `Pour importer dans le système:\n` +
              `• Utilisez la feuille avec les interventions détaillées\n` +
              `• Ou importez des CSVs avec colonnes: date, équipement, type panne, durée arrêt, etc.`
            );
          }
        }
        
        rows = nonEmptyRows.slice(headerRowIndex);
        console.log('Extracted', rows.length, 'rows from XLSX, starting from row', headerRowIndex);
      }
      
      if (!rows.length || rows.length < 2) throw new Error('Fichier vide ou pas assez de lignes');
      setProgress(30);
      setProgressMessage('Détection du type…');
      const headers = rows[0]!.map(h => String(h || '').trim()).filter(h => h.length > 0);
      const lower = headers.map(h => h.toLowerCase());
      const dataRows = rows.slice(1).filter(r => r.some(c => String(c || '').trim().length > 0)); // Skip empty rows
      
      console.log('Headers detected:', headers);
      console.log('Headers count:', headers.length);
      console.log('Sample data row:', dataRows[0]);
      console.log('Data rows count:', dataRows.length);
      
      if (headers.length === 0) {
        throw new Error('Aucune colonne détectée. Le fichier est peut-être vide ou mal formaté.');
      }
      
      // Log full structure for debugging
      console.log('Full headers array:', JSON.stringify(headers));
      console.log('First 3 data rows:', JSON.stringify(dataRows.slice(0, 3)));
      
      // Improved heuristics with more flexible matching for French maintenance data
      const hasWorkOrders = lower.some(h => 
        h.includes('start_at') || h.includes('debut') || h.includes('date_debut') ||
        h.includes('date intervention') || h.includes('date_intervention') ||
        h.includes('downtime') || h.includes('arret') || h.includes('durée') || h.includes('duree') ||
        h.includes('type de panne') || h.includes('type_panne') ||
        h.includes('résumé intervention') || h.includes('resume') ||
        h.includes('désignation') || h.includes('designation')
      );
      
      // Detect AMDEC CSV format (work orders WITH Organe and Cause columns for rich analysis)
      const hasAMDECFormat = lower.some(h => h.includes('organe') || h.includes('component'))
        && lower.some(h => h.includes('cause') || h.includes('root_cause'))
        && hasWorkOrders; // Must also have work order columns
      
      const hasFailureModes = (
        lower.some(h => h.includes('severity') || h.includes('severite') || h.includes('gravite') || h.includes('criticité') || h.includes('criticite'))
        && lower.some(h => h.includes('occurrence') || h.includes('freq') || h.includes('probabilité') || h.includes('probabilite'))
      ) || (
        lower.some(h => h.includes('mode') || h.includes('defaillance') || h.includes('défaillance'))
        && lower.some(h => h.includes('fonction') || h.includes('function'))
      );
      const hasParts = lower.some(h => 
        h.includes('safety_stock') || h.includes('stock_securite') || h.includes('stock_sécurité') ||
        h.includes('reorder_point') || h.includes('point_reappro') ||
        h.includes('pièce') || h.includes('piece') && h.includes('stock')
      );
      const hasDemand = lower.some(h => h.includes('period') || h.includes('periode') || h.includes('période')) 
        && lower.some(h => h.includes('usage') || h.includes('consommation') || h.includes('demande'));
      
      const localStats: LocalImportStats = {};
      setProgress(55);
      setProgressMessage('Import vers IndexedDB…');
      
      console.log('Detection results:', { hasWorkOrders, hasAMDECFormat, hasFailureModes, hasParts, hasDemand });
      
      if (hasAMDECFormat) {
        // Import AMDEC format: Work orders + rich failure analysis (Organe, Cause)
        console.log('🔍 AMDEC format detected! Importing work orders + creating AMDEC analysis...');
        await importWorkOrdersFromRows(headers, dataRows);
        const amdecResult = await importAMDECFromWorkOrders(headers, dataRows);
        localStats.workOrders = dataRows.length;
        localStats.failureModes = amdecResult.failureModesCreated;
        localStats.functions = amdecResult.functionsCreated;
        console.log(`✅ Created ${amdecResult.functionsCreated} functions and ${amdecResult.failureModesCreated} failure modes from AMDEC data`);
      } else if (hasWorkOrders) {
        await importWorkOrdersFromRows(headers, dataRows);
        localStats.workOrders = dataRows.length;
      } else if (hasFailureModes) {
        await importFailureModes(headers, dataRows);
        localStats.failureModes = dataRows.length;
      } else if (hasParts) {
        await importParts(headers, dataRows);
        localStats.parts = dataRows.length;
      } else if (hasDemand) {
        await importPartDemand(headers, dataRows);
        localStats.partDemand = dataRows.length;
      } else {
        // Default to work orders if it looks like maintenance data
        const looksLikeMaintenance = lower.some(h => 
          h.includes('panne') || h.includes('intervention') || h.includes('equipement') || 
          h.includes('machine') || h.includes('designation') || h.includes('désignation') ||
          h.includes('date') || h.includes('technicien') || h.includes('coût') || h.includes('cout')
        );
        
        if (looksLikeMaintenance) {
          console.log('Defaulting to work orders import for maintenance-like data');
          await importWorkOrdersFromRows(headers, dataRows);
          localStats.workOrders = dataRows.length;
        } else {
          const detectedHeaders = headers.slice(0, 10).join(', ');
          const moreHeaders = headers.length > 10 ? ` (+${headers.length - 10} autres)` : '';
          throw new Error(
            `Type non reconnu. ${headers.length} colonnes détectées: ${detectedHeaders}${moreHeaders}.\n\n` +
            `Formats supportés: Interventions (date, durée arrêt, type panne), AMDEC (sévérité, occurrence, détection), PDR (stock, demande).`
          );
        }
      }
      
      setProgress(80);
      setProgressMessage('Recalcul des KPIs…');
      await recalcKpis();
      localStats.kpis = await db.kpis.count();
      localStats.assets = await db.assets.count();
      setProgress(100);
      setProgressMessage('Terminé');
      setStats(localStats);
      setStatus('success');
    } catch (e:any) {
      console.error('Import error:', e);
      setStatus('error');
      setProgressMessage(e.message || 'Erreur inconnue');
    }
  };  const handleClearLocal = async () => {
    await clearAllLocalData();
    setStats(null);
    alert('Base locale vidée');
  };

  const handleExport = async () => {
    const blob = await exportLocalDb();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gmao_local_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    await importLocalDb(text);
    alert('Backup restauré');
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
          Importez vos données de maintenance depuis un fichier Excel ou CSV pour alimenter le Dashboard, AMDEC et PDR.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Upload Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-500" />
              Importer des Données (Excel / CSV)
            </CardTitle>
            <CardDescription>
              Formats acceptés: .xlsx, .xls, .csv. Les colonnes sont détectées automatiquement (pas besoin d'un template strict).
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
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Formats acceptés: .xlsx, .xls, .csv (max 10MB)
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
            {status === 'success' && stats && (
              <div className="rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-900 dark:text-green-100">✅ Import local réussi</p>
                    <p className="mt-1 text-sm text-green-700 dark:text-green-300">Données stockées dans IndexedDB (isolées par navigateur).</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {stats.assets && <Badge variant="outline" className="bg-white">Assets: {stats.assets}</Badge>}
                      {stats.workOrders && <Badge variant="outline" className="bg-white">Work Orders: {stats.workOrders}</Badge>}
                      {stats.functions && <Badge variant="outline" className="bg-white">Fonctions: {stats.functions}</Badge>}
                      {stats.failureModes && <Badge variant="outline" className="bg-white">Failure Modes: {stats.failureModes}</Badge>}
                      {stats.parts && <Badge variant="outline" className="bg-white">Pièces: {stats.parts}</Badge>}
                      {stats.partDemand && <Badge variant="outline" className="bg-white">Demandes: {stats.partDemand}</Badge>}
                      {stats.kpis != null && <Badge variant="outline" className="bg-white col-span-2">Total KPIs: {stats.kpis}</Badge>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={handleClearLocal} className="gap-2"><RefreshCcw className="h-4 w-4" /> Vider DB</Button>
                      <Button size="sm" variant="outline" onClick={handleExport} className="gap-2"><Download className="h-4 w-4" /> Export JSON</Button>
                      <div className="relative">
                        <input type="file" accept="application/json" onChange={handleImportBackup} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <Button size="sm" variant="outline" className="gap-2 pointer-events-none"><Upload className="h-4 w-4" /> Import JSON</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="rounded-lg border border-red-500 bg-red-50 p-4 dark:bg-red-950">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900 dark:text-red-100">❌ Erreur d'import local</p>
                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">{progressMessage}</p>
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">Vérifiez la console (F12) pour plus de détails.</p>
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
                Les données seront traitées et les KPIs automatiquement recalculés. Le dashboard sera mis à jour en temps réel.
              </p>
            </div>

            <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs text-blue-900 dark:text-blue-100">
                💡 <strong>Automatique:</strong> KPIs (MTBF, MTTR, Disponibilité) calculés instantanément après import!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Summary Dashboard */}
      <Card className="border-2 border-blue-500">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                Données Importées - Aperçu
              </CardTitle>
              <CardDescription className="mt-1">
                Visualisation des données actuellement en mémoire locale
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white text-lg font-bold">
              {(assets?.length || 0) + (workOrders?.length || 0) + (failureModes?.length || 0) + (parts?.length || 0) + (partDemand?.length || 0) + (kpis?.length || 0)} enregistrements
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Work Orders Card */}
            <Card className={`border-l-4 ${workOrders && workOrders.length > 0 ? 'border-l-green-500 bg-green-50 dark:bg-green-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Work Orders</p>
                    <p className="text-3xl font-bold mt-1">{workOrders?.length || 0}</p>
                    {workOrders && workOrders.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• Types: {new Set(workOrders.map(w => w.type)).size} différents</p>
                        <p>• Techniciens: {new Set(workOrders.map((w: any) => w.assignee).filter(Boolean)).size}</p>
                        <p>• Équipements: {new Set(workOrders.map((w: any) => w.assetCode || w.asset_code).filter(Boolean)).size}</p>
                      </div>
                    )}
                  </div>
                  <FileSpreadsheet className={`h-8 w-8 ${workOrders && workOrders.length > 0 ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                {workOrders && workOrders.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-green-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Données disponibles
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Aucune donnée
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* KPIs Card */}
            <Card className={`border-l-4 ${kpis && kpis.length > 0 ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">KPIs Calculés</p>
                    <p className="text-3xl font-bold mt-1">{kpis?.length || 0}</p>
                    {kpis && kpis.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• MTBF: {kpis.filter(k => k.metricType === 'mtbf').length}</p>
                        <p>• MTTR: {kpis.filter(k => k.metricType === 'mttr').length}</p>
                        <p>• Disponibilité: {kpis.filter(k => k.metricType === 'availability').length}</p>
                      </div>
                    )}
                  </div>
                  <TrendingUp className={`h-8 w-8 ${kpis && kpis.length > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                </div>
                {kpis && kpis.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-blue-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Dashboard prêt
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Aucun KPI
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Assets Card */}
            <Card className={`border-l-4 ${assets && assets.length > 0 ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Équipements</p>
                    <p className="text-3xl font-bold mt-1">{assets?.length || 0}</p>
                    {assets && assets.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• Auto-créés depuis work orders</p>
                        <p>• Codes uniques extraits</p>
                      </div>
                    )}
                  </div>
                  <Activity className={`h-8 w-8 ${assets && assets.length > 0 ? 'text-purple-600' : 'text-gray-400'}`} />
                </div>
                {assets && assets.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-purple-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Catalogués
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Aucun équipement
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* AMDEC Card */}
            <Card className={`border-l-4 ${failureModes && failureModes.length > 0 ? 'border-l-orange-500 bg-orange-50 dark:bg-orange-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">AMDEC (Failure Modes)</p>
                    <p className="text-3xl font-bold mt-1">{failureModes?.length || 0}</p>
                    {failureModes && failureModes.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• Modes de défaillance</p>
                        <p>• RPN calculables</p>
                      </div>
                    )}
                  </div>
                  <AlertCircle className={`h-8 w-8 ${failureModes && failureModes.length > 0 ? 'text-orange-600' : 'text-gray-400'}`} />
                </div>
                {failureModes && failureModes.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-orange-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    AMDEC dispo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Importer AMDEC
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* PDR Parts Card */}
            <Card className={`border-l-4 ${parts && parts.length > 0 ? 'border-l-pink-500 bg-pink-50 dark:bg-pink-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pièces (PDR)</p>
                    <p className="text-3xl font-bold mt-1">{parts?.length || 0}</p>
                    {parts && parts.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• Stock disponible</p>
                        <p>• Réapprovisionnement</p>
                      </div>
                    )}
                  </div>
                  <Database className={`h-8 w-8 ${parts && parts.length > 0 ? 'text-pink-600' : 'text-gray-400'}`} />
                </div>
                {parts && parts.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-pink-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    PDR prêt
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Importer stock
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Part Demand Card */}
            <Card className={`border-l-4 ${partDemand && partDemand.length > 0 ? 'border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-l-gray-300'}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Demandes Pièces</p>
                    <p className="text-3xl font-bold mt-1">{partDemand?.length || 0}</p>
                    {partDemand && partDemand.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>• Prévisions usage</p>
                        <p>• Analyse demande</p>
                      </div>
                    )}
                  </div>
                  <RefreshCcw className={`h-8 w-8 ${partDemand && partDemand.length > 0 ? 'text-indigo-600' : 'text-gray-400'}`} />
                </div>
                {partDemand && partDemand.length > 0 ? (
                  <Badge className="mt-3 w-full justify-center bg-indigo-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Prévisions OK
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-3 w-full justify-center">
                    Aucune demande
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button 
              onClick={handleExport} 
              variant="outline" 
              size="sm" 
              className="gap-2"
              disabled={!workOrders || workOrders.length === 0}
            >
              <Download className="h-4 w-4" />
              Exporter tout (JSON)
            </Button>
            <Button 
              onClick={handleClearLocal} 
              variant="destructive" 
              size="sm" 
              className="gap-2"
              disabled={!workOrders || workOrders.length === 0}
            >
              <RefreshCcw className="h-4 w-4" />
              Vider la base locale
            </Button>
            <div className="relative">
              <input 
                type="file" 
                accept="application/json" 
                onChange={handleImportBackup} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 pointer-events-none"
              >
                <Upload className="h-4 w-4" />
                Importer backup JSON
              </Button>
            </div>
          </div>

          {/* Status Summary */}
          {workOrders && workOrders.length > 0 && (
            <div className="mt-6 rounded-lg bg-green-50 border border-green-200 p-4 dark:bg-green-950 dark:border-green-800">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">
                    ✅ Base de données locale prête
                  </p>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    Vous avez {workOrders.length} work orders et {kpis?.length || 0} KPIs calculés. Le dashboard affiche vos données réelles.
                  </p>
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                    💡 <strong>Astuce:</strong> Pour éviter les doublons, vérifiez ce résumé avant d'importer de nouveaux fichiers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(!workOrders || workOrders.length === 0) && (
            <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4 dark:bg-blue-950 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900 dark:text-blue-100">
                    📥 Prêt pour l'import
                  </p>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                    Commencez par importer vos work orders (interventions) pour alimenter le dashboard.
                  </p>
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    Formats supportés: GMAO_Integrator.csv, workload.csv, ou tout Excel/CSV avec colonnes maintenance.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Flow Diagram */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" />
              <CardTitle>IndexedDB Live Viewer</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDbViewer(!showDbViewer)} className="gap-2">
              <Eye className="h-4 w-4" />
              {showDbViewer ? 'Masquer' : 'Afficher'}
            </Button>
          </div>
          <CardDescription>
            Base de données locale (isolation par navigateur)
          </CardDescription>
        </CardHeader>
        {showDbViewer && (
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Assets</p>
                  <p className="text-2xl font-bold text-blue-600">{assets?.length || 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Work Orders</p>
                  <p className="text-2xl font-bold text-green-600">{workOrders?.length || 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Failure Modes</p>
                  <p className="text-2xl font-bold text-orange-600">{failureModes?.length || 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Parts</p>
                  <p className="text-2xl font-bold text-purple-600">{parts?.length || 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Part Demand</p>
                  <p className="text-2xl font-bold text-pink-600">{partDemand?.length || 0}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">KPIs</p>
                  <p className="text-2xl font-bold text-indigo-600">{kpis?.length || 0}</p>
                </div>
              </div>
              
              <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
                <p className="text-xs text-blue-900 dark:text-blue-100">
                  💡 <strong>DevTools (F12):</strong> Application → Storage → IndexedDB → gmao-local-db
                </p>
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  Vous pouvez inspecter toutes les tables et leurs données en temps réel.
                </p>
              </div>
              
              {workOrders && workOrders.length > 0 && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer font-semibold text-sm">Sample Work Order (1er)</summary>
                  <pre className="mt-2 text-xs overflow-auto bg-gray-100 dark:bg-gray-900 p-2 rounded">
                    {JSON.stringify(workOrders[0], null, 2)}
                  </pre>
                </details>
              )}
              
              {failureModes && failureModes.length > 0 && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer font-semibold text-sm">Sample Failure Mode (1er)</summary>
                  <pre className="mt-2 text-xs overflow-auto bg-gray-100 dark:bg-gray-900 p-2 rounded">
                    {JSON.stringify(failureModes[0], null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </CardContent>
        )}
      </Card>

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
              <strong>Workflow Local-First:</strong> CSV/Excel → Parse client-side → IndexedDB → <strong className="text-blue-600 dark:text-blue-400">Auto-calcul KPIs</strong> → Dashboard mis à jour
            </p>
            <p className="mt-2 text-xs text-purple-700 dark:text-purple-300">
              ✨ Nouveau: Données isolées par navigateur, pas de serveur nécessaire!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
