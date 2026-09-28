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
import { AdminHomePage } from '@/features/dashboard/pages/HomePages';
import { HospitalOverviewPage } from '@/features/hospital/pages/HospitalOverviewPage';
import { HospitalProfilePage } from '@/features/hospital/pages/HospitalProfilePage';
import { HospitalsPage } from '@/features/admin/pages/HospitalsPage';
import { HospitalDetailPage } from '@/features/admin/pages/HospitalDetailPage';
import { BloodBanksPage } from '@/features/admin/pages/BloodBanksPage';
import { AuditLogPage } from '@/features/admin/pages/AuditLogPage';
import { AcceptInvitePage } from '@/features/auth/pages/AcceptInvitePage';
import { DonorOverviewPage } from '@/features/donor/pages/DonorOverviewPage';
import { DonorProfilePage } from '@/features/donor/pages/DonorProfilePage';
import { DonorDonationsPage } from '@/features/donor/pages/DonorDonationsPage';
import { DonorSettingsPage } from '@/features/donor/pages/DonorSettingsPage';
import { DonorsPage } from '@/features/admin/pages/DonorsPage';
import { DonorDetailPage } from '@/features/admin/pages/DonorDetailPage';
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
          { path: 'accept-invite', element: <AcceptInvitePage /> },
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
            children: [
              { index: true, element: <DonorOverviewPage /> },
              { path: 'profile', element: <DonorProfilePage /> },
              { path: 'donations', element: <DonorDonationsPage /> },
              { path: 'settings', element: <DonorSettingsPage /> },
            ],
          },
          {
            path: 'hospital',
            element: <RequirePermission permission="hospital:self" />,
            children: [
              { index: true, element: <HospitalOverviewPage /> },
              { path: 'profile', element: <HospitalProfilePage /> },
            ],
          },
          {
            path: 'admin',
            element: <RequirePermission permission="inventory:read" />,
            children: [
              { index: true, element: <AdminHomePage /> },
              {
                path: 'donors',
                element: <RequirePermission permission="donors:read" />,
                children: [
                  { index: true, element: <DonorsPage /> },
                  { path: ':id', element: <DonorDetailPage /> },
                ],
              },
              {
                path: 'hospitals',
                element: <RequirePermission permission="hospitals:read" />,
                children: [
                  { index: true, element: <HospitalsPage /> },
                  { path: ':id', element: <HospitalDetailPage /> },
                ],
              },
              {
                path: 'blood-banks',
                element: <RequirePermission permission="bloodBanks:read" />,
                children: [{ index: true, element: <BloodBanksPage /> }],
              },
              {
                path: 'audit-logs',
                element: <RequirePermission permission="audit:read" />,
                children: [{ index: true, element: <AuditLogPage /> }],
              },
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
