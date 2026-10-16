import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { Service } from '@/services/types';
import { useBusiness, useServiceList, useStaffList } from '@/hooks/useBusiness';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDuration, formatMoney } from '@/lib/format';
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
import { ImageUpload } from '@/features/catalog/ImageUpload';

const empty = {
  name: '',
  description: '',
  category: '',
  price: '',
  durationMinutes: 30,
  active: true,
  staffIds: [] as string[],
};

export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useBusiness();
  const servicesQ = useServiceList(businessId);
  const staffQ = useStaffList(businessId);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  if (servicesQ.isLoading) return <PageLoader label={t('common.loading')} />;
  const services = servicesQ.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('services.title')}
        subtitle={t('services.subtitle', { currency: business?.currency })}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Icon name="plus" className="h-4 w-4" />
            {t('services.add')}
          </Button>
        }
      />
      {services.length === 0 ? (
        <EmptyState
          icon={<Icon name="scissors" className="h-10 w-10" />}
          title={t('services.emptyTitle')}
          description={t('services.emptyText')}
          action={<Button onClick={() => setEditing('new')}>{t('services.add')}</Button>}
        />
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50"
              >
                {s.photoUrl ? (
                  <img src={s.photoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-gray-100" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {s.name} {!s.active && <Badge>{t('common.inactive')}</Badge>}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatDuration(s.durationMinutes, i18n.language)} ·{' '}
                    {t('services.staffCount', { count: s.staffIds.length })}
                  </p>
                </div>
                <p className="font-semibold text-gray-900">
                  {formatMoney(s.price, s.currency, i18n.language)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ServiceSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        businessId={businessId}
        editing={editing}
        onClose={() => setEditing(null)}
        staff={staffQ.data ?? []}
      />
    </div>
  );
}

function ServiceSheet({
  businessId,
  editing,
  onClose,
  staff,
}: {
  businessId: string;
  editing: Service | 'new' | null;
  onClose: () => void;
  staff: { id: string; name: string; active: boolean }[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  // El componente se monta de nuevo (key) al abrir, así el estado inicial siempre es el correcto.
  const [form, setForm] = useState(() =>
    editing && editing !== 'new'
      ? {
          name: editing.name,
          description: editing.description ?? '',
          category: editing.category ?? '',
          price: editing.price,
          durationMinutes: editing.durationMinutes,
          active: editing.active,
          staffIds: editing.staffIds,
        }
      : { ...empty, staffIds: staff.filter((s) => s.active).map((s) => s.id) },
  );

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        description: form.description || undefined,
        category: form.category || undefined,
        durationMinutes: Number(form.durationMinutes),
      };
      return editing === 'new'
        ? api<Service>(`/businesses/${businessId}/services`, { body })
        : api<Service>(`/businesses/${businessId}/services/${(editing as Service).id}`, {
            method: 'PATCH',
            body,
          });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services', businessId] });
      toast(t('common.saved'));
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet
      open={Boolean(editing)}
      onClose={onClose}
      title={editing === 'new' ? t('services.new') : t('services.edit')}
      closeLabel={t('common.close')}
      size="lg"
      footer={
        <Button form="service-form" type="submit" block size="lg" loading={save.isPending}>
          {t('common.save')}
        </Button>
      }
    >
      <form id="service-form" onSubmit={submit} className="space-y-4">
        <Input
          label={t('services.name')}
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={80}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('services.price')}
            required
            inputMode="decimal"
            pattern="^\d{1,10}(\.\d{1,2})?$"
            value={form.price}
            onChange={(e) => set('price', e.target.value.replace(',', '.'))}
          />
          <Input
            label={t('services.duration')}
            required
            type="number"
            min={5}
            max={720}
            step={5}
            value={form.durationMinutes}
            onChange={(e) => set('durationMinutes', Number(e.target.value))}
          />
        </div>
        <Input
          label={t('services.category')}
          hint={t('common.optional')}
          value={form.category}
          onChange={(e) => set('category', e.target.value)}
          maxLength={60}
        />
        <Textarea
          label={t('services.description')}
          hint={t('common.optional')}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          maxLength={1000}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">
            {t('services.whoPerforms')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {staff.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={form.staffIds.includes(s.id)}
                onChange={(e) =>
                  set(
                    'staffIds',
                    e.target.checked
                      ? [...form.staffIds, s.id]
                      : form.staffIds.filter((x) => x !== s.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Checkbox
          label={t('services.activeLabel')}
          checked={form.active}
          onChange={(e) => set('active', e.target.checked)}
        />
        {editing && editing !== 'new' && (
          <ImageUpload
            businessId={businessId}
            kind="service-photo"
            targetId={editing.id}
            currentUrl={editing.photoUrl}
            label={t('media.changePhoto')}
            onUploaded={() => void qc.invalidateQueries({ queryKey: ['services', businessId] })}
          />
        )}
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      </form>
    </Sheet>
  );
}
