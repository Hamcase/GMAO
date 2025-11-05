import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';

export default function DashboardPage() {
  return (
    <div className="flex flex-col space-y-4 pb-36">
      <AppBreadcrumbs values={{ Dashboard: '/' }} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Interventions en cours"
          value="12"
          description="+2 depuis hier"
          icon="📋"
        />
        <DashboardCard
          title="Taux de disponibilité"
          value="94.2%"
          description="+1.3% ce mois"
          icon="✅"
        />
        <DashboardCard
          title="Temps moyen réparation"
          value="2.4h"
          description="-0.5h vs mois dernier"
          icon="⏱️"
        />
        <DashboardCard
          title="Coûts maintenance"
          value="45K€"
          description="Budget mensuel"
          icon="💰"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Équipements critiques</h3>
          <div className="space-y-3">
            <EquipmentStatus name="Compresseur A1" status="maintenance" />
            <EquipmentStatus name="Pompe B2" status="ok" />
            <EquipmentStatus name="Moteur C3" status="warning" />
            <EquipmentStatus name="Convoyeur D4" status="ok" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Interventions planifiées</h3>
          <div className="space-y-3">
            <PlannedIntervention
              equipment="Ligne production 1"
              date="15/11/2025"
              type="Préventif"
            />
            <PlannedIntervention
              equipment="Groupe électrogène"
              date="18/11/2025"
              type="Révision"
            />
            <PlannedIntervention
              equipment="Système CVC"
              date="22/11/2025"
              type="Préventif"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function EquipmentStatus({
  name,
  status,
}: {
  name: string;
  status: 'ok' | 'warning' | 'maintenance';
}) {
  const statusConfig = {
    ok: { color: 'bg-green-500', label: 'Opérationnel' },
    warning: { color: 'bg-yellow-500', label: 'Attention' },
    maintenance: { color: 'bg-red-500', label: 'En maintenance' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="font-medium">{name}</span>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${config.color}`} />
        <span className="text-xs text-muted-foreground">{config.label}</span>
      </div>
    </div>
  );
}

function PlannedIntervention({
  equipment,
  date,
  type,
}: {
  equipment: string;
  date: string;
  type: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <p className="font-medium">{equipment}</p>
        <p className="text-xs text-muted-foreground">{type}</p>
      </div>
      <span className="text-sm text-muted-foreground">{date}</span>
    </div>
  );
}