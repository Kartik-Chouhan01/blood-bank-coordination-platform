import type { RouteObject } from 'react-router';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LandingPage } from '@/features/public/pages/LandingPage';
import { AboutPage, HelpPage, HowItWorksPage } from '@/features/public/pages/InfoPages';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterChoicePage } from '@/features/auth/pages/RegisterChoicePage';
import { RegisterDonorPage } from '@/features/auth/pages/RegisterDonorPage';
import { RegisterHospitalPage } from '@/features/auth/pages/RegisterHospitalPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { AccountPage } from '@/features/account/pages/AccountPage';
import {
  AdminHomePage,
  DonorHomePage,
  HospitalHomePage,
} from '@/features/dashboard/pages/HomePages';
import { UsersPage } from '@/features/admin/pages/UsersPage';
import { NotFoundPage, RouteErrorPage } from '@/pages/ErrorPages';
import { GuestOnly, RequireAuth, RequirePermission } from './guards';

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'how-it-works', element: <HowItWorksPage /> },
          { path: 'help', element: <HelpPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <GuestOnly />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterChoicePage /> },
              { path: 'register/donor', element: <RegisterDonorPage /> },
              { path: 'register/hospital', element: <RegisterHospitalPage /> },
              { path: 'forgot-password', element: <ForgotPasswordPage /> },
            ],
          },
          // Reachable whether or not the user is signed in (links arrive by email).
          { path: 'verify-email', element: <VerifyEmailPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        element: (
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        ),
        children: [
          { path: 'account', element: <AccountPage /> },
          {
            path: 'donor',
            element: <RequirePermission permission="donor:self" />,
            children: [{ index: true, element: <DonorHomePage /> }],
          },
          {
            path: 'hospital',
            element: <RequirePermission permission="hospital:self" />,
            children: [{ index: true, element: <HospitalHomePage /> }],
          },
          {
            path: 'admin',
            element: <RequirePermission permission="inventory:read" />,
            children: [
              { index: true, element: <AdminHomePage /> },
              {
                path: 'users',
                element: <RequirePermission permission="users:read" />,
                children: [{ index: true, element: <UsersPage /> }],
              },
            ],
          },
        ],
      },
      { element: <PublicLayout />, children: [{ path: '*', element: <NotFoundPage /> }] },
    ],
  },
];
