import type { RouteObject } from 'react-router';
import { PublicLayout } from '@/layouts/PublicLayout';
import { LandingPage } from '@/features/public/pages/LandingPage';
import { AboutPage, HelpPage, HowItWorksPage } from '@/features/public/pages/InfoPages';
import { ComingSoonPage, NotFoundPage, RouteErrorPage } from '@/pages/ErrorPages';

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'how-it-works', element: <HowItWorksPage /> },
      { path: 'help', element: <HelpPage /> },
      // Phase 2 (authentication) replaces these placeholders.
      { path: 'login', element: <ComingSoonPage feature="Sign in" /> },
      { path: 'register/*', element: <ComingSoonPage feature="Registration" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
