import * as XLSX from 'xlsx';
import { db, type PDRHistory } from './schema';
import { v4 as uuid } from 'uuid';

/**
 * Parse date in DD/MM/YYYY format
 */
/**
 * Parse date from DD/MM/YYYY format
 */
function parseDate(dateStr: string | number): Date | null {
  if (!dateStr) return null;
  
  // Convert to string if needed
  const str = String(dateStr).trim();
  
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2]!, 10);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  // Use UTC to avoid timezone issues (01/07/2016 should stay 01/07/2016)
  const date = new Date(Date.UTC(year, month, day));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse number with French decimal separator (comma)
 */
function parseNumber(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number') return val;
  
  const str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
}

/**
 * Import PDR history from CSV/XLSX file
 */
export async function importPDRHistory(file: File): Promise<{
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  try {
    const buffer = await file.arrayBuffer();
    
    // Force raw string parsing to avoid XLSX date conversion issues
    const workbook = XLSX.read(buffer, { 
      type: 'array',
      raw: true,  // Keep dates as strings, don't convert
      cellDates: false,  // Don't parse dates automatically
      cellText: true,  // Use text representation
    });
    
    if (workbook.SheetNames.length === 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['Le fichier ne contient aucune feuille'],
      };
    }
    
    const sheetName = workbook.SheetNames[0]!;
    const firstSheet = workbook.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });

    if (rows.length < 2) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['Le fichier est vide ou ne contient pas de données'],
      };
    }

    // Parse header row (semicolon-separated if CSV)
    const headerRow = rows[0];
    let headers: string[];
    
    if (Array.isArray(headerRow) && headerRow.length === 1 && typeof headerRow[0] === 'string') {
      // CSV with semicolon separator
      headers = headerRow[0].split(';').map((h: string) => h.trim());
    } else {
      // XLSX or properly parsed CSV
      headers = headerRow.map((h: any) => String(h).trim());
    }

    console.log('📋 Headers detected:', headers);

    // Find column indices
    const colMap: Record<string, number> = {};
    const requiredCols = [
      'Date intervention',
      'Désignation',
      '[Pièce].Désignation',
      '[Pièce].Référence',
      '[Pièce].Quantité',
    ];

    headers.forEach((header, idx) => {
      const cleaned = header.replace(/"/g, '').trim();
      colMap[cleaned] = idx;
    });

    // Check required columns
    const missingCols = requiredCols.filter(col => colMap[col] === undefined);
    if (missingCols.length > 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [`Colonnes manquantes: ${missingCols.join(', ')}`],
      };
    }

    console.log('✅ Column mapping:', colMap);

    // Process data rows
    const records: PDRHistory[] = [];

    // Track skip reasons for better debugging
    let skipReasons = {
      emptyRow: 0,
      invalidDate: 0,
      noMachine: 0,
    };
    const skippedSamples: any[] = []; // Keep first 5 skipped rows for debugging

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Handle semicolon-separated rows
      let cells: any[];
      if (Array.isArray(row) && row.length === 1 && typeof row[0] === 'string') {
        cells = row[0].split(';');
      } else {
        cells = row;
      }

      if (!cells || cells.length === 0) {
        skipped++;
        skipReasons.emptyRow++;
        continue;
      }

      // Extract values
      const dateStr = cells[colMap['Date intervention']!];
      const machine = cells[colMap['Désignation']!];
      const partDesignation = cells[colMap['[Pièce].Désignation']!];
      const partReference = cells[colMap['[Pièce].Référence']!];
      const partQuantityRaw = cells[colMap['[Pièce].Quantité']!];

      // Parse date
      const interventionDate = parseDate(dateStr);
      if (!interventionDate) {
        skipped++;
        skipReasons.invalidDate++;
        if (skippedSamples.length < 5) {
          skippedSamples.push({ row: i + 1, reason: 'invalidDate', dateStr, machine: String(machine).substring(0, 20), cellsLength: cells.length });
        }
        continue;
      }

      // Skip if no machine
      if (!machine || String(machine).trim() === '') {
        skipped++;
        skipReasons.noMachine++;
        if (skippedSamples.length < 5) {
          skippedSamples.push({ row: i + 1, reason: 'noMachine', dateStr: String(dateStr).substring(0, 20) });
        }
        continue;
      }

      // Parse quantity
      const partQuantity = parseNumber(partQuantityRaw);

      // Note: We keep ALL interventions, even without part data
      // This is important for failure rate analysis and forecasting

      // Optional fields
      const failureType = cells[colMap['Type de panne']!] || undefined;
      const downtimeHours = parseNumber(cells[colMap['Durée arrêt (h)']!]);
      const result = cells[colMap['Résultat']!] || undefined;
      const materialCost = parseNumber(cells[colMap['Coût matériel']!]);

      const record: PDRHistory = {
        id: uuid(),
        machine: String(machine).trim(),
        interventionDate,
        failureType: failureType ? String(failureType).trim() : '',
        downtimeHours,
        result: result ? String(result).trim() : undefined,
        materialCost,
        partDesignation: partDesignation ? String(partDesignation).trim() : undefined,
        partReference: partReference ? String(partReference).trim() : undefined,
        partQuantity,
      };

      records.push(record);
    }

    // Bulk insert into IndexedDB
    if (records.length > 0) {
      await db.pdrHistory.bulkAdd(records);
      imported = records.length;
    }

    console.log(`✅ PDR Import complete: ${imported} records imported, ${skipped} skipped`);
    console.log('📊 Unique machines in import:', new Set(records.map(r => r.machine)).size);
    console.log('📦 Records with parts:', records.filter(r => r.partReference).length);
    console.log('🔧 Records without parts:', records.filter(r => !r.partReference).length);
    console.log('⚠️ Skip reasons:', skipReasons);
    if (skippedSamples.length > 0) {
      console.log('📝 First skipped rows (sample):', skippedSamples);
    }

    return {
      success: true,
      imported,
      skipped,
      errors,
    };
  } catch (error: any) {
    console.error('❌ PDR Import error:', error);
    return {
      success: false,
      imported,
      skipped,
      errors: [error.message || 'Erreur inconnue lors de l\'importation'],
    };
  }
}

/**
 * Get import statistics
 */
export async function getPDRStats() {
  const allRecords = await db.pdrHistory.toArray();
  
  if (allRecords.length === 0) {
    return {
      totalRecords: 0,
      uniqueMachines: 0,
      uniqueParts: 0,
      dateRange: null,
    };
  }

  const machines = new Set(allRecords.map(r => r.machine));
  // Count unique parts (filter out null/undefined/empty)
  const parts = new Set(
    allRecords
      .filter(r => r.partReference && r.partReference.trim() !== '')
      .map(r => r.partReference!.trim())
  );

  const dates = allRecords
    .map(r => r.interventionDate.getTime())
    .sort((a, b) => a - b);

  return {
    totalRecords: allRecords.length,
    uniqueMachines: machines.size,
    uniqueParts: parts.size,
    dateRange: {
      start: new Date(dates[0]!),
      end: new Date(dates[dates.length - 1]!),
    },
  };
}

/**
 * Clear all PDR history
 */
export async function clearPDRHistory() {
  await db.pdrHistory.clear();
  console.log('🗑️ PDR history cleared');
}
