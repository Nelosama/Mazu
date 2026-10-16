import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { Role } from '@/services/types';
import { useBusiness, useStaffList } from '@/hooks/useBusiness';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  PageLoader,
  Select,
  useToast,
} from '@/components/ui';

interface Member {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  user: { id: string; name: string; email: string };
  staff: { id: string; name: string } | null;
}

export function TeamPage() {
  const { t } = useTranslation();
  const { businessId, role } = useBusiness();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const staffQ = useStaffList(businessId);
  const q = useQuery({
    queryKey: ['members', businessId],
    queryFn: () => api<Member[]>(`/businesses/${businessId}/members`),
  });
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'STAFF' as Role,
    staffId: '',
  });

  const add = useMutation({
    mutationFn: () =>
      api(`/businesses/${businessId}/members`, {
        body: {
          ...form,
          name: form.name || undefined,
          password: form.password || undefined,
          staffId: form.staffId || undefined,
        },
      }),
    onSuccess: () => {
      setForm({ email: '', name: '', password: '', role: 'STAFF', staffId: '' });
      void qc.invalidateQueries({ queryKey: ['members', businessId] });
      toast(t('team.added'));
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      role?: Role;
      status?: string;
      staffId?: string | null;
    }) => api(`/businesses/${businessId}/members/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members', businessId] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.isLoading) return <PageLoader label={t('common.loading')} />;
  const roles: Role[] = role === 'OWNER' ? ['OWNER', 'ADMIN', 'STAFF'] : ['ADMIN', 'STAFF'];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('team.title')} subtitle={t('team.subtitle')} />
      <Card className="divide-y divide-gray-100">
        {(q.data ?? []).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">
                {m.user.name} {m.status === 'INACTIVE' && <Badge>{t('common.inactive')}</Badge>}
              </p>
              <p className="truncate text-sm text-gray-500">{m.user.email}</p>
            </div>
            <select
              aria-label={t('team.role')}
              value={m.role}
              disabled={!roles.includes(m.role)}
              onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })}
              className="h-9 rounded-lg border-0 py-0 pl-2 pr-7 text-sm ring-1 ring-gray-300"
            >
              {(['OWNER', 'ADMIN', 'STAFF'] as const).map((r) => (
                <option key={r} value={r} disabled={!roles.includes(r)}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('team.linkedStaff')}
              value={m.staff?.id ?? ''}
              onChange={(e) => update.mutate({ id: m.id, staffId: e.target.value || null })}
              className="h-9 rounded-lg border-0 py-0 pl-2 pr-7 text-sm ring-1 ring-gray-300"
            >
              <option value="">{t('team.noStaff')}</option>
              {(staffQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-900"
              onClick={() =>
                update.mutate({ id: m.id, status: m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
              }
            >
              {m.status === 'ACTIVE' ? t('team.deactivate') : t('team.activate')}
            </button>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-gray-900">{t('team.addTitle')}</h2>
        <p className="mb-4 mt-0.5 text-sm text-gray-500">{t('team.addHint')}</p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            label={t('auth.email')}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={t('team.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label={t('team.initialPassword')}
            type="password"
            minLength={10}
            hint={t('team.initialPasswordHint')}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label={t('team.role')}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('team.linkedStaff')}
            value={form.staffId}
            onChange={(e) => setForm({ ...form, staffId: e.target.value })}
          >
            <option value="">{t('team.noStaff')}</option>
            {(staffQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            {add.isError && (
              <div className="mb-3">
                <Alert>{errorMessage(add.error)}</Alert>
              </div>
            )}
            <Button type="submit" loading={add.isPending}>
              {t('team.add')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
