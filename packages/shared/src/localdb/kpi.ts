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
  console.log(`🔄 recalcKpis: Processing ${workOrders.length} work orders`);
  if (!workOrders.length) {
    console.log('⚠️ No work orders found - skipping KPI calculation');
    return;
  }

  // Strategy: Calculate MTBF per machine across ALL TIME (not per period)
  // because we need multiple failures to get meaningful intervals
  
  // Group by machine to get all failures per machine
  const byMachine: Record<string, WorkOrder[]> = {};
  workOrders.forEach((wo: WorkOrder) => {
    const assetKey = wo.assetId || wo.customColumns?.asset || wo.customColumns?.machine || 'unknown';
    (byMachine[assetKey] ||= []).push(wo);
  });

  console.log(`📊 Analyzing ${Object.keys(byMachine).length} machines for MTBF/MTTR`);
  
  // Calculate global MTBF and MTTR per machine (across all time)
  const machineKpis: Record<string, { mtbf?: number; mttr?: number }> = {};
  
  Object.entries(byMachine).forEach(([assetCode, allOrders]) => {
    // Sort by date
    const sorted = allOrders
      .filter(wo => wo.startAt)
      .sort((a, b) => {
        const aTime = a.startAt instanceof Date ? a.startAt.getTime() : new Date(a.startAt!).getTime();
        const bTime = b.startAt instanceof Date ? b.startAt.getTime() : new Date(b.startAt!).getTime();
        return aTime - bTime;
      });
    
    // Get failure timestamps
    // NOTE: User's CSV has failure CATEGORIES (mécanique, électrique, etc.) not types (corrective/preventive)
    // So we treat ALL work orders as failures for MTBF calculation
    const failureTimestamps = sorted
      .filter(r => r.startAt) // Just need a valid start date
      .map(r => (r.startAt instanceof Date ? r.startAt.getTime() : new Date(r.startAt!).getTime()));
    
    console.log(`🔧 ${assetCode}: ${sorted.length} work orders (all treated as failures for MTBF)`);
    
    // Calculate MTBF from failure intervals
    let mtbf: number | null = null;
    if (failureTimestamps.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < failureTimestamps.length; i++) {
        deltas.push((failureTimestamps[i]! - failureTimestamps[i-1]!) / 3600000); // hours
      }
      mtbf = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      console.log(`  ✅ MTBF: ${mtbf.toFixed(1)}h (${deltas.length} intervals between ${failureTimestamps.length} work orders)`);
    } else if (failureTimestamps.length === 1) {
      // Single failure: estimate MTBF as time from first work order to failure
      const firstTime = sorted[0]!.startAt instanceof Date ? sorted[0]!.startAt.getTime() : new Date(sorted[0]!.startAt!).getTime();
      mtbf = (failureTimestamps[0]! - firstTime) / 3600000;
      console.log(`  ⚠️  MTBF: ${mtbf.toFixed(1)}h (estimated from 1 work order)`);
    } else {
      console.log(`  ❌ No MTBF: no work orders with dates`);
    }
    
    // Calculate MTTR from downtime
    const mttrBase = sorted
      .filter(r => r.downtimeMinutes && r.downtimeMinutes > 0)
      .map(r => r.downtimeMinutes as number);
    const mttr = mttrBase.length ? (mttrBase.reduce((a,b)=>a+b,0) / mttrBase.length) / 60 : null;
    
    if (mttr) {
      console.log(`  ✅ MTTR: ${mttr.toFixed(1)}h (from ${mttrBase.length} work orders with downtime)`);
    } else {
      console.log(`  ❌ No MTTR: no downtime data`);
    }
    
    if (mtbf || mttr) {
      machineKpis[assetCode] = { mtbf: mtbf || undefined, mttr: mttr || undefined };
    }
  });

  // Now create period-based KPI records (duplicate the same MTBF/MTTR for each period)
  const buckets: Record<string, WorkOrder[]> = {};
  workOrders.forEach((wo: WorkOrder) => {
    if (!wo.startAt) return;
    const d = wo.startAt instanceof Date ? wo.startAt : new Date(wo.startAt);
    const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const assetKey = wo.assetId || wo.customColumns?.asset || wo.customColumns?.machine || 'unknown';
    const key = `${assetKey}|${period}`;
    (buckets[key] ||= []).push(wo);
  });

  const kpiRows: AssetKpi[] = [];
  const recordedAt = new Date();
  
  Object.keys(buckets).forEach(key => {
    const [assetCode, period] = key.split('|');
    if (!assetCode || !period) return;
    
    const kpis = machineKpis[assetCode];
    if (!kpis) return;
    
    // Add MTBF and MTTR for this period using the machine-wide values
    if (kpis.mtbf) {
      kpiRows.push({ 
        id: uuid(), 
        assetCode, 
        metricType: 'mtbf', 
        metricValue: Number(kpis.mtbf.toFixed(2)), 
        period, 
        recordedAt 
      });
    }
    if (kpis.mttr) {
      kpiRows.push({ 
        id: uuid(), 
        assetCode, 
        metricType: 'mttr', 
        metricValue: Number(kpis.mttr.toFixed(2)), 
        period, 
        recordedAt 
      });
    }
  });

  console.log(`💾 Inserting/updating ${kpiRows.length} KPI records`);

  // Upsert: only update MTBF/MTTR, never touch availability
  for (const row of kpiRows) {
    const existingForAsset = await db.kpis.where('assetCode').equals(row.assetCode).toArray();
    const match = existingForAsset.find(r => r.period === row.period && r.metricType === row.metricType);
    if (match) {
      await db.kpis.update(match.id, { 
        metricValue: row.metricValue, 
        recordedAt: row.recordedAt, 
        customColumns: { ...(match.customColumns||{}), source: 'computed' } 
      });
      console.log(`  🔄 Updated ${row.metricType} for ${row.assetCode} (${row.period}): ${row.metricValue.toFixed(1)}`);
    } else {
      await db.kpis.add({ ...row, customColumns: { source: 'computed' } });
      console.log(`  ➕ Added ${row.metricType} for ${row.assetCode} (${row.period}): ${row.metricValue.toFixed(1)}`);
    }
  }
  
  console.log(`✅ recalcKpis complete: ${kpiRows.length} KPIs processed`);
}
