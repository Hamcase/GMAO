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

// AI Interaction for feedback loop and learning
export interface AIInteraction {
  id: string;
  sessionId: string; // Group multiple attempts together
  queryData: {
    equipment: string;
    priority: string;
    description: string;
    options: Record<string, boolean>;
  };
  responseData: any; // The full Solution object
  feedbackRating: 1 | -1 | null; // 1 = thumbs up, -1 = thumbs down, null = no feedback yet
  feedbackComment?: string;
  regenerationCount: number; // Which attempt this is (0 = first, 1 = first regen, etc.)
  isAccepted: boolean; // User explicitly accepted this response
  createdAt: Date;
  updatedAt: Date;
}

// PDR History Record (Spare Parts Usage)
export interface PDRHistory {
  id: string;
  machine: string; // Désignation
  interventionDate: Date; // Date intervention
  failureType: string; // Type de panne
  downtimeHours?: number; // Durée arrêt (h)
  result?: string; // Résultat
  materialCost?: number; // Coût matériel
  partDesignation?: string; // [Pièce].Désignation
  partReference?: string; // [Pièce].Référence
  partQuantity?: number; // [Pièce].Quantité
  customColumns?: Record<string, any>;
}

// Forecast Configuration (Trained Model)
export interface ForecastConfig {
  id: string;
  machine: string;
  partReference: string | 'ALL'; // 'ALL' for all parts forecasting
  model: 'prophet' | 'arima' | 'sarima' | 'gru' | 'auto';
  trainedAt: Date;
  metrics: {
    mape: number; // Mean Absolute Percentage Error
    rmse: number; // Root Mean Square Error
    mae: number;  // Mean Absolute Error
    r2: number;   // R-squared
  };
  parameters?: Record<string, any>;
  trainingDataRange: {
    start: string; // YYYY-MM-DD
    end: string;
  };
}

// Forecast Result
export interface ForecastResult {
  id: string;
  configId: string;
  machine: string;
  partReference: string;
  partDesignation: string;
  forecastPeriod: {
    start: number; // Year
    end: number;   // Year
  };
  predictions: {
    year: number;
    month?: number;
    predicted: number;
    lower: number; // confidence interval lower bound
    upper: number; // confidence interval upper bound
  }[];
  historicalTotal: number; // Total used in training data
  confidence: number; // Overall confidence score
  generatedAt: Date;
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
  aiInteractions!: Table<AIInteraction, string>;
  pdrHistory!: Table<PDRHistory, string>;
  forecastConfigs!: Table<ForecastConfig, string>;
  forecastResults!: Table<ForecastResult, string>;

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
    
    // Version 3: Add AI interactions table for feedback loop
    this.version(3).stores({
      assets: 'id, name, criticality',
      functions: 'id, assetId, name',
      failureModes: 'id, functionId, severity, occurrence, detection, status',
      workOrders: 'id, assetId, assignee, status, startAt, endAt',
      kpis: 'id, assetCode, metricType, period',
      parts: 'id, name, category, status',
      partDemand: 'id, partId, period',
      amdecRawData: 'id, machine, component, failureType',
      aiInteractions: 'id, sessionId, feedbackRating, isAccepted, createdAt'
    });
    
    // Version 4: Add PDR forecasting tables
    this.version(4).stores({
      assets: 'id, name, criticality',
      functions: 'id, assetId, name',
      failureModes: 'id, functionId, severity, occurrence, detection, status',
      workOrders: 'id, assetId, assignee, status, startAt, endAt',
      kpis: 'id, assetCode, metricType, period',
      parts: 'id, name, category, status',
      partDemand: 'id, partId, period',
      amdecRawData: 'id, machine, component, failureType',
      aiInteractions: 'id, sessionId, feedbackRating, isAccepted, createdAt',
      pdrHistory: 'id, machine, partReference, interventionDate',
      forecastConfigs: 'id, machine, partReference, model, trainedAt',
      forecastResults: 'id, configId, machine, partReference, generatedAt'
    });
  }
}

export const db = new LocalGMAODb();

// Expose DB for quick debugging in the browser console (window.gmaoDb)
// Note: Useful because `db` is not defined in the global scope by default.
if (typeof window !== 'undefined') {
  (window as any).gmaoDb = (window as any).gmaoDb || db;
}
