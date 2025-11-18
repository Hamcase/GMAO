import { useLiveQuery } from 'dexie-react-hooks';
import { db, AssetKpi } from './schema';

export function useAssets() {
  return useLiveQuery(() => db.assets.toArray(), []);
}

export function useFunctions(assetId?: string) {
  return useLiveQuery(() => {
    if (assetId) return db.functions.where('assetId').equals(assetId).toArray();
    return db.functions.toArray();
  }, [assetId]);
}

export function useFailureModes(functionId?: string) {
  return useLiveQuery(() => {
    if (functionId) return db.failureModes.where('functionId').equals(functionId).toArray();
    return db.failureModes.toArray();
  }, [functionId]);
}

export function useAllFailureModes() {
  return useLiveQuery(() => db.failureModes.toArray(), []);
}

export function useWorkOrders(assetId?: string) {
  return useLiveQuery(() => {
    if (assetId) return db.workOrders.where('assetId').equals(assetId).toArray();
    return db.workOrders.toArray();
  }, [assetId]);
}

export function useKpis(assetCode?: string, period?: string) {
  return useLiveQuery(async () => {
    let rows: AssetKpi[] = await db.kpis.toArray();
    if (assetCode) rows = rows.filter(r => r.assetCode === assetCode);
    if (period) rows = rows.filter(r => r.period === period);
    return rows;
  }, [assetCode, period]);
}

export function useParts() {
  return useLiveQuery(() => db.parts.toArray(), []);
}

export function usePartDemand(partId?: string) {
  return useLiveQuery(() => {
    if (partId) return db.partDemand.where('partId').equals(partId).toArray();
    return db.partDemand.toArray();
  }, [partId]);
}

export function useAMDECRawData(machine?: string) {
  return useLiveQuery(() => {
    if (machine) return db.amdecRawData.where('machine').equals(machine).toArray();
    return db.amdecRawData.toArray();
  }, [machine]);
}

// Aggregated helpers
export function useAggregatedKpiAverages() {
  return useLiveQuery(async () => {
    const rows: AssetKpi[] = await db.kpis.toArray();
    if (!rows.length) return { mtbf: null, mttr: null, availability: null };
    const mtbfVals: number[] = [];
    const mttrVals: number[] = [];
    const availVals: number[] = [];
    rows.forEach(r => {
      if (r.metricType === 'mtbf') mtbfVals.push(r.metricValue);
      else if (r.metricType === 'mttr') mttrVals.push(r.metricValue);
      else if (r.metricType === 'availability') availVals.push(r.metricValue);
    });
    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    return { mtbf: avg(mtbfVals), mttr: avg(mttrVals), availability: avg(availVals) };
  }, []);
}
