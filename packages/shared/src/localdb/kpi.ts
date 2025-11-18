import { db, WorkOrder, AssetKpi } from './schema';
import { v4 as uuid } from 'uuid';

// Recalculate KPIs (MTBF, MTTR, Availability) from current work orders in DB.
// Assumptions:
// - Corrective/emergency work orders count as failures
// - downtimeMinutes represents repair duration (MTTR input)
// - Availability approximated as: 100 - (downtimeMinutes / (periodMinutes)) * 100 per asset per period
//   periodMinutes is approximated as daysInPeriod * 24 * 60.
export async function recalcKpis() {
  const workOrders = await db.workOrders.toArray();
  if (!workOrders.length) return;

  // Bucket by asset + period (YYYY-MM)
  const buckets: Record<string, WorkOrder[]> = {};
  workOrders.forEach((wo: WorkOrder) => {
    if (!wo.startAt) return;
    const d = wo.startAt instanceof Date ? wo.startAt : new Date(wo.startAt);
    const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const key = `${wo.assetId || 'unknown'}|${period}`;
    (buckets[key] ||= []).push(wo);
  });

  const kpiRows: AssetKpi[] = [];

  Object.entries(buckets).forEach(([key, rows]) => {
    const [assetCode, period] = key.split('|');
    const failureTimestamps = rows
      .filter(r => (r.type||'').toLowerCase() === 'corrective' || (r.type||'').toLowerCase() === 'emergency')
      .map(r => (r.startAt instanceof Date ? r.startAt.getTime() : new Date(r.startAt as any).getTime()))
      .sort((a,b)=>a-b);

    // MTBF
    let mtbf: number | null = null;
    if (failureTimestamps.length >= 2) {
      const deltas: number[] = [];
      for (let i=1;i<failureTimestamps.length;i++) {
        const curr = failureTimestamps[i];
        const prev = failureTimestamps[i-1];
        if (curr != null && prev != null) {
          deltas.push((curr - prev) / 3600000);
        }
      }
      if (deltas.length) mtbf = deltas.reduce((a,b)=>a+b,0)/deltas.length;
    }

    // MTTR
    const mttrBase = rows
      .filter(r => r.downtimeMinutes && r.downtimeMinutes > 0)
      .map(r => r.downtimeMinutes as number);
    const mttr = mttrBase.length ? (mttrBase.reduce((a,b)=>a+b,0) / mttrBase.length) / 60 : null; // hours

    // Availability (rough): total downtime / theoretical period minutes
    const downtimeTotal = mttrBase.reduce((a,b)=>a+b,0); // minutes
    const daysInPeriod = 30; // approximation
    const periodMinutes = daysInPeriod * 24 * 60;
    const availability = periodMinutes > 0 ? Math.max(0, 100 - (downtimeTotal / periodMinutes) * 100) : null;

    const recordedAt = new Date();
    const safeAssetCode: string = (assetCode && typeof assetCode === 'string') ? assetCode : 'unknown';
    const safePeriod: string = (period && typeof period === 'string') ? period : 'unknown';
    if (mtbf != null) kpiRows.push({ id: uuid(), assetCode: safeAssetCode, metricType: 'mtbf', metricValue: Number(mtbf.toFixed(2)), period: safePeriod, recordedAt });
    if (mttr != null) kpiRows.push({ id: uuid(), assetCode: safeAssetCode, metricType: 'mttr', metricValue: Number(mttr.toFixed(2)), period: safePeriod, recordedAt });
    if (availability != null) kpiRows.push({ id: uuid(), assetCode: safeAssetCode, metricType: 'availability', metricValue: Number(availability.toFixed(2)), period: safePeriod, recordedAt });
  });

  // Clear existing KPIs for these periods/assets before inserting (simple approach)
  const existing = await db.kpis.toArray();
  const newKeys = new Set(kpiRows.map(r => `${r.assetCode}|${r.period}|${r.metricType}`));
  const filtered = existing.filter((r: AssetKpi) => !newKeys.has(`${r.assetCode}|${r.period}|${r.metricType}`));

  await db.kpis.clear();
  await db.kpis.bulkAdd([...filtered, ...kpiRows]);
}
