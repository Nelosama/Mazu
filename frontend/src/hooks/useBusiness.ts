import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { BusinessDetail, Role, Service, Staff } from '@/services/types';
import { useAuth } from '@/features/auth/AuthContext';

/** Negocio activo del panel (según :businessId) y rol del usuario en él. */
export function useBusiness() {
  const { businessId = '' } = useParams();
  const { me } = useAuth();
  const membership = me?.memberships.find((m) => m.business.id === businessId) ?? null;
  const detail = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => api<BusinessDetail>(`/businesses/${businessId}`),
    enabled: Boolean(membership),
  });
  const role: Role | null = membership?.role ?? null;
  return {
    businessId,
    membership,
    role,
    canManage: role === 'OWNER' || role === 'ADMIN',
    business: detail.data ?? null,
    isLoading: detail.isLoading,
  };
}

export function useStaffList(businessId: string) {
  return useQuery({
    queryKey: ['staff', businessId],
    queryFn: () => api<Staff[]>(`/businesses/${businessId}/staff`),
  });
}

export function useServiceList(businessId: string) {
  return useQuery({
    queryKey: ['services', businessId],
    queryFn: () => api<Service[]>(`/businesses/${businessId}/services`),
  });
}
