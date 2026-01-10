import { z } from 'zod';
import { Home, LayoutDashboard, Scan, MessageSquare, Bot, Package, Activity, User, Upload, Brain } from 'lucide-react';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navigation: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Dashboard', href: '/home/dashboard', icon: LayoutDashboard },
  { label: 'Insights', href: '/home/insights', icon: Brain },
  { label: 'Upload Data', href: '/home/upload', icon: Upload },
  { label: 'OCR', href: '/home/test-ocr', icon: Scan },
  { label: 'Chatbot', href: '/home/chat', icon: MessageSquare },
  { label: 'Gen AI', href: '/home/gen-ai', icon: Bot },
  { label: 'PDR', href: '/home/pdr', icon: Package },
  { label: 'AMDEC', href: '/home/amdec', icon: Activity },
];

const routes = [
  {
    label: 'common:routes.application',
    children: [
      {
        label: 'Accueil',
        path: pathsConfig.app.home,
        Icon: <Home className={iconClasses} />,
        end: true,
      },
      {
        label: 'Dashboard',
        path: '/home/dashboard',
        Icon: <LayoutDashboard className={iconClasses} />,
      },
      {
        label: 'Insights',
        path: '/home/insights',
        Icon: <Brain className={iconClasses} />,
      },
      {
        label: 'Upload Data',
        path: '/home/upload',
        Icon: <Upload className={iconClasses} />,
      },
      {
        label: 'OCR',
        path: '/home/test-ocr',
        Icon: <Scan className={iconClasses} />,
      },
      {
        label: 'Chatbot',
        path: '/home/chat',
        Icon: <MessageSquare className={iconClasses} />,
      },
      {
        label: 'Gen AI',
        path: '/home/gen-ai',
        Icon: <Bot className={iconClasses} />,
      },
      {
        label: 'PDR',
        path: '/home/pdr',
        Icon: <Package className={iconClasses} />,
      },
      {
        label: 'AMDEC',
        path: '/home/amdec',
        Icon: <Activity className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.settings',
    children: [
      {
        label: 'common:routes.profile',
        path: pathsConfig.app.profileSettings,
        Icon: <User className={iconClasses} />,
      },
    ],
  },
] satisfies z.infer<typeof NavigationConfigSchema>['routes'];

export const navigationConfig = NavigationConfigSchema.parse({
  routes,
  style: process.env.NEXT_PUBLIC_NAVIGATION_STYLE,
  sidebarCollapsed: process.env.NEXT_PUBLIC_HOME_SIDEBAR_COLLAPSED,
});

export default navigation;
