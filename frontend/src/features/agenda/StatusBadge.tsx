import { useTranslation } from 'react-i18next';
import type { AppointmentStatus } from '@/services/types';
import { Badge } from '@/components/ui';

const tones = { CONFIRMED: 'blue', COMPLETED: 'green', CANCELED: 'gray', NO_SHOW: 'red' } as const;

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  return <Badge tone={tones[status]}>{t(`status.${status}`)}</Badge>;
}
