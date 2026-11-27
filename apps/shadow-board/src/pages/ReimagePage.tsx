import { useMemo, useState } from 'react';
import { useAsync, usePolling } from '@x10/shared/lib';
import { AppShell, useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  DataState,
  EmptyState,
  InlineError,
  PageHeader,
  Section,
  Stat,
  StatStrip,
} from '@x10/shared/ui';

import { BUFFER_BUSINESS_DAYS, KIND_LABEL, holidaysForYear } from '../domain/config';
import { assetStatusOnDate, toDayStr } from '../domain/rules';
import { completeRepair, loadPool } from '../domain/store';
import type { Schema } from '../model';

export function ReimagePage() {
  const { store, me } = useApp<Schema>();
  const state = useAsync(() => loadPool(store), [store]);
  usePolling(state.reload, 5000);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const todayStr = useMemo(() => toDayStr(new Date()), []);
  const holidays = useMemo(() => holidaysForYear(Number(todayStr.slice(0, 4))), [todayStr]);
  const pool = state.data;

  const { reimaging, inRepair } = useMemo(() => {
    if (!pool) return { reimaging: [], inRepair: [] };
    const snaps = pool.assets.map((a) =>
      assetStatusOnDate(a, pool.loans, pool.handovers, todayStr, todayStr, holidays),
    );
    return {
      reimaging: snaps.filter((s) => s.status === 'reimaging'),
      inRepair: snaps.filter((s) => s.status === 'repair'),
    };
  }, [pool, todayStr, holidays]);

  async function handleClearRepair(assetId: string, tag: string) {
    setError(null);
    setBanner(null);
    setBusyId(assetId);
    try {
      await completeRepair(store, me, assetId, 'good', 'Charger replaced and image verified');
      setBanner(`${tag} cleared from repair and returned to pool.`);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear repair.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <PageHeader title="Reimage bench" />

        <DataState state={state}>
          {() => (
            <div className="space-y-6">
              <StatStrip>
                <Stat label="In turnaround buffer" value={reimaging.length} tone="info" />
                <Stat label="In repair" value={inRepair.length} tone={inRepair.length > 0 ? 'bad' : 'ok'} />
                <Stat label="Laptop buffer" value={`${BUFFER_BUSINESS_DAYS.laptop} bus. days`} />
                <Stat label="Phone buffer" value={`${BUFFER_BUSINESS_DAYS.phone} bus. day`} />
              </StatStrip>

              {error && <InlineError error={error} />}
              {banner && <Callout tone="ok" title="Bench update">{banner}</Callout>}

              <Section title="Turnaround queue">
                {reimaging.length === 0 ? (
                  <EmptyState title="Queue clear">No devices are currently in reimaging turnaround.</EmptyState>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {reimaging.map((s) => (
                      <div key={s.asset.id} className="p-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-sm text-fg">{s.asset.tag}</span>
                            <Badge tone="info">Reimaging</Badge>
                            <span className="text-sm text-fg">{s.asset.model}</span>
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {KIND_LABEL[s.asset.kind]} · buffer ends <span className="font-mono">{s.bufferEndsOn}</span> · free{' '}
                            <span className="font-mono text-fg">{s.nextFreeDate}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Repair bench">
                {inRepair.length === 0 ? (
                  <EmptyState title="No devices in repair">Every device has a complete kit and passed inspection.</EmptyState>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {inRepair.map((s) => {
                      const lastNote = [...(pool?.handovers ?? [])]
                        .reverse()
                        .find((h) => h.assetId === s.asset.id)?.note;
                      return (
                        <div key={s.asset.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm text-fg">{s.asset.tag}</span>
                              <Badge tone="bad">Repair</Badge>
                              <span className="text-sm text-fg">{s.asset.model}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">
                              {lastNote ?? 'Flagged during return inspection'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={!me.isAdmin || busyId === s.asset.id}
                            onClick={() => handleClearRepair(s.asset.id, s.asset.tag)}
                          >
                            {busyId === s.asset.id ? 'Clearing…' : 'Mark repaired'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
