import Dexie, { Table } from 'dexie';

// Asset
export interface Asset {
  id: string; // uuid or generated
  name: string;
  location?: string;
  criticality?: 'A' | 'B' | 'C';
  createdAt: Date;
  // Stores additional columns from import files that do not map to standard schema fields
  customColumns?: Record<string, any>;
}

// Function (AMDEC)
export interface FunctionModel {
  id: string;
  assetId: string;
  name: string;
  customColumns?: Record<string, any>;
}

// Failure Mode (AMDEC)
export interface FailureMode {
  id: string;
  functionId: string;
  component: string;
  mode: string;
  severity: number;
  occurrence: number;
  detection: number;
  frequency: number; // events / month
  cost: number; // cost per event
  effectsLocal: string;
  effectsSystem: string;
  effectsSafety: string;
  action: string;
  owner: string;
  dueInDays: number;
  status: 'open' | 'in-progress' | 'done';
  customColumns?: Record<string, any>;
}

// Work Order
export interface WorkOrder {
  id: string;
  assetId?: string;
  assignee?: string;
  title?: string;
  type?: string; // corrective | preventive | emergency | other
  status?: string; // planned | in_progress | completed
  priority?: string; // low|medium|high|critical
  startAt?: Date;
  endAt?: Date;
  createdAt?: Date;
  downtimeMinutes?: number;
  customColumns?: Record<string, any>;
}

// KPI row (pivoted form stored directly)
export interface AssetKpi {
  id: string;
  assetCode: string;
  metricType: 'mtbf' | 'mttr' | 'availability';
  metricValue: number;
  period: string; // YYYY-MM or date bucket
  recordedAt: Date;
  customColumns?: Record<string, any>;
}

// Spare Part / Stock item
export interface Part {
  id: string;
  name: string;
  category?: string;
  currentQuantity: number;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  unitCost: number;
  avgMonthlyUsage: number; // for forecasting baseline
  status?: 'good' | 'warning' | 'critical' | 'unknown';
}

// Aggregated demand per period
export interface PartDemand {
  id: string; // partId|period composite if desired
  partId: string;
  period: string; // YYYY-MM
  totalUsage: number;
}

// Raw AMDEC Data (from CSV upload with French columns)
export interface AMDECRawData {
  id: string;
  machine: string; // Machine identifier
  component: string; // organe / composant
  failureType: string; // type de panne
  cause: string; // cause
  partDesignation?: string; // pièce[désignation]
  partReference?: string; // pièce[Référence]
  partQuantity?: number; // pièce[quantité]
  downtimeDuration?: number; // duree d'arret (minutes or hours)
  materialCost?: number; // cout materiel
  interventionDate?: Date; // date intervention
  // Store any additional unmapped columns
  customColumns?: Record<string, any>;
}

export class LocalGMAODb extends Dexie {
  assets!: Table<Asset, string>;
  functions!: Table<FunctionModel, string>;
  failureModes!: Table<FailureMode, string>;
  workOrders!: Table<WorkOrder, string>;
  kpis!: Table<AssetKpi, string>;
  parts!: Table<Part, string>;
  partDemand!: Table<PartDemand, string>;
  amdecRawData!: Table<AMDECRawData, string>;

  constructor() {
    super('gmao_local');
    // Version 1 schema. Add new versions with .version(2).stores({...}) when evolving.
    this.version(1).stores({
      assets: 'id, name, criticality',
      functions: 'id, assetId, name',
      failureModes: 'id, functionId, severity, occurrence, detection, status',
      workOrders: 'id, assetId, assignee, status, startAt, endAt',
      kpis: 'id, assetCode, metricType, period',
      parts: 'id, name, category, status',
      partDemand: 'id, partId, period'
    });
    
    // Version 2: Add AMDEC raw data table
    this.version(2).stores({
      assets: 'id, name, criticality',
      functions: 'id, assetId, name',
      failureModes: 'id, functionId, severity, occurrence, detection, status',
      workOrders: 'id, assetId, assignee, status, startAt, endAt',
      kpis: 'id, assetCode, metricType, period',
      parts: 'id, name, category, status',
      partDemand: 'id, partId, period',
      amdecRawData: 'id, machine, component, failureType'
    });
  }
}

export const db = new LocalGMAODb();

// Expose DB for quick debugging in the browser console (window.gmaoDb)
// Note: Useful because `db` is not defined in the global scope by default.
if (typeof window !== 'undefined') {
  (window as any).gmaoDb = (window as any).gmaoDb || db;
}
