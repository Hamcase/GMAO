import { Package } from 'lucide-react';

export default function PDRPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold"><Package className="h-6 w-6" /> Pièces de rechange (PDR)</h1>
      <p className="mb-6 text-zinc-500">Stocks, mouvements et fournisseurs (à venir).</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Recherche</div>
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Stocks</div>
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Fournisseurs</div>
      </div>
    </div>
  );
}