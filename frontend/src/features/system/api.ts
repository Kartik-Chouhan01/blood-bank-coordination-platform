import type { HealthStatus } from '@bbms/shared';
import { apiGet } from '@/services/httpClient';

export const fetchHealth = () => apiGet<HealthStatus>('/health');
