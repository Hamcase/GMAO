import { PageBody } from '@kit/ui/page';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import Link from 'next/link';
import { 
  Wrench,
  MessageSquare,
  Cpu,
  Package,
  Activity,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Brain,
} from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      title: 'Dashboard',
      description: 'Tableau de bord complet avec KPIs, ordres de travail et alertes en temps réel',
      icon: LayoutDashboard,
      href: '/home/dashboard',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Chatbot IA',
      description: 'Assistant intelligent basé sur vos documents avec RAG et Mistral AI',
      icon: MessageSquare,
      href: '/home/chat',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Gen AI',
      description: 'Outils d\'IA générative pour automatiser vos processus',
      icon: Cpu,
      href: '/home/gen-ai',
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
    {
      title: 'Pièces de Rechange',
      description: 'Gestion intelligente de votre stock de pièces détachées',
      icon: Package,
      href: '/home/pdr',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950',
    },
    {
      title: 'AMDEC',
      description: 'Analyse des modes de défaillance et criticité des équipements',
      icon: Activity,
      href: '/home/amdec',
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-950',
    },
    {
      title: 'Insights & Analytics',
      description: 'Analyse des techniciens, santé des machines et prédictions de maintenance',
      icon: Brain,
      href: '/home/insights',
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950',
    },
  ];

  return (
    <PageBody>
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Plateforme GMAO Nouvelle Génération</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Bienvenue sur{' '}
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              GMAO Platform
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Votre solution complète de gestion de maintenance assistée par intelligence artificielle.
            Optimisez vos opérations, réduisez les temps d&apos;arrêt et améliorez la performance de vos équipements.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link href="/home/dashboard">
              <Button size="lg" className="gap-2">
                <LayoutDashboard className="h-5 w-5" />
                Accéder au Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/home/chat">
              <Button size="lg" variant="outline" className="gap-2">
                <MessageSquare className="h-5 w-5" />
                Essayer le Chatbot IA
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="w-full max-w-6xl mx-auto px-4 pt-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Fonctionnalités Principales</h2>
            <p className="text-muted-foreground">Explorez tous les outils disponibles pour optimiser votre maintenance</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link key={feature.href} href={feature.href}>
                  <Card className="h-full transition-all hover:shadow-lg hover:scale-105 cursor-pointer border-2 hover:border-primary/50">
                    <CardHeader>
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${feature.bgColor} mb-3`}>
                        <Icon className={`h-6 w-6 ${feature.color}`} />
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center text-sm text-primary font-medium">
                        Découvrir
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Stats Section */}
        <div className="w-full max-w-6xl mx-auto px-4 pt-12">
          <Card className="bg-gradient-to-r from-primary/5 to-purple-600/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="grid gap-8 md:grid-cols-3 text-center">
                <div className="space-y-2">
                  <div className="text-3xl md:text-4xl font-bold text-primary">
                    <Wrench className="inline h-8 w-8 mb-1" /> 24/7
                  </div>
                  <p className="text-sm text-muted-foreground">Surveillance continue de vos équipements</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl md:text-4xl font-bold text-primary">
                    <Cpu className="inline h-8 w-8 mb-1" /> IA
                  </div>
                  <p className="text-sm text-muted-foreground">Powered by Mistral AI & RAG</p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl md:text-4xl font-bold text-primary">
                    <Activity className="inline h-8 w-8 mb-1" /> Smart
                  </div>
                  <p className="text-sm text-muted-foreground">Analyses prédictives et automatisées</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}
