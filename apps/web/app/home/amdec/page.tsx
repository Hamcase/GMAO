import { Activity } from 'lucide-react';

export default function AMDECPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold"><Activity className="h-6 w-6" /> AMDEC</h1>
      <p className="mb-6 text-zinc-500">Analyses des modes de défaillance (à venir).</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Nouveau Système</div>
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Bibliothèque</div>
        <div className="rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">Recommandations</div>
      </div>
    </div>
  );
}