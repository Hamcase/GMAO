import { db } from './schema';

export async function exportLocalDb(): Promise<Blob> {
  const payload = {
    assets: await db.assets.toArray(),
    functions: await db.functions.toArray(),
    failureModes: await db.failureModes.toArray(),
    workOrders: await db.workOrders.toArray(),
    kpis: await db.kpis.toArray(),
    parts: await db.parts.toArray(),
    partDemand: await db.partDemand.toArray(),
    exportedAt: new Date().toISOString()
  };
  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export async function importLocalDb(jsonText: string) {
  const data = JSON.parse(jsonText);
  await db.transaction('rw', [db.assets, db.functions, db.failureModes, db.workOrders, db.kpis, db.parts, db.partDemand], async () => {
    await db.assets.clear();
    await db.functions.clear();
    await db.failureModes.clear();
    await db.workOrders.clear();
    await db.kpis.clear();
    await db.parts.clear();
    await db.partDemand.clear();

    if (Array.isArray(data.assets)) await db.assets.bulkAdd(data.assets);
    if (Array.isArray(data.functions)) await db.functions.bulkAdd(data.functions);
    if (Array.isArray(data.failureModes)) await db.failureModes.bulkAdd(data.failureModes);
    if (Array.isArray(data.workOrders)) await db.workOrders.bulkAdd(data.workOrders);
    if (Array.isArray(data.kpis)) await db.kpis.bulkAdd(data.kpis);
    if (Array.isArray(data.parts)) await db.parts.bulkAdd(data.parts);
    if (Array.isArray(data.partDemand)) await db.partDemand.bulkAdd(data.partDemand);
  });
}
