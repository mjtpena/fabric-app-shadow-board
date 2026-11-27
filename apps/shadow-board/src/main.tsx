import { CalendarPlus, ClipboardCheck, HardDrive, Info, LayoutGrid, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const icons: Record<string, ReactNode> = {
  '/': <LayoutGrid />,
  '/reserve': <CalendarPlus />,
  '/desk': <ClipboardCheck />,
  '/reimage': <Wrench />,
  '/audit': <HardDrive />,
  '/about': <Info />,
};

mountApp(
  {
    ...config,
    nav: config.nav.map((item) => ({ ...item, icon: icons[item.to] })),
  },
  <App />,
);
