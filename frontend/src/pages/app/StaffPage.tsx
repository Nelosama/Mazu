import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { Staff } from '@/services/types';
import { useBusiness, useServiceList, useStaffList } from '@/hooks/useBusiness';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Sheet,
  Textarea,
  useToast,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/features/booking/Avatar';
import { ImageUpload } from '@/features/catalog/ImageUpload';

const empty = {
  name: '',
  specialty: '',
  bio: '',
  commissionPercent: '',
  active: true,
  serviceIds: [] as string[],
};

export function StaffPage() {
  const { t } = useTranslation();
  const { businessId, canManage, membership } = useBusiness();
  const staffQ = useStaffList(businessId);
  const servicesQ = useServiceList(businessId);
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);

  if (staffQ.isLoading) return <PageLoader label={t('common.loading')} />;
  const staff = staffQ.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Icon name="plus" className="h-4 w-4" />
              {t('staff.add')}
            </Button>
          )
        }
      />
      {staff.length === 0 ? (
        <EmptyState
          icon={<Icon name="users" className="h-10 w-10" />}
          title={t('staff.emptyTitle')}
          description={t('staff.emptyText')}
          action={canManage && <Button onClick={() => setEditing('new')}>{t('staff.add')}</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200"
            >
              <Avatar name={s.name} url={s.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">
                  {s.name} {!s.active && <Badge>{t('common.inactive')}</Badge>}
                </p>
                <p className="truncate text-sm text-gray-500">
                  {s.specialty ?? t('staff.servicesCount', { count: s.serviceIds.length })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {(canManage || membership?.staffId === s.id) && (
                  <Link to={s.id + '/schedule'} className="text-sm font-semibold text-brand-ink">
                    {t('staff.schedule')}
                  </Link>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setEditing(s)}
                  >
                    {t('common.edit')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <StaffSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        businessId={businessId}
        editing={editing}
        onClose={() => setEditing(null)}
        services={servicesQ.data ?? []}
      />
    </div>
  );
}

function StaffSheet({
  businessId,
  editing,
  onClose,
  services,
}: {
  businessId: string;
  editing: Staff | 'new' | null;
  onClose: () => void;
  services: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState(() =>
    editing && editing !== 'new'
      ? {
          name: editing.name,
          specialty: editing.specialty ?? '',
          bio: editing.bio ?? '',
          commissionPercent: editing.commissionPercent ?? '',
          active: editing.active,
          serviceIds: editing.serviceIds,
        }
      : { ...empty, serviceIds: services.map((s) => s.id) },
  );
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name,
        specialty: form.specialty || undefined,
        bio: form.bio || undefined,
        serviceIds: form.serviceIds,
        commissionPercent:
          form.commissionPercent === ''
            ? editing === 'new'
              ? undefined
              : null
            : Number(form.commissionPercent),
      };
      if (editing === 'new')
        return api(`/businesses/${businessId}/staff`, {
          body: { ...body, withDefaultSchedule: true },
        });
      return api(`/businesses/${businessId}/staff/${(editing as Staff).id}`, {
        method: 'PATCH',
        body: { ...body, active: form.active },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff', businessId] });
      void qc.invalidateQueries({ queryKey: ['services', businessId] });
      toast(t('common.saved'));
      onClose();
    },
  });

  return (
    <Sheet
      open={Boolean(editing)}
      onClose={onClose}
      title={editing === 'new' ? t('staff.new') : t('staff.edit')}
      closeLabel={t('common.close')}
      size="lg"
      footer={
        <Button form="staff-form" type="submit" block size="lg" loading={save.isPending}>
          {t('common.save')}
        </Button>
      }
    >
      <form
        id="staff-form"
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input
          label={t('staff.name')}
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={80}
        />
        <Input
          label={t('staff.specialty')}
          hint={t('common.optional')}
          value={form.specialty}
          onChange={(e) => set('specialty', e.target.value)}
          maxLength={80}
        />
        <Textarea
          label={t('staff.bio')}
          hint={t('common.optional')}
          value={form.bio}
          onChange={(e) => set('bio', e.target.value)}
          maxLength={1000}
        />
        <Input
          label={t('staff.commission')}
          hint={t('staff.commissionHint')}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={form.commissionPercent}
          onChange={(e) => set('commissionPercent', e.target.value)}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">{t('staff.services')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={form.serviceIds.includes(s.id)}
                onChange={(e) =>
                  set(
                    'serviceIds',
                    e.target.checked
                      ? [...form.serviceIds, s.id]
                      : form.serviceIds.filter((x) => x !== s.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        {editing === 'new' && (
          <p className="text-sm text-gray-500">{t('staff.defaultScheduleNote')}</p>
        )}
        {editing && editing !== 'new' && (
          <>
            <Checkbox
              label={t('staff.activeLabel')}
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <ImageUpload
              businessId={businessId}
              kind="staff-photo"
              targetId={editing.id}
              currentUrl={editing.photoUrl}
              shape="round"
              label={t('media.changePhoto')}
              onUploaded={() => void qc.invalidateQueries({ queryKey: ['staff', businessId] })}
            />
            <ImageUpload
              businessId={businessId}
              kind="portfolio"
              targetId={editing.id}
              label={t('media.addPortfolio')}
              onUploaded={() => void qc.invalidateQueries({ queryKey: ['portfolio', businessId] })}
            />
          </>
        )}
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      </form>
    </Sheet>
  );
}
