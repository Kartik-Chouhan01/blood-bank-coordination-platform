import type {
  AnalyticsQuery,
  AnalyticsReport,
  HospitalDashboard,
  PublicStats,
  StaffOverview,
} from '@bbms/shared';
import { apiGet } from '@/services/httpClient';

export const dashboardApi = {
  publicStats: () => apiGet<PublicStats>('/dashboard/public-stats'),
  overview: (bloodBankId?: string) =>
    apiGet<StaffOverview>('/dashboard/overview', bloodBankId ? { bloodBankId } : undefined),
  analytics: (query: AnalyticsQuery) =>
    apiGet<AnalyticsReport>('/dashboard/analytics', {
      days: query.days,
      ...(query.bloodBankId && { bloodBankId: query.bloodBankId }),
    }),
  hospital: () => apiGet<HospitalDashboard>('/dashboard/hospital'),
};
