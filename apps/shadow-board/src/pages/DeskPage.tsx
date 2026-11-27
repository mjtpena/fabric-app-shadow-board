import { useMemo, useState } from 'react';
import { useAsync, usePolling } from '@x10/shared/lib';
import { AppShell, useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DataState,
  EmptyState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Section,
  Select,
  Stat,
  StatStrip,
} from '@x10/shared/ui';

import { CONDITION_LABEL, KIND_LABEL } from '../domain/config';
import { loanHandovers, parseKit, toDayStr } from '../domain/rules';
import { handOutLoan, loadPool, returnLoan } from '../domain/store';
import type { AssetCondition, Schema } from '../model';

export function DeskPage() {
  const { store, me } = useApp<Schema>();
  const state = useAsync(() => loadPool(store), [store]);
  usePolling(state.reload, 5000);

  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState<AssetCondition>('good');
  const [checkedKit, setCheckedKit] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const pool = state.data;

  const { pendingOut, activeOut } = useMemo(() => {
    if (!pool) return { pendingOut: [], activeOut: [] };
    const pOut: typeof pool.loans = [];
    const aOut: typeof pool.loans = [];
    for (const loan of pool.loans) {
      const { out, in: inH } = loanHandovers(loan.id, pool.handovers);
      if (!out && !inH) pOut.push(loan);
      else if (out && !inH) aOut.push(loan);
    }
    return { pendingOut: pOut, activeOut: aOut };
  }, [pool]);

  const activeLoan = useMemo(
    () => (pool && selectedLoanId ? pool.loans.find((l) => l.id === selectedLoanId) ?? null : null),
    [pool, selectedLoanId],
  );
  const activeAsset = useMemo(
    () => (pool && activeLoan ? pool.assets.find((a) => a.id === activeLoan.assetId) ?? null : null),
    [pool, activeLoan],
  );

  function openCheckIn(loanId: string) {
    setError(null);
    setBanner(null);
    setSelectedLoanId(loanId);
    const loan = pool?.loans.find((l) => l.id === loanId);
    const asset = pool?.assets.find((a) => a.id === loan?.assetId);
    if (asset) {
      setReturnCondition(asset.condition === 'repair' ? 'good' : asset.condition);
      const map: Record<string, boolean> = {};
      for (const item of parseKit(asset.kit)) map[item] = true;
      setCheckedKit(map);
    }
    setNote('');
  }

  async function handleHandOut(loanId: string, cond: AssetCondition) {
    setError(null);
    setBanner(null);
    setBusy(true);
    try {
      await handOutLoan(store, me, loanId, cond);
      setBanner('Asset handed out and recorded.');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hand-out failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLoan || !activeAsset) return;
    setError(null);
    setBanner(null);
    setBusy(true);
    try {
      const returnedItems = Object.entries(checkedKit)
        .filter(([, ok]) => ok)
        .map(([item]) => item);
      const res = await returnLoan(store, me, activeLoan.id, returnCondition, returnedItems, note);
      if (res.sentToRepair) {
        setBanner(
          `${activeAsset.tag} sent to repair (${
            res.missingKit.length > 0 ? `missing ${res.missingKit.join(', ')}` : 'condition dropped'
          }) and removed from availability.`,
        );
      } else {
        setBanner(`${activeAsset.tag} checked in complete — now in reimaging turnaround.`);
      }
      setSelectedLoanId(null);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <PageHeader title="Hand-out desk" />

        <DataState state={state}>
          {() => (
            <div className="space-y-6">
              <StatStrip>
                <Stat label="Ready to hand out" value={pendingOut.length} />
                <Stat label="Currently out" value={activeOut.length} />
                <Stat label="Role" value={me.isAdmin ? 'Custodian' : 'Read-only (borrower)'} />
              </StatStrip>

              {error && <InlineError error={error} />}
              {banner && <Callout tone="ok" title="Desk update">{banner}</Callout>}

              {activeLoan && activeAsset && (
                <Section title={`Check in ${activeAsset.tag} (${activeAsset.model})`}>
                  <Card className="p-5">
                    <form onSubmit={handleCheckIn} className="space-y-4">
                      <div className="text-sm text-muted">
                        Borrower: <span className="text-fg font-medium">{activeLoan.borrowerName}</span> · Due{' '}
                        <span className="font-mono text-fg">{toDayStr(activeLoan.dueOn)}</span>
                      </div>

                      <Field label="Return condition" htmlFor="desk-cond">
                        <Select
                          id="desk-cond"
                          value={returnCondition}
                          onChange={(e) => setReturnCondition(e.target.value as AssetCondition)}
                        >
                          <option value="new">New</option>
                          <option value="good">Good</option>
                          <option value="worn">Worn</option>
                          <option value="repair">Needs repair</option>
                        </Select>
                      </Field>

                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted uppercase tracking-wide">
                          Kit checklist (uncheck any missing accessory)
                        </div>
                        <div className="flex flex-wrap gap-4">
                          {parseKit(activeAsset.kit).map((item) => (
                            <Checkbox
                              key={item}
                              label={item}
                              checked={!!checkedKit[item]}
                              onChange={(checked) =>
                                setCheckedKit((prev) => ({ ...prev, [item]: checked }))
                              }
                            />
                          ))}
                        </div>
                      </div>

                      <Field label="Inspection note (optional)" htmlFor="desk-note">
                        <Input
                          id="desk-note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Any scratches or missing items"
                          maxLength={200}
                        />
                      </Field>

                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setSelectedLoanId(null)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={busy || !me.isAdmin}>
                          {busy ? 'Recording…' : 'Complete check-in'}
                        </Button>
                      </div>
                    </form>
                  </Card>
                </Section>
              )}

              <Section title="Active loans — check in">
                {activeOut.length === 0 ? (
                  <EmptyState title="No active loans">All handed-out devices have been returned.</EmptyState>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {activeOut.map((loan) => {
                      const asset = pool?.assets.find((a) => a.id === loan.assetId);
                      if (!asset) return null;
                      return (
                        <div
                          key={loan.id}
                          className="p-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm text-fg">{asset.tag}</span>
                              <Badge tone="neutral">{KIND_LABEL[asset.kind]}</Badge>
                              <span className="text-sm text-fg">{asset.model}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">
                              {loan.borrowerName} · due <span className="font-mono">{toDayStr(loan.dueOn)}</span> · kit: {asset.kit}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!me.isAdmin}
                            onClick={() => openCheckIn(loan.id)}
                          >
                            Check in {asset.tag}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title="Upcoming reservations — hand out">
                {pendingOut.length === 0 ? (
                  <EmptyState title="No pending reservations">Nothing waiting at the desk.</EmptyState>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {pendingOut.map((loan) => {
                      const asset = pool?.assets.find((a) => a.id === loan.assetId);
                      if (!asset) return null;
                      return (
                        <div
                          key={loan.id}
                          className="p-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm text-fg">{asset.tag}</span>
                              <Badge tone="info">{CONDITION_LABEL[asset.condition]}</Badge>
                              <span className="text-sm text-fg">{asset.model}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">
                              {loan.borrowerName} · {toDayStr(loan.startsOn)} → {toDayStr(loan.dueOn)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={!me.isAdmin || busy}
                            onClick={() => handleHandOut(loan.id, asset.condition)}
                          >
                            Hand out
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
