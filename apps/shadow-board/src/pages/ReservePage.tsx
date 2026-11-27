import { useMemo, useState } from 'react';
import { useAsync } from '@x10/shared/lib';
import { AppShell, useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Section,
  Select,
  Stat,
  StatStrip,
} from '@x10/shared/ui';

import {
  BUFFER_BUSINESS_DAYS,
  CONDITION_LABEL,
  KIND_LABEL,
  MAX_LOAN_DAYS,
  holidaysForYear,
} from '../domain/config';
import { addDays, bestFitAsset, isAssetFree, toDayStr } from '../domain/rules';
import { loadPool, reserveAsset } from '../domain/store';
import type { AssetCondition, AssetKind, LoanPurpose, Schema } from '../model';

export function ReservePage() {
  const { store, me } = useApp<Schema>();
  const state = useAsync(() => loadPool(store), [store]);

  const todayStr = useMemo(() => toDayStr(new Date()), []);
  const holidays = useMemo(() => holidaysForYear(Number(todayStr.slice(0, 4))), [todayStr]);

  const [kind, setKind] = useState<AssetKind>('laptop');
  const [startsOn, setStartsOn] = useState(() => addDays(todayStr, 1));
  const [dueOn, setDueOn] = useState(() => addDays(todayStr, 4));
  const [minCondition, setMinCondition] = useState<AssetCondition>('worn');
  const [purpose, setPurpose] = useState<LoanPurpose>('travel');
  const [ticketRef, setTicketRef] = useState('');
  const [manualAssetId, setManualAssetId] = useState<string>('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pool = state.data;

  const suggestion = useMemo(() => {
    if (!pool) return null;
    return bestFitAsset(
      pool.assets,
      pool.loans,
      pool.handovers,
      { kind, startsOn, dueOn, minCondition },
      holidays,
    );
  }, [pool, kind, startsOn, dueOn, minCondition, holidays]);

  const sameKindAssets = useMemo(
    () => (pool ? pool.assets.filter((a) => a.kind === kind) : []),
    [pool, kind],
  );

  const chosenAssetId = manualAssetId === 'auto' ? suggestion?.asset.id ?? '' : manualAssetId;
  const chosenAsset = useMemo(
    () => (pool ? pool.assets.find((a) => a.id === chosenAssetId) ?? null : null),
    [pool, chosenAssetId],
  );

  const liveAvail = useMemo(() => {
    if (!pool || !chosenAsset) return null;
    return isAssetFree(chosenAsset, pool.loans, pool.handovers, startsOn, dueOn, holidays);
  }, [pool, chosenAsset, startsOn, dueOn, holidays]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!chosenAssetId) {
      setError('No matching asset available for those dates.');
      return;
    }
    setSaving(true);
    try {
      const loan = await reserveAsset(
        store,
        me,
        {
          assetId: chosenAssetId,
          startsOn,
          dueOn,
          purpose,
          ticketRef: ticketRef || undefined,
        },
        holidays,
      );
      setSuccess(
        `Reserved ${chosenAsset?.tag ?? 'asset'} from ${toDayStr(loan.startsOn)} to ${toDayStr(loan.dueOn)}.`,
      );
      setTicketRef('');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reservation failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <PageHeader title="Reserve" />

        <DataState state={state}>
          {() => (
            <div className="space-y-6">
              <StatStrip>
                <Stat
                  label="Turnaround buffer"
                  value={`${BUFFER_BUSINESS_DAYS[kind]} bus. day${BUFFER_BUSINESS_DAYS[kind] > 1 ? 's' : ''}`}
                />
                <Stat label="Max loan" value={`${MAX_LOAN_DAYS} days`} />
                <Stat
                  label="Best-fit pick"
                  value={suggestion ? suggestion.asset.tag : 'None free'}
                  tone={suggestion ? 'ok' : 'warn'}
                />
              </StatStrip>

              <Section title="Booking request">
                <Card className="p-5">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Equipment kind" htmlFor="res-kind">
                        <Select
                          id="res-kind"
                          value={kind}
                          onChange={(e) => {
                            setKind(e.target.value as AssetKind);
                            setManualAssetId('auto');
                          }}
                        >
                          <option value="laptop">Laptop (2-day reimage buffer)</option>
                          <option value="phone">Phone (1-day reimage buffer)</option>
                          <option value="hotspot">Hotspot (1-day buffer)</option>
                          <option value="security-key">Security key (1-day buffer)</option>
                          <option value="headset">Headset (1-day buffer)</option>
                        </Select>
                      </Field>

                      <Field label="Minimum condition" htmlFor="res-cond">
                        <Select
                          id="res-cond"
                          value={minCondition}
                          onChange={(e) => setMinCondition(e.target.value as AssetCondition)}
                        >
                          <option value="worn">Worn or better</option>
                          <option value="good">Good or better</option>
                          <option value="new">New only</option>
                        </Select>
                      </Field>

                      <Field label="Start date" htmlFor="res-start">
                        <Input
                          id="res-start"
                          type="date"
                          value={startsOn}
                          onChange={(e) => setStartsOn(e.target.value)}
                          required
                        />
                      </Field>

                      <Field label="Due date" htmlFor="res-due">
                        <Input
                          id="res-due"
                          type="date"
                          value={dueOn}
                          onChange={(e) => setDueOn(e.target.value)}
                          required
                        />
                      </Field>

                      <Field label="Asset assignment" htmlFor="res-asset">
                        <Select
                          id="res-asset"
                          value={manualAssetId}
                          onChange={(e) => setManualAssetId(e.target.value)}
                        >
                          <option value="auto">
                            {suggestion
                              ? `Best-fit: ${suggestion.asset.tag} (${suggestion.asset.model}, ${CONDITION_LABEL[suggestion.asset.condition]})`
                              : 'Best-fit (none available)'}
                          </option>
                          {sameKindAssets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.tag} — {a.model} ({CONDITION_LABEL[a.condition]})
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field label="Purpose" htmlFor="res-purpose">
                        <Select
                          id="res-purpose"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value as LoanPurpose)}
                        >
                          <option value="travel">Travel</option>
                          <option value="remote">Remote work</option>
                          <option value="replacement">Replacement</option>
                          <option value="event">Event</option>
                        </Select>
                      </Field>
                    </div>

                    <Field label="Ticket reference (optional)" htmlFor="res-ticket">
                      <Input
                        id="res-ticket"
                        value={ticketRef}
                        onChange={(e) => setTicketRef(e.target.value)}
                        placeholder="IT-2048"
                        maxLength={30}
                      />
                    </Field>

                    {liveAvail && !liveAvail.free && (
                      <Callout tone="warn" title="Turnaround conflict">
                        {liveAvail.reason}
                      </Callout>
                    )}

                    {suggestion && manualAssetId === 'auto' && (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Badge tone="ok">Best-fit</Badge>
                        <span>
                          {suggestion.asset.tag} ({KIND_LABEL[suggestion.asset.kind]}) minimizes idle gaps (
                          {suggestion.totalGap}d total gap) and preserves newer units.
                        </span>
                      </div>
                    )}

                    {error && <InlineError error={error} />}
                    {success && <Callout tone="ok" title="Reservation confirmed">{success}</Callout>}

                    <div className="flex justify-end">
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Reserving…' : 'Confirm reservation'}
                      </Button>
                    </div>
                  </form>
                </Card>
              </Section>
            </div>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
