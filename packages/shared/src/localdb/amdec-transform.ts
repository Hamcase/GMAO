/**
 * AMDEC Data Transformation
 * 
 * Transforms work orders with rich failure data (Cause, Organe) into proper AMDEC structure:
 * - Organe (component) → Functions
 * - Cause (root cause) → Failure Modes under functions
 * - Calculate S/O/D scores from actual failure frequency and impact
 */

import { db, FunctionModel, FailureMode, WorkOrder } from './schema';
import { v4 as uuid } from 'uuid';

interface FailureAnalysis {
  component: string; // Organe
  cause: string; // Cause
  failureType: string; // Type de panne
  occurrences: number;
  totalDowntime: number;
  avgDowntime: number;
  totalCost: number;
  machines: Set<string>;
  descriptions: string[];
}

/**
 * Transform work orders with Cause/Organe into AMDEC Functions and Failure Modes
 */
export async function transformWorkOrdersToAMDEC(workOrders: WorkOrder[]) {
  console.log('🔄 Transforming work orders to AMDEC structure...');
  
  // Filter work orders that have Cause and Organe data
  const amdecWorkOrders = workOrders.filter(wo => {
    // Check if work order has the rich AMDEC data in title or description
    const text = `${wo.title || ''} ${wo.description || ''}`.toLowerCase();
    return text.length > 20; // Has meaningful data
  });
  
  console.log(`📊 Analyzing ${amdecWorkOrders.length} work orders for AMDEC data...`);
  
  // Parse work orders to extract Cause/Organe from title or custom fields
  const failureMap = new Map<string, FailureAnalysis>();
  
  amdecWorkOrders.forEach(wo => {
    // Try to extract component and cause from work order
    // In AMDEC.csv, these are in separate columns but after import they may be in title/description
    const component = extractComponent(wo);
    const cause = extractCause(wo);
    const failureType = wo.type || 'unknown';
    
    if (!component || !cause) return;
    
    const key = `${component}|${cause}`;
    
    if (!failureMap.has(key)) {
      failureMap.set(key, {
        component,
        cause,
        failureType,
        occurrences: 0,
        totalDowntime: 0,
        avgDowntime: 0,
        totalCost: 0,
        machines: new Set(),
        descriptions: []
      });
    }
    
    const analysis = failureMap.get(key)!;
    analysis.occurrences += 1;
    analysis.totalDowntime += wo.downtimeMinutes || 0;
    analysis.machines.add(wo.assetId);
    if (wo.title) analysis.descriptions.push(wo.title.substring(0, 100));
  });
  
  // Calculate averages
  failureMap.forEach(analysis => {
    analysis.avgDowntime = analysis.occurrences > 0 
      ? analysis.totalDowntime / analysis.occurrences 
      : 0;
  });
  
  console.log(`📊 Found ${failureMap.size} unique component-cause combinations`);
  
  // Group by component (Organe) to create Functions
  const componentMap = new Map<string, FailureAnalysis[]>();
  failureMap.forEach(analysis => {
    if (!componentMap.has(analysis.component)) {
      componentMap.set(analysis.component, []);
    }
    componentMap.get(analysis.component)!.push(analysis);
  });
  
  console.log(`🔧 Found ${componentMap.size} unique components (Functions)`);
  
  // Create Functions from components
  const functions: FunctionModel[] = [];
  const functionIdMap = new Map<string, string>();
  
  componentMap.forEach((failures, component) => {
    const functionId = uuid();
    const cleanComponent = cleanComponentName(component);
    
    functions.push({
      id: functionId,
      assetId: 'system', // Virtual asset for AMDEC
      name: cleanComponent,
      description: `Fonction: ${cleanComponent} (${failures.length} modes de défaillance)`,
      createdAt: new Date()
    });
    
    functionIdMap.set(component, functionId);
  });
  
  // Create Failure Modes from causes
  const failureModes: FailureMode[] = [];
  
  failureMap.forEach(analysis => {
    const functionId = functionIdMap.get(analysis.component);
    if (!functionId) return;
    
    // Calculate S/O/D scores from data
    const severity = calculateSeverity(analysis.avgDowntime, analysis.machines.size);
    const occurrence = calculateOccurrence(analysis.occurrences, amdecWorkOrders.length);
    const detection = calculateDetection(analysis.failureType);
    const rpn = severity * occurrence * detection;
    
    failureModes.push({
      id: uuid(),
      functionId,
      component: analysis.component,
      mode: analysis.cause,
      cause: analysis.cause,
      severity,
      occurrence,
      detection,
      rpn,
      frequency: analysis.occurrences,
      cost: analysis.totalCost,
      effectsLocal: `Arrêt ${(analysis.avgDowntime / 60).toFixed(1)}h en moyenne`,
      effectsSystem: `${analysis.machines.size} machine(s) affectée(s)`,
      effectsSafety: getSafetyEffect(analysis.failureType),
      action: getRecommendedAction(analysis.cause, analysis.occurrences),
      owner: 'Maintenance',
      dueInDays: getDueDays(rpn),
      status: rpn > 100 ? 'in-progress' : 'open',
      createdAt: new Date()
    });
  });
  
  console.log(`✅ Generated ${functions.length} functions and ${failureModes.length} failure modes`);
  
  // Clear existing AMDEC data and insert new
  await db.functions.clear();
  await db.failureModes.clear();
  
  await db.functions.bulkAdd(functions);
  await db.failureModes.bulkAdd(failureModes);
  
  return {
    functionsCreated: functions.length,
    failureModesCreated: failureModes.length,
    analysisData: {
      totalWorkOrders: amdecWorkOrders.length,
      uniqueComponents: componentMap.size,
      uniqueFailures: failureMap.size
    }
  };
}

// Helper functions

function extractComponent(wo: WorkOrder): string | null {
  // Try to extract from custom fields or title
  // In AMDEC.csv, Organe column contains component like "05-Unité de lubrification"
  const title = wo.title || '';
  const desc = wo.description || '';
  
  // Look for patterns like "XX-Component Name"
  const pattern = /(\d{1,3}-[\wàâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/i;
  const match = title.match(pattern) || desc.match(pattern);
  
  if (match) return match[1].trim();
  
  // Fallback: use asset type or generic
  if (wo.type) return getComponentFromType(wo.type);
  
  return null;
}

function extractCause(wo: WorkOrder): string | null {
  // In AMDEC.csv, Cause column contains root cause like "PROBLEME DE LUBRIFICATION"
  // Look for common French cause patterns in title
  const title = (wo.title || '').toUpperCase();
  
  const causePatterns = [
    /PROBLEME DE ([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/,
    /BLOCAGE ([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/,
    /PANNE ([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/,
    /DEFAUT ([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/,
    /CASSE ([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ\s]+)/,
  ];
  
  for (const pattern of causePatterns) {
    const match = title.match(pattern);
    if (match) return match[0].trim();
  }
  
  // If no specific cause found, use failure type
  if (wo.type) {
    return `DÉFAILLANCE ${wo.type.toUpperCase()}`;
  }
  
  return null;
}

function cleanComponentName(component: string): string {
  // Clean component name (remove codes, normalize)
  return component
    .replace(/^\d+-/, '') // Remove leading "05-"
    .replace(/\s+/g, ' ')
    .trim();
}

function getComponentFromType(type: string): string {
  const typeMap: Record<string, string> = {
    'mécanique': '02-Axes',
    'hydraulique': '05-Unité de lubrification',
    'électrique': '03-Armoire électrique',
    'électronique': '03-Armoire électrique',
    'arrosage': '04-Groupe d\'arrosage',
    'pneumatique': '08-Système pneumatique',
    'automate': '031-CN',
    'programme': '031-CN',
    'informatique': '031-CN'
  };
  
  return typeMap[type.toLowerCase()] || '00-Système général';
}

function calculateSeverity(avgDowntimeMinutes: number, machinesAffected: number): number {
  // Severity (1-10) based on average downtime and number of machines
  // Higher downtime = higher severity
  const downtimeHours = avgDowntimeMinutes / 60;
  
  let score = 1;
  
  if (downtimeHours < 0.5) score += 1;
  else if (downtimeHours < 1) score += 2;
  else if (downtimeHours < 2) score += 4;
  else if (downtimeHours < 4) score += 6;
  else score += 8;
  
  // Add severity for multiple machines affected
  if (machinesAffected > 3) score += 1;
  if (machinesAffected > 5) score += 1;
  
  return Math.min(10, score);
}

function calculateOccurrence(count: number, totalWorkOrders: number): number {
  // Occurrence (1-10) based on frequency
  const frequency = totalWorkOrders > 0 ? count / totalWorkOrders : 0;
  
  if (frequency < 0.001) return 1; // Very rare (< 0.1%)
  if (frequency < 0.005) return 2; // Rare (< 0.5%)
  if (frequency < 0.01) return 3;  // Occasional (< 1%)
  if (frequency < 0.02) return 4;
  if (frequency < 0.05) return 5;  // Moderate (< 5%)
  if (frequency < 0.10) return 7;  // Frequent (< 10%)
  if (frequency < 0.20) return 9;  // Very frequent (< 20%)
  return 10; // Extremely frequent
}

function calculateDetection(failureType: string): number {
  // Detection difficulty (1-10, higher = harder to detect)
  const detectionMap: Record<string, number> = {
    'mécanique': 5,      // Visible/audible
    'hydraulique': 6,    // Requires inspection
    'électrique': 7,     // Requires testing
    'électronique': 8,   // Hard to diagnose
    'arrosage': 4,       // Visible leaks
    'pneumatique': 5,    // Audible leaks
    'automate': 9,       // Software issues
    'programme': 9,      // Logic errors
    'informatique': 9    // System issues
  };
  
  return detectionMap[failureType.toLowerCase()] || 5;
}

function getSafetyEffect(failureType: string): string {
  const safetyMap: Record<string, string> = {
    'mécanique': 'Risque de projection de pièces',
    'hydraulique': 'Risque de fuite d\'huile',
    'électrique': 'Risque d\'électrocution',
    'électronique': 'Risque d\'incendie',
    'pneumatique': 'Risque de projection d\'air comprimé',
    'arrosage': 'Risque de glissement'
  };
  
  return safetyMap[failureType.toLowerCase()] || 'Risque d\'arrêt de production';
}

function getRecommendedAction(cause: string, occurrences: number): string {
  if (occurrences > 50) {
    return `Action prioritaire: ${cause} se produit fréquemment (${occurrences} fois). Analyse approfondie requise.`;
  }
  if (occurrences > 20) {
    return `Surveillance accrue: ${cause} nécessite une attention régulière.`;
  }
  if (occurrences > 5) {
    return `Maintenance préventive: Programmer des inspections pour ${cause}.`;
  }
  return `Maintenance corrective standard pour ${cause}.`;
}

function getDueDays(rpn: number): number {
  // Priority based on RPN
  if (rpn > 200) return 7;   // Critical - 1 week
  if (rpn > 100) return 30;  // High - 1 month
  if (rpn > 50) return 90;   // Medium - 3 months
  return 180;                // Low - 6 months
}
