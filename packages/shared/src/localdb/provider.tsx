'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from './schema';

interface LocalDbContextValue {
  ready: boolean;
  clear: () => Promise<void>;
}

const LocalDbContext = createContext<LocalDbContextValue | undefined>(undefined);

export function LocalDbProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Dexie initializes lazily; we can perform a trivial read to ensure it's open
    db.assets.count().then(() => setReady(true));
  }, []);

  const clear = async () => {
    await db.assets.clear();
    await db.functions.clear();
    await db.failureModes.clear();
    await db.workOrders.clear();
    await db.kpis.clear();
    await db.parts.clear();
    await db.partDemand.clear();
  };

  return (
    <LocalDbContext.Provider value={{ ready, clear }}>
      {children}
    </LocalDbContext.Provider>
  );
}

export function useLocalDb() {
  const ctx = useContext(LocalDbContext);
  if (!ctx) throw new Error('useLocalDb must be used within LocalDbProvider');
  return ctx;
}
