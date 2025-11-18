'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { db, type AMDECRawData } from '@kit/shared/localdb/schema';
// @ts-ignore: Local minimal type shim if external types not resolved
import * as Papa from 'papaparse';
// Minimal fallback types (will be overridden if @types/papaparse resolves correctly)
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Papa {
  interface ParseError { message: string }
  interface ParseMeta { fields?: string[] }
  interface ParseResult<T> { data: T[]; meta: ParseMeta; errors: ParseError[] }
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    complete?: (results: ParseResult<any>) => void;
    error?: (error: ParseError) => void;
  }
  function parse(input: string | File, config: ParseConfig): void;
}
import { v4 as uuidv4 } from 'uuid';

interface ImportSummary {
  total: number;
  machines: number;
  components: number;
  failureTypes: number;
  sample: AMDECRawData[];
}

// French column name patterns for intelligent mapping (refined & expanded)
const COLUMN_PATTERNS: Record<keyof Omit<AMDECRawData, 'id' | 'customColumns'>, RegExp[]> = {
  machine: [/^machine$/i, /équipement/i, /asset/i, /code.?machine/i, /^d[eé]signation$/i, /nom.?machine/i],
  component: [/^organe$/i, /organe/i, /composant/i, /component/i, /sous.?ensemble/i],
  failureType: [/^type.?de.?panne$/i, /type.?panne/i, /mode.?de.?d[eé]faillance/i, /panne$/i, /failure.?type/i],
  cause: [/^cause$/i, /origine/i, /root.?cause/i],
  partDesignation: [/^pi[eèê]ce.*d[eé]sign/i, /d[eé]signation/i, /designation/i, /part.?name/i],
  partReference: [/^pi[eèê]ce.*r[eé]f/i, /r[eé]f[ée]rence/i, /ref$/i],
  partQuantity: [/^pi[eèê]ce.*quant/i, /^quantit[eé]$/i, /qte/i, /^qty$/i],
  downtimeDuration: [
    /dur[eé\uFFFD]e?\s*(totale)?\s*d'?arr[eé\uFFFD]t/i,
    /dur[eé\uFFFD]e.*arr[eé\uFFFD]t/i,
    /temps.*arr[eé\uFFFD]t/i,
    /temps\s*d'?arr[eé\uFFFD]t/i,
    /arr[eé\uFFFD]t.*\(h\)/i,
    /downtime/i,
  ],
  materialCost: [/co[uû]t.?mat[ée]riel/i, /co[uû]t/i, /cost/i, /prix/i, /montant/i],
  interventionDate: [/^date(?!.*demande)/i, /date.?intervention/i, /intervention.?date/i, /timestamp/i],
};

export function AMDECUpload({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Attempt to fix common mojibake / encoding issues from ISO-8859-1 to UTF-8
  const fixEncoding = (value: any): string => {
    if (typeof value !== 'string') return value as string;
    let v = value
      .replace(/Ã©/g, 'é')
      .replace(/Ã¨/g, 'è')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã«/g, 'ë')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã»/g, 'û')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã¢/g, 'â')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã /g, 'à')
      .replace(/Ã®/g, 'î')
      .replace(/Ã¯/g, 'ï')
      .replace(/Ã¹/g, 'ù')
      .replace(/â€“/g, '–')
      .replace(/â€˜/g, '’')
      .replace(/â€™/g, '’')
      .replace(/â€œ/g, '“')
      .replace(/â€/g, '”')
      .replace(/Â°/g, '°')
      .replace(/Â /g, ' ');
    
    // Handle replacement character U+FFFD (�) - map common patterns
    if (v.includes('\uFFFD')) {
      v = v.replace(/M\uFFFDcanique/gi, 'Mécanique')
           .replace(/\uFFFDlectrique/gi, 'Électrique')
           .replace(/\uFFFDlectronique/gi, 'Électronique')
           .replace(/b\uFFFDti/gi, 'bâti')
           .replace(/\uFFFD/g, 'é'); // Fallback
    }
    // Remove any other non-standard characters
    v = v.replace(/[^\x20-\x7E\u00C0-\u017F]/g, '');
    return v.trim();
  };

  const normalizeLabel = (s?: string) => {
    if (!s) return s;
    const fixed = fixEncoding(s)
      .replace(/\s+/g, ' ')
      .replace(/"/g, '')
      .trim();
    return fixed;
  };

  const autoMapAndPersist = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setStatus('idle');
      setMessage('');
      try {
        // Read as ArrayBuffer and decode with ISO-8859-1 (Latin-1) first; fallback to UTF-8 if many replacement chars
        const buffer = await file.arrayBuffer();
        let decoder = new TextDecoder('ISO-8859-1');
        const textLatin1 = decoder.decode(buffer);
        const replacementCount = (textLatin1.match(/�/g) || []).length;
        const finalText = replacementCount > 10 ? new TextDecoder('utf-8').decode(buffer) : textLatin1;
        Papa.parse(finalText, {
          header: true,
          skipEmptyLines: true,
          complete: async (results: Papa.ParseResult<any>) => {
            try {
              const rawColumns = results.meta.fields || [];
              const columns = rawColumns.map(fixEncoding);
              const rows: any[] = results.data as any[];

              // Build mapping table automatically
              const columnToField: Record<string, keyof AMDECRawData | undefined> = {};
              columns.forEach((col: string) => {
                for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
                  if (patterns.some((p) => p.test(col))) {
                    columnToField[col] = field as keyof AMDECRawData;
                    return;
                  }
                }
              });

              const records: AMDECRawData[] = rows.map((raw: any) => {
                const rec: Partial<AMDECRawData> = { id: uuidv4(), customColumns: {} };
                columns.forEach((col: string) => {
                  const value = fixEncoding(raw[col]);
                  const field = columnToField[col];
                  if (!field) {
                    if (value) rec.customColumns![col] = value;
                    return;
                  }
                  switch (field) {
                    case 'machine':
                    case 'component':
                    case 'failureType':
                    case 'cause':
                    case 'partDesignation':
                    case 'partReference':
                      rec[field] = normalizeLabel(String(value));
                      break;
                    case 'partQuantity':
                    case 'downtimeDuration':
                    case 'materialCost':
                      rec[field] = parseFloat(String(value).replace(/,/g, '.')) || 0;
                      break;
                    case 'interventionDate':
                      if (value) {
                        // Try parsing DD/MM/YYYY or DD-MM-YYYY format first
                        const parts = String(value).split(/[\/\-]/);
                        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                          const day = parseInt(parts[0]);
                          const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
                          const year = parseInt(parts[2]);
                          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                            rec[field] = new Date(year, month, day);
                          }
                        } else {
                          // Fallback to standard Date parsing
                          const dateAttempt = new Date(value);
                          if (!isNaN(dateAttempt.getTime())) {
                            rec[field] = dateAttempt;
                          }
                        }
                      }
                      break;
                  }
                });
                return rec as AMDECRawData;
              }).filter(r => r.machine || r.component || r.failureType); // keep meaningful rows

              // Fallback extraction for downtime and cost from custom columns
              let downtimeCount = 0;
              let costCount = 0;
              records.forEach((r, idx) => {
                if (r.customColumns) {
                  // Downtime extraction - check exact column name first
                  if (!r.downtimeDuration || r.downtimeDuration === 0) {
                    // Try exact match for "Durée arrêt (h)"
                    let downtimeKey = Object.keys(r.customColumns).find(k => 
                      k.includes('Durée') && k.includes('arrêt')
                    );
                    
                    if (!downtimeKey) {
                      downtimeKey = Object.keys(r.customColumns).find(k => {
                        const norm = k.toLowerCase().replace(/[^a-z]/g, '');
                        return (norm.includes('duree') && norm.includes('arret')) || 
                          norm.includes('downtime');
                      });
                    }
                    
                    if (downtimeKey) {
                      const rawValue = String(r.customColumns[downtimeKey]);
                      // Handle comma as decimal separator (French format)
                      const numericValue = rawValue.replace(',', '.').replace(/[^0-9.]/g, '');
                      const val = parseFloat(numericValue);
                      if (!isNaN(val) && val > 0) {
                        r.downtimeDuration = val;
                        downtimeCount++;
                        if (idx < 3) console.log(`✅ Downtime [${idx}]: "${downtimeKey}" = ${val}h from "${rawValue}"`);
                      }
                    }
                  }
                  
                  // Cost extraction (if not already mapped)
                  if (!r.materialCost || r.materialCost === 0) {
                    const costKey = Object.keys(r.customColumns).find(k => {
                      const normalized = fixEncoding(k).toLowerCase().replace(/[^a-z]/g, '');
                      return normalized.includes('cout') || 
                        normalized.includes('cost') || 
                        normalized.includes('prix') ||
                        normalized.includes('montant');
                    });
                    if (costKey) {
                      const rawValue = String(r.customColumns[costKey]);
                      const numericValue = rawValue.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
                      const val = parseFloat(numericValue);
                      if (!isNaN(val) && val > 0) {
                        r.materialCost = val;
                        costCount++;
                      }
                    }
                  }
                }
              });
              console.log(`✅ Fallback extraction: ${downtimeCount} downtime values, ${costCount} cost values`);

              // Canonicalize textual fields to collapse duplicates (e.g., Mécanique vs M�canique)
              const canonicalMap = new Map<string, string>();
              const makeKey = (s: string) => (normalizeLabel(s) || s).toLowerCase().replace(/[^a-z0-9]/g, '');
              ['machine','component','failureType'].forEach(f => {
                records.forEach(r => {
                  const val = (r as any)[f];
                  if (val) {
                    const key = makeKey(val);
                    if (!canonicalMap.has(key)) canonicalMap.set(key, normalizeLabel(val) || val);
                    (r as any)[f] = canonicalMap.get(key);
                  }
                });
              });

              // Fallback: Use partDesignation as component if component is empty
              let componentFallbackCount = 0;
              records.forEach(r => {
                if (!r.component && r.partDesignation) {
                  r.component = r.partDesignation;
                  componentFallbackCount++;
                }
              });
              if (componentFallbackCount > 0) {
                console.log(`✅ Used partDesignation as component fallback for ${componentFallbackCount} records`);
              }

              console.log('📊 AMDEC Import - Records:', records.length);
              console.log('📊 AMDEC Import - Raw columns:', rawColumns);
              console.log('📊 AMDEC Import - Fixed columns:', columns);
              console.log('📊 AMDEC Import - Column mapping:', columnToField);
              console.log('📊 AMDEC Import - Sample record:', records[0]);
              console.log('📊 AMDEC Import - Sample custom columns:', records[0]?.customColumns);
              console.log('📊 AMDEC Import - Downtime values (first 5):', records.slice(0, 5).map(r => ({
                component: r.component,
                downtime: r.downtimeDuration,
                customCols: Object.keys(r.customColumns || {}),
                customColsData: r.customColumns
              })));

              if (!records.length) {
                throw new Error('Aucune ligne exploitable détectée');
              }

              await db.amdecRawData.bulkAdd(records);
              console.log('✅ AMDEC Import - Data persisted to IndexedDB');

              const machines = new Set(records.map(r => r.machine).filter(Boolean)).size;
              const components = new Set(records.map(r => r.component).filter(Boolean)).size;
              const failureTypes = new Set(records.map(r => r.failureType).filter(Boolean)).size;

              setSummary({
                total: records.length,
                machines,
                components,
                failureTypes,
                sample: records.slice(0, 5),
              });
              setStatus('success');
              setMessage(`Import réussi: ${records.length} lignes`);
              onUploadComplete?.();
            } catch (err: any) {
              setStatus('error');
              setMessage(err.message || 'Erreur lors de l\'import');
            } finally {
              setIsParsing(false);
            }
          },
          error: (error: Papa.ParseError) => {
            setStatus('error');
            setMessage(`Erreur de parsing: ${error.message}`);
            setIsParsing(false);
          },
        });
      } catch (e: any) {
        setStatus('error');
        setMessage(e.message || 'Erreur de lecture du fichier');
        setIsParsing(false);
      }
    },
    [onUploadComplete]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setStatus('error');
        setMessage('Veuillez sélectionner un fichier .csv');
        return;
      }
      autoMapAndPersist(file);
    },
    [autoMapAndPersist]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clearData = async () => {
    await db.amdecRawData.clear();
    setSummary(null);
    setStatus('idle');
    setMessage('Données AMDEC supprimées');
  };

  return (
    <Card className="border-teal-200 dark:border-teal-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-teal-600" />
          Import CSV AMDEC
        </CardTitle>
        <CardDescription>
          Import automatique des colonnes (machine, organe, type de panne, cause, ...). Aucun mapping manuel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Zone */}
        {!summary && (
          <div
            className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-300 hover:border-teal-400 dark:border-gray-700'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm font-medium">Glissez-déposez votre fichier CSV ici</p>
            <p className="text-xs text-muted-foreground">ou</p>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => document.getElementById('csv-file-input')?.click()}
            >
              Parcourir les fichiers
            </Button>
            {isParsing && (
              <p className="mt-3 text-xs text-teal-600 animate-pulse">Analyse & import en cours...</p>
            )}
          </div>
        )}
        {summary && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-teal-700 dark:text-teal-300">Résumé de l'import</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSummary(null)}>Nouveau fichier</Button>
                <Button variant="destructive" size="sm" onClick={clearData} className="gap-1">
                  <Trash2 className="h-4 w-4" /> Vider
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Lignes" value={summary.total} />
              <Stat label="Machines" value={summary.machines} />
              <Stat label="Composants" value={summary.components} />
              <Stat label="Types de panne" value={summary.failureTypes} />
            </div>
            <div className="overflow-x-auto rounded-lg border shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-teal-50/70 dark:bg-teal-900/30">
                  <tr>
                    <th className="px-3 py-2 text-left">Machine</th>
                    <th className="px-3 py-2 text-left">Composant</th>
                    <th className="px-3 py-2 text-left">Type de panne</th>
                    <th className="px-3 py-2 text-left">Cause</th>
                    <th className="px-3 py-2 text-left">Durée arrêt</th>
                    <th className="px-3 py-2 text-left">Coût matériel</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sample.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.machine || '—'}</td>
                      <td className="px-3 py-2">{r.component || '—'}</td>
                      <td className="px-3 py-2">{r.failureType || '—'}</td>
                      <td className="px-3 py-2">{r.cause || '—'}</td>
                      <td className="px-3 py-2">{r.downtimeDuration ?? '—'}</td>
                      <td className="px-3 py-2">{r.materialCost ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Les 5 premières lignes affichées. Les données complètes sont disponibles pour l'analyse AMDEC.</p>
          </div>
        )}

        {/* Status Messages */}
        {status !== 'idle' && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 ${
              status === 'success'
                ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200'
                : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'
            }`}
          >
            {status === 'success' ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="text-sm">{message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white/70 p-4 backdrop-blur dark:bg-black/30">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
