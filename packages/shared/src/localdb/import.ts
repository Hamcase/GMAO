import { db, Asset, WorkOrder, AssetKpi, FailureMode, FunctionModel, Part, PartDemand } from './schema';
import { v4 as uuid } from 'uuid';
import { recalcKpis } from './kpi';

// Generic CSV parsing with support for quoted fields
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        // Toggle quotes, handle escaped quotes
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

// Import maintenance work orders CSV -> workOrders
// Expected columns (flexible): asset, assignee, start_at, end_at, downtime_minutes, type, status, priority
export async function importWorkOrdersFromRows(headers: string[], rows: string[][]) {
  const hMap = headers.reduce<Record<string, number>>((acc, h, idx) => { acc[String(h).toLowerCase().trim()] = idx; return acc; }, {});
  
  // Flexible column finder - tries multiple names
  const findCol = (names: string[]): number | undefined => {
    for (const name of names) {
      const idx = hMap[name.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
  
  const toDate = (v?: string) => {
    if (!v) return undefined;
    // Handle French date formats: DD/MM/YYYY or DD-MM-YYYY
    const frenchMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (frenchMatch) {
      const [_, day, month, year] = frenchMatch;
      return new Date(`${year}-${month}-${day}`);
    }
    return new Date(v);
  };
  
  const workOrders = rows.map(r => {
    // Track which column indices are consumed by the standard mapping
    const usedIdx = new Set<number>();
    const get = (names: string[]) => {
      const idx = findCol(names);
      if (idx !== undefined) usedIdx.add(idx);
      return idx !== undefined ? r[idx] : undefined;
    };
    
    // Extract downtime - handle "durée arrêt (h)" which is already in hours
    const downtimeStr = get(['downtime_minutes', 'temps_arret', 'duree_arret', 'durée arrêt (h)', 'durée_arrêt_(h)', 'downtime']) || '0';
    const downtimeValue = Number(downtimeStr.replace(',', '.')) || 0;
    // If column name contains "(h)", it's hours, otherwise assume minutes
    const downtimeColName = headers.find((h, idx) => {
      const normalized = h.toLowerCase().trim();
      return normalized.includes('duree') || normalized.includes('durée') || normalized.includes('downtime') || normalized.includes('arret') || normalized.includes('arrêt');
    }) || '';
    const isHours = downtimeColName.toLowerCase().includes('(h)');
    const downtimeMinutes = isHours ? downtimeValue * 60 : downtimeValue;
    
    // Build record
    const record = {
      id: uuid(),
      assetId: get(['asset_id', 'asset', 'equipement', 'equipment', 'désignation', 'designation', 'machine']) || 'unknown-asset',
      assignee: get(['assignee', 'technician', 'technicien', 'intervenant', 'responsable']) || undefined,
      title: get(['title', 'titre', 'description', 'résumé intervention', 'resume_intervention', 'résultat', 'resultat']) || undefined,
      type: (get(['type', 'work_type', 'type_intervention', 'type de panne', 'type_de_panne', 'catégorie de panne', 'categorie_de_panne']) || 'corrective').toLowerCase(),
      status: (get(['status', 'statut', 'etat', 'état']) || 'completed').toLowerCase(),
      priority: (get(['priority', 'priorite', 'priorité', 'urgence']) || 'medium').toLowerCase(),
      startAt: toDate(get(['start_at', 'date_debut', 'debut', 'start_date', 'date intervention', 'date_intervention'])),
      endAt: toDate(get(['end_at', 'date_fin', 'fin', 'end_date'])),
      createdAt: toDate(get(['created_at', 'date_creation', 'date demande', 'date_demande'])) || toDate(get(['start_at', 'date_debut', 'date intervention'])),
      downtimeMinutes,
      customColumns: {} as Record<string, any>,
    };

    // Populate customColumns with any non-empty columns not mapped above
    headers.forEach((h, idx) => {
      if (usedIdx.has(idx)) return;
      const val = r[idx];
      if (val !== undefined && String(val).trim() !== '') {
        (record.customColumns as any)[h] = val;
      }
    });

    return record;
  });
  await db.workOrders.bulkAdd(workOrders);
  
  // Auto-create assets from work order asset IDs
  const assetIds = Array.from(new Set(workOrders.map(wo => wo.assetId).filter(Boolean)));
  const existingAssets = await db.assets.toArray();
  const existingIds = new Set(existingAssets.map(a => a.id));
  const newAssets = assetIds
    .filter(id => !existingIds.has(id as string))
    .map(id => ({
      id: id as string,
      name: id as string,
      code: id as string,
      status: 'operational' as const,
      location: 'Site principal',
      createdAt: new Date()
    }));
  if (newAssets.length) await db.assets.bulkAdd(newAssets);
  
  await recalcKpis();
}

// Import AMDEC (failure modes) from work order CSV with Organe (component) and Cause columns
// This specialized function handles the AMDEC.csv format which has rich failure analysis data
export async function importAMDECFromWorkOrders(headers: string[], rows: string[][]) {
  const hMap = headers.reduce<Record<string, number>>((acc, h, idx) => { 
    acc[String(h).toLowerCase().trim()] = idx; 
    return acc; 
  }, {});
  
  const findCol = (names: string[]): number | undefined => {
    for (const name of names) {
      const idx = hMap[name.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
  
  console.log('🔄 Analyzing AMDEC work order data...');
  
  // Aggregate failures by Component (Organe) and Cause
  interface FailureStats {
    component: string;
    cause: string;
    failureType: string;
    occurrences: number;
    totalDowntime: number;
    totalCost: number;
    machines: Set<string>;
    descriptions: string[];
  }
  
  const failureMap = new Map<string, FailureStats>();
  
  rows.forEach(r => {
    const get = (names: string[]) => {
      const idx = findCol(names);
      return idx !== undefined ? r[idx] : undefined;
    };
    
    const component = get(['organe', 'component', 'composant']) || '';
    const cause = get(['cause', 'root_cause']) || '';
    const failureType = get(['type de panne', 'type_panne', 'failure_type']) || '';
    // Handle both proper encoding and Windows-1252 garbled versions (Dur�e arr�t)
    const downtimeStr = get([
      'durée arrêt (h)', 'duree_arret', 'downtime', 
      'durée arrêt', 'duree arret',
      'dur�e arr�t (h)', 'dur�e arr�t'  // Windows-1252 garbled
    ]) || '0';
    const downtime = Number(downtimeStr.replace(',', '.')) || 0;
    const cost = Number((get(['coût matériel', 'cout_materiel', 'cost', 'co�t mat�riel']) || '0').replace(',', '.'));
    // Handle both Désignation and D�signation
    const machine = get(['désignation', 'designation', 'asset', 'machine', 'd�signation']) || '';
    const description = get(['résumé intervention', 'resume_intervention', 'description', 'r�sum� intervention']) || '';
    
    if (!component || !cause) return; // Skip if missing critical data
    
    const key = `${component}|||${cause}`;
    
    if (!failureMap.has(key)) {
      failureMap.set(key, {
        component,
        cause,
        failureType,
        occurrences: 0,
        totalDowntime: 0,
        totalCost: 0,
        machines: new Set(),
        descriptions: []
      });
    }
    
    const stats = failureMap.get(key)!;
    stats.occurrences += 1;
    stats.totalDowntime += downtime;
    stats.totalCost += cost;
    if (machine) stats.machines.add(machine);
    if (description && stats.descriptions.length < 3) stats.descriptions.push(description.substring(0, 100));
  });
  
  console.log(`📊 Found ${failureMap.size} unique failure patterns`);
  
  // Debug: Show sample of collected data
  let sampleCount = 0;
  failureMap.forEach((stats, key) => {
    if (sampleCount < 3) {
      console.log(`Sample ${sampleCount + 1}:`, {
        component: stats.component,
        cause: stats.cause,
        occurrences: stats.occurrences,
        totalDowntime: stats.totalDowntime,
        avgDowntime: stats.totalDowntime / stats.occurrences,
        machines: Array.from(stats.machines)
      });
      sampleCount++;
    }
  });
  
  // Group by component to create Functions
  const componentMap = new Map<string, FailureStats[]>();
  failureMap.forEach(stats => {
    if (!componentMap.has(stats.component)) {
      componentMap.set(stats.component, []);
    }
    componentMap.get(stats.component)!.push(stats);
  });
  
  console.log(`🔧 Creating ${componentMap.size} functions from components`);
  
  // Create Functions (one per component/organe)
  const functions: FunctionModel[] = [];
  const functionIdMap = new Map<string, string>();
  
  componentMap.forEach((failures, component) => {
    const functionId = uuid();
    const cleanName = component.replace(/^\d+-/, '').trim(); // Remove "05-" prefix
    
    functions.push({
      id: functionId,
      assetId: 'system',
      name: cleanName
    });
    
    functionIdMap.set(component, functionId);
  });
  
  // Create Failure Modes with calculated S/O/D scores
  const failureModes: FailureMode[] = [];
  const totalFailures = rows.length;
  
  failureMap.forEach(stats => {
    const functionId = functionIdMap.get(stats.component);
    if (!functionId) return;
    
    const avgDowntime = stats.occurrences > 0 ? stats.totalDowntime / stats.occurrences : 0;
    
    // Calculate AMDEC scores (1-10)
    const severity = calculateSeverityScore(avgDowntime, stats.machines.size);
    const occurrence = calculateOccurrenceScore(stats.occurrences, totalFailures);
    const detection = calculateDetectionScore(stats.failureType);
    
    failureModes.push({
      id: uuid(),
      functionId,
      component: stats.component,
      mode: stats.cause,
      severity,
      occurrence,
      detection,
      frequency: stats.occurrences,
      cost: stats.totalCost,
      effectsLocal: `Arrêt moyen: ${avgDowntime.toFixed(1)}h (${stats.occurrences} occurrences)`,
      effectsSystem: `Impact sur ${stats.machines.size} machine(s)`,
      effectsSafety: getSafetyEffectFromType(stats.failureType),
      action: getRecommendedAction(stats.cause, severity * occurrence * detection, stats.occurrences),
      owner: 'Équipe Maintenance',
      dueInDays: getPriorityDays(severity * occurrence * detection),
      status: (severity * occurrence * detection) > 100 ? 'in-progress' : 'open'
    });
  });
  
  console.log(`✅ Created ${functions.length} functions and ${failureModes.length} failure modes`);
  
  // Insert into database
  await db.functions.bulkAdd(functions);
  await db.failureModes.bulkAdd(failureModes);
  
  return {
    functionsCreated: functions.length,
    failureModesCreated: failureModes.length
  };
}

// Helper functions for AMDEC scoring
function calculateSeverityScore(avgDowntimeHours: number, machinesAffected: number): number {
  let score = 1;
  
  // Base score on downtime
  if (avgDowntimeHours >= 10) score = 10;
  else if (avgDowntimeHours >= 5) score = 9;
  else if (avgDowntimeHours >= 2) score = 8;
  else if (avgDowntimeHours >= 1) score = 7;
  else if (avgDowntimeHours >= 0.5) score = 5;
  else if (avgDowntimeHours >= 0.25) score = 3;
  else score = 2;
  
  // Increase if multiple machines affected
  if (machinesAffected > 5) score = Math.min(10, score + 1);
  
  return score;
}

function calculateOccurrenceScore(count: number, total: number): number {
  const frequency = total > 0 ? count / total : 0;
  
  if (frequency >= 0.20) return 10; // >20% very frequent
  if (frequency >= 0.10) return 9;  // >10%
  if (frequency >= 0.05) return 7;  // >5% frequent
  if (frequency >= 0.02) return 5;  // >2% moderate
  if (frequency >= 0.01) return 4;  // >1%
  if (frequency >= 0.005) return 3; // >0.5% occasional
  if (frequency >= 0.001) return 2; // >0.1% rare
  return 1; // <0.1% very rare
}

function calculateDetectionScore(failureType: string): number {
  const type = failureType.toLowerCase();
  const detectionMap: Record<string, number> = {
    'mécanique': 4,      // Usually visible/audible
    'hydraulique': 5,    // Leaks visible
    'électrique': 7,     // Requires testing
    'électronique': 8,   // Hard to diagnose
    'arrosage': 3,       // Very visible
    'pneumatique': 4,    // Audible leaks
    'automate': 9,       // Software issues hidden
    'programme': 9,      // Logic errors
    'informatique': 9    // System issues
  };
  return detectionMap[type] || 6; // Default medium difficulty
}

function getSafetyEffectFromType(failureType: string): string {
  const type = failureType.toLowerCase();
  const safetyMap: Record<string, string> = {
    'mécanique': 'Risque de projection, blessure possible',
    'hydraulique': 'Risque de fuite d\'huile sous pression',
    'électrique': 'Risque d\'électrocution, incendie',
    'électronique': 'Risque d\'incendie électronique',
    'pneumatique': 'Risque de projection d\'air comprimé',
    'arrosage': 'Risque de glissement sur sol mouillé'
  };
  return safetyMap[type] || 'Arrêt production, pas de risque sécurité direct';
}

function getRecommendedAction(cause: string, rpn: number, occurrences: number): string {
  if (rpn > 200) {
    return `🔴 URGENT: ${cause} (RPN=${rpn}). Analyse approfondie et actions correctives immédiates requises.`;
  }
  if (rpn > 100) {
    return `🟠 PRIORITAIRE: ${cause} se produit ${occurrences} fois. Plan d'action requis sous 30 jours.`;
  }
  if (occurrences > 20) {
    return `🟡 SURVEILLANCE: ${cause} fréquent. Programmer maintenance préventive.`;
  }
  return `⚪ STANDARD: Surveillance normale pour ${cause}.`;
}

function getPriorityDays(rpn: number): number {
  if (rpn > 200) return 7;   // Critical - 1 week
  if (rpn > 100) return 30;  // High - 1 month
  if (rpn > 50) return 90;   // Medium - 3 months
  return 180;                // Low - 6 months
}

// Legacy import for standard AMDEC files (with pre-calculated S/O/D scores)
export async function importFailureModes(headers: string[], rows: string[][]) {
  const hMap = headers.reduce<Record<string, number>>((acc, h, idx) => { acc[String(h).toLowerCase().trim()] = idx; return acc; }, {});
  
  const findCol = (names: string[]): number | undefined => {
    for (const name of names) {
      const idx = hMap[name.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
  
  const failureModes = rows.map(r => {
    const get = (names: string[]) => {
      const idx = findCol(names);
      return idx !== undefined ? r[idx] : undefined;
    };
    const functionName = get(['function_name', 'fonction', 'function', 'nom_fonction']) || 'Fonction inconnue';
    return {
      id: uuid(),
      functionId: functionName, // Will remap after function creation
      component: get(['component', 'composant', 'element']) || 'N/A',
      mode: get(['mode', 'failure_mode', 'mode_defaillance', 'defaillance']) || 'N/A',
      severity: Number((get(['severity', 'severite', 'gravite', 'g']) || '5').replace(',', '.')) || 5,
      occurrence: Number((get(['occurrence', 'freq', 'frequence', 'o']) || '5').replace(',', '.')) || 5,
      detection: Number((get(['detection', 'd']) || '5').replace(',', '.')) || 5,
      frequency: Number((get(['frequency', 'frequence']) || '0').replace(',', '.')) || 0,
      cost: Number((get(['cost', 'cout', 'price']) || '0').replace(',', '.')) || 0,
      effectsLocal: get(['effects_local', 'effets_locaux', 'effet_local']) || 'N/A',
      effectsSystem: get(['effects_system', 'effets_systeme', 'effet_systeme']) || 'N/A',
      effectsSafety: get(['effects_safety', 'effets_securite', 'effet_securite']) || 'N/A',
      action: get(['action', 'action_corrective', 'mesure']) || 'N/A',
      owner: get(['owner', 'responsable', 'pilote']) || 'N/A',
      dueInDays: Number((get(['due_in_days', 'delai_jours', 'echeance']) || '0').replace(',', '.')) || 0,
      status: (get(['status', 'statut', 'etat']) || 'open').toLowerCase() as 'open'|'in-progress'|'done'
    };
  });
  // Create distinct functions
  const distinctFunctions = Array.from(new Set(failureModes.map(fm => fm.functionId)));
  const functionRecords: FunctionModel[] = distinctFunctions.map(name => ({ id: uuid(), assetId: 'virtual-asset', name }));
  await db.functions.bulkAdd(functionRecords);
  const mapping = Object.fromEntries(functionRecords.map(fr => [fr.name, fr.id]));
  // Remap functionId
  failureModes.forEach(fm => { fm.functionId = mapping[fm.functionId] || fm.functionId; });
  await db.failureModes.bulkAdd(failureModes);
}

// Import parts / stock file
export async function importParts(headers: string[], rows: string[][]) {
  const hMap = headers.reduce<Record<string, number>>((acc, h, idx) => { acc[String(h).toLowerCase()] = idx; return acc; }, {});
  const parts = rows.map(r => {
    const get = (name: string) => {
      const key = name.toLowerCase();
      const idx = hMap[key];
      return idx !== undefined ? r[idx] : undefined;
    };
    const current = Number((get('current_quantity')||get('stock_actuel')||'0').replace(',', '.')) || 0;
    const safety = Number((get('safety_stock')||get('stock_securite')||'0').replace(',', '.')) || 0;
    const reorderPoint = Number((get('reorder_point')||get('point_reappro')||'0').replace(',', '.')) || 0;
    const avgUsage = Number((get('avg_monthly_usage')||get('consommation_moyenne')||'0').replace(',', '.')) || 0;
    const reorderStatus = current < safety ? 'critical' : current < reorderPoint ? 'warning' : 'good';
    return {
      id: uuid(),
      name: get('part_name') || get('name') || 'Pièce',
      category: get('category') || 'Autre',
      currentQuantity: current,
      safetyStock: safety,
      reorderPoint,
      leadTimeDays: Number((get('lead_time_days')||'7').replace(',', '.')) || 7,
      unitCost: Number((get('unit_cost')||'0').replace(',', '.')) || 0,
      avgMonthlyUsage: avgUsage,
      status: reorderStatus as 'good' | 'warning' | 'critical' | 'unknown'
    };
  });
  await db.parts.bulkAdd(parts);
}

// Import demand for parts (period aggregated usage)
export async function importPartDemand(headers: string[], rows: string[][]) {
  const hMap = headers.reduce<Record<string, number>>((acc, h, idx) => { acc[String(h).toLowerCase()] = idx; return acc; }, {});
  const demand = rows.map(r => {
    const get = (name: string) => {
      const key = name.toLowerCase();
      const idx = hMap[key];
      return idx !== undefined ? r[idx] : undefined;
    };
    const period = get('period') || get('mois') || '2025-01';
    const partName = get('part_name') || get('name') || 'Pièce';
    const partExisting = db.parts.where('name').equals(partName).first();
    // For simplicity require existing part; skip creation to keep deterministic demo
    return {
      id: uuid(),
      partId: (partExisting as any)?.id || partName, // fallback to name
      period,
      totalUsage: Number((get('total_usage')||get('usage_total')||'0').replace(',', '.')) || 0
    };
  });
  await db.partDemand.bulkAdd(demand);
}

export async function clearAllLocalData() {
  await db.assets.clear();
  await db.functions.clear();
  await db.failureModes.clear();
  await db.workOrders.clear();
  await db.kpis.clear();
  await db.parts.clear();
  await db.partDemand.clear();
}
