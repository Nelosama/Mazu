import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import i18n from '@/i18n';
import { SlotPicker } from './SlotPicker';

const TZ = 'America/Tegucigalpa';

function setup(onSelect = vi.fn()) {
  const today = DateTime.now().setZone(TZ).startOf('day');
  const tomorrow = today.plus({ days: 1 });
  const slot = (h: number) => ({
    startsAt: tomorrow.set({ hour: h }).toUTC().toISO()!,
    endsAt: tomorrow.set({ hour: h, minute: 30 }).toUTC().toISO()!,
    staffIds: ['s1'],
  });
  const fetchDays = vi.fn(async (from: string) => {
    const start = DateTime.fromISO(from, { zone: TZ });
    return Array.from({ length: 14 }, (_, i) => {
      const date = start.plus({ days: i }).toISODate()!;
      return { date, slots: date === tomorrow.toISODate() ? [slot(9), slot(15), slot(19)] : [] };
    });
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SlotPicker
        timezone={TZ}
        maxAdvanceDays={60}
        queryKey={['t']}
        fetchDays={fetchDays}
        selected={null}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );
  return { fetchDays, onSelect };
}

describe('SlotPicker', () => {
  beforeAll(() => i18n.changeLanguage('es'));

  it('selecciona el primer día con horarios y agrupa por franja', async () => {
    const { onSelect } = setup();
    expect(await screen.findByText('Mañana')).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.getByText('Noche')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^9:00/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('deshabilita días sin disponibilidad', async () => {
    setup();
    await screen.findByText('Mañana');
    const options = screen.getAllByRole('option');
    expect(options.filter((o) => !(o as HTMLButtonElement).disabled)).toHaveLength(1);
  });
});
