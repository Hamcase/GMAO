import { db } from './schema';
import { v4 as uuid } from 'uuid';
import * as XLSX from 'xlsx';

// Month name (French + English) mapping to month number (1-12)
const MONTH_NAME_MAP: Record<string, number> = {
  'jan': 1, 'janv': 1, 'janvier': 1,
  'feb': 2, 'fev': 2, 'février': 2, 'fevrier': 2,
  'mar': 3, 'mars': 3,
  'apr': 4, 'avr': 4, 'avril': 4,
  'may': 5, 'mai': 5,
  'jun': 6, 'juin': 6,
  'jul': 7, 'juil': 7, 'juillet': 7,
  'aug': 8, 'aou': 8, 'août': 8, 'aout': 8,
  'sep': 9, 'sept': 9, 'septembre': 9,
  'oct': 10, 'octobre': 10,
  'nov': 11, 'novembre': 11,
  'dec': 12, 'déc': 12, 'décembre': 12, 'decembre': 12
};

function normalizeNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function detectMonthFromSheet(sheetName: string): number | null {
  const key = sheetName.toLowerCase().replace(/[^a-zA-Zéûùàô]/g, '').substring(0, 9);
  for (const candidate of Object.keys(MONTH_NAME_MAP)) {
    if (key.startsWith(candidate)) {
      const monthNum = MONTH_NAME_MAP[candidate];
      return monthNum !== undefined ? monthNum : null;
    }
  }
  return null;
}

// Detect if this is the summary sheet
function isSummarySheet(sheetName: string): boolean {
  const normalized = sheetName.toLowerCase().replace(/\s+/g, '');
  return normalized.includes('dispo') && (normalized.includes('machine') || normalized.includes('par'));
}

// Convert Excel date serial number to Date
function excelDateToJSDate(serial: number): Date {
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

// Upsert KPI row (assetCode, period, metricType)
async function upsertKpi(
  assetCode: string, 
  period: string, 
  metricType: 'mtbf'|'mttr'|'availability', 
  value: number, 
  source: string,
  additionalData?: Record<string, any>
) {
  const existing = await db.kpis.where('assetCode').equals(assetCode).toArray();
  const match = existing.find(r => r.period === period && r.metricType === metricType);
  const customColumns = { source, ...(additionalData || {}) };
  if (match) {
    await db.kpis.update(match.id, { metricValue: value, customColumns: { ...match.customColumns, ...customColumns } });
    return false; // updated
  } else {
    await db.kpis.add({ 
      id: uuid(), 
      assetCode, 
      metricType, 
      metricValue: value, 
      period, 
      recordedAt: new Date(), 
      customColumns 
    });
    return true; // inserted
  }
}

export interface ExcelKpiImportSummary {
  sheetsProcessed: number;
  kpisInserted: number;
  kpisUpdated: number;
  skippedSheets: string[];
  summaryProcessed: boolean;
}

// Parse summary sheet: "Dispo par machine"
// Expected structure: Secteur | Machine | Moyenne | Obj | Avril | Mai | ... | Mars
async function parseSummarySheet(ws: XLSX.WorkSheet, baseYear: number): Promise<{ inserted: number, updated: number }> {
  let inserted = 0, updated = 0;
  
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (data.length < 2) return { inserted, updated };
  
  // Find header row (contains "Secteur", "Machine", "Moyenne", "Obj", month names)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row) continue; // Safety check
    const rowStr = row.map(c => String(c||'').toLowerCase()).join(' ');
    if (rowStr.includes('secteur') || rowStr.includes('machine') || rowStr.includes('moyenne')) {
      headerRowIdx = i;
      break;
    }
  }
  
  if (headerRowIdx === -1) return { inserted, updated };
  
  const headerRow = data[headerRowIdx];
  if (!headerRow) return { inserted, updated }; // Safety check
  const headers = headerRow.map(h => String(h||'').trim());
  const secteurIdx = headers.findIndex(h => h.toLowerCase().includes('secteur'));
  const machineIdx = headers.findIndex(h => h.toLowerCase().includes('machine'));
  const moyenneIdx = headers.findIndex(h => h.toLowerCase().includes('moyenne'));
  const objIdx = headers.findIndex(h => h.toLowerCase().includes('obj'));
  
  // Find month column indices
  const monthIndices: Array<{ idx: number, monthNum: number }> = [];
  headers.forEach((h, idx) => {
    const monthNum = detectMonthFromSheet(h);
    if (monthNum) monthIndices.push({ idx, monthNum });
  });
  
  console.log(`📊 Summary sheet: Found ${monthIndices.length} month columns, machine col at ${machineIdx}, obj at ${objIdx}`);
  
  // Parse data rows with sector tracking (sector name appears only once for each sector group)
  let currentSector = '';
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue; // Safety check
    const col0 = secteurIdx >= 0 ? String(row[secteurIdx] || '').trim() : '';
    const machine = machineIdx >= 0 ? String(row[machineIdx] || '').trim() : '';
    if (!machine) continue;
    
    // Update currentSector when we see a non-empty value
    // Sector names: "Traitement de surface", "Peinture", "Assemblage", "Marquage", "TS", "P", etc.
    // The first row of each sector group has the sector name, subsequent rows are empty
    if (col0 && col0.toLowerCase() !== 'secteur') {
      // Any non-empty sector value becomes the current sector
      // This includes both full names ("Traitement de surface") and codes ("TS")
      currentSector = col0;
    }
    
    const secteur = currentSector || col0 || 'Non défini';
    const moyenne = moyenneIdx >= 0 ? normalizeNumber(row[moyenneIdx]) : 0;
    const objective = objIdx >= 0 ? normalizeNumber(row[objIdx]) : 0;
    
    // Store monthly availability values
    for (const { idx, monthNum } of monthIndices) {
      const dispoVal = normalizeNumber(row[idx]);
      if (dispoVal > 0 && dispoVal <= 1) {
        const period = `${baseYear}-${String(monthNum).padStart(2, '0')}`;
        const wasInserted = await upsertKpi(machine, period, 'availability', dispoVal * 100, 'excel', {
          sector: secteur,
          objective: objective * 100,
          moyenne: moyenne * 100
        });
        if (wasInserted) inserted++; else updated++;
      }
    }
  }
  
  return { inserted, updated };
}

// Parse monthly detail sheet with daily columns
// Structure: Sector | Code | Machine | Metric | Day1 | Day2 | ... | Day30 | Total | Obj | ... calculated columns
async function parseMonthlyDetailSheet(ws: XLSX.WorkSheet, monthNum: number, baseYear: number): Promise<{ inserted: number, updated: number }> {
  let inserted = 0, updated = 0;
  
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (data.length < 3) return { inserted, updated };
  
  // Find date header row (contains Excel serial dates like 45383, 45384...)
  let dateRowIdx = -1;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row) continue; // Safety check
    const hasSerialDates = row.some(cell => typeof cell === 'number' && cell > 40000 && cell < 50000);
    if (hasSerialDates) {
      dateRowIdx = i;
      break;
    }
  }
  
  if (dateRowIdx === -1) {
    console.log(`⚠️ No date row found in monthly sheet for month ${monthNum}`);
    return { inserted, updated };
  }
  
  const dateRow = data[dateRowIdx];
  console.log(`📅 Found date row at index ${dateRowIdx} for month ${monthNum}`);
  
  // Parse machine data rows (starting after date row)
  // Expected structure: rows have Sector, Code, Machine, then metric name, then daily values
  // Sector name appears only in first row of each sector group, then machines just have code
  const period = `${baseYear}-${String(monthNum).padStart(2, '0')}`;
  
  interface MachineMetrics {
    sector: string;
    machine: string;
    arretSubi: number[];
    arretProg: number[];
    prevNiv1: number[];
    production: number[];
  }
  
  const machineData = new Map<string, MachineMetrics>();
  let currentSector = '';
  
  for (let i = dateRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue; // Safety check
    const col0 = String(row[0] || '').trim();
    const code = String(row[1] || '').trim();
    const machine = String(row[2] || '').trim();
    const metric = String(row[3] || '').toLowerCase().trim();
    
    // Update currentSector when we see a non-empty value in col0
    // Sector names: "Traitement de surface", "Peinture", "Assemblage", "Marquage"
    // The first row of each sector group has the sector name, subsequent rows are empty
    if (col0 && col0 !== 'Secteur' && col0 !== 'SECTEUR') {
      // Any non-empty sector value becomes the current sector
      currentSector = col0;
    }
    
    if (!machine || !metric) continue;
    
    // Use currentSector instead of empty col0
    const sector = currentSector || code || 'Non défini';
    const key = `${sector}|${machine}`;
    if (!machineData.has(key)) {
      machineData.set(key, {
        sector,
        machine,
        arretSubi: [],
        arretProg: [],
        prevNiv1: [],
        production: []
      });
    }
    
    const metrics = machineData.get(key)!;
    
    // Extract daily values (after metric column, aligned with date row)
    const dailyValues: number[] = [];
    if (dateRow) { // Safety check
      for (let colIdx = 4; colIdx < dateRow.length && colIdx < row.length; colIdx++) {
        if (typeof dateRow[colIdx] === 'number' && dateRow[colIdx] > 40000) {
          dailyValues.push(normalizeNumber(row[colIdx]));
        }
      }
    }
    
    // Map metric to appropriate array
    if (metric.includes('subi')) {
      metrics.arretSubi = dailyValues;
    } else if (metric.includes('prog')) {
      metrics.arretProg = dailyValues;
    } else if (metric.includes('niv')) {
      metrics.prevNiv1 = dailyValues;
    } else if (metric.includes('production')) {
      metrics.production = dailyValues;
    }
  }
  
  console.log(`🏭 Parsed ${machineData.size} machines from monthly sheet ${monthNum}`);
  
  // Calculate KPIs for each machine
  for (const [key, metrics] of machineData.entries()) {
    const { machine, sector, arretSubi, arretProg, prevNiv1, production } = metrics;
    
    const totalProduction = production.reduce((sum, v) => sum + v, 0);
    const totalArretSubi = arretSubi.reduce((sum, v) => sum + v, 0);
    const totalArretProg = arretProg.reduce((sum, v) => sum + v, 0);
    const totalPrevNiv1 = prevNiv1.reduce((sum, v) => sum + v, 0);
    
    if (totalProduction === 0) continue;
    
    // Calculate availability: 100% - (total indispo / total production)
    const indispoSubi = totalProduction > 0 ? (totalArretSubi / totalProduction) * 100 : 0;
    const indispoSubiProg = totalProduction > 0 ? ((totalArretSubi + totalArretProg) / totalProduction) * 100 : 0;
    const indispoTotal = totalProduction > 0 ? ((totalArretSubi + totalArretProg + totalPrevNiv1) / totalProduction) * 100 : 0;
    const dispo = 100 - indispoTotal;
    
    if (dispo > 0 && dispo <= 100) {
      const wasInserted = await upsertKpi(machine, period, 'availability', dispo, 'excel', {
        sector,
        indispoSubi,
        indispoSubiProg,
        indispoTotal,
        totalProduction,
        totalArretSubi,
        totalArretProg,
        totalPrevNiv1
      });
      if (wasInserted) inserted++; else updated++;
    }
  }
  
  return { inserted, updated };
}

// Import KPI metrics from an Excel File.
// Handles both monthly detail sheets and summary sheet.
export async function importKpisFromExcelFile(file: File, yearHint?: number): Promise<ExcelKpiImportSummary> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let kpiInsertCount = 0;
  let kpiUpdateCount = 0;
  const skipped: string[] = [];
  let sheetsProcessed = 0;
  let summaryProcessed = false;
  const nowYear = new Date().getFullYear();
  const baseYear = yearHint || nowYear;

  console.log(`📂 Processing Excel file with ${workbook.SheetNames.length} sheets`);

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    
    console.log(`📄 Processing sheet: ${sheetName}`);
    
    // Check if this is the summary sheet
    if (isSummarySheet(sheetName)) {
      console.log(`📊 Detected summary sheet: ${sheetName}`);
      const result = await parseSummarySheet(ws, baseYear);
      kpiInsertCount += result.inserted;
      kpiUpdateCount += result.updated;
      summaryProcessed = true;
      sheetsProcessed++;
      continue;
    }
    
    // Try to detect monthly sheet
    const monthNum = detectMonthFromSheet(sheetName);
    if (monthNum) {
      console.log(`📅 Detected monthly detail sheet: ${sheetName} (month ${monthNum})`);
      const result = await parseMonthlyDetailSheet(ws, monthNum, baseYear);
      kpiInsertCount += result.inserted;
      kpiUpdateCount += result.updated;
      sheetsProcessed++;
    } else {
      console.log(`⏭️ Skipping unrecognized sheet: ${sheetName}`);
      skipped.push(sheetName);
    }
  }

  console.log(`✅ Excel import complete: ${sheetsProcessed} sheets processed, ${kpiInsertCount} inserted, ${kpiUpdateCount} updated`);
  return { 
    sheetsProcessed, 
    kpisInserted: kpiInsertCount, 
    kpisUpdated: kpiUpdateCount, 
    skippedSheets: skipped,
    summaryProcessed
  };
}
