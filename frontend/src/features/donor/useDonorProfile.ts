import { useApiQuery } from '@/hooks/useApiQuery';
import { donorSelfApi } from './api';

export function useDonorProfile() {
  return useApiQuery(donorSelfApi.get);
}
