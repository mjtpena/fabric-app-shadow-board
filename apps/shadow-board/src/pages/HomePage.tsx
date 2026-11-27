import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, usePolling } from '@x10/shared/lib';
import { AppShell, useApp } from '@x10/shared/runtime';
import {
  Badge,
  DataState,
  FloatingPanel,
  Legend,
  LensBar,
  StagePage,
  Table,
  TableWrap,
  Td,
  Th,
  TodayPanel,
  Tr,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  type LensOption,
  type TodayItem,
} from '@x10/shared/ui';

import { ShadowBoardSvg, type BoardLens } from '../centrepiece/ShadowBoardSvg';
import { CONDITION_LABEL, KIND_LABEL, holidaysForYear } from '../domain/config';
import {
  addDays,
  assetStatusOnDate,
  computeUtilisation,
  loanHandovers,
  toDayStr,
  type BoardStatus,
} from '../domain/rules';
import { loadPool } from '../domain/store';
import type { Schema } from '../model';

const LENSES: LensOption<BoardLens>[] = [
  { value: 'availability', label: 'Availability' },
  { value: 'utilisation', label: 'Utilisation' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'condition', label: 'Condition' },
  { value: 'reimaging', label: 'Reimaging' },
];

const STATUS_TONE: Record<BoardStatus, 'ok' | 'neutral' | 'warn' | 'bad' | 'info'> = {
  in: 'ok',
  out: 'neutral',
  overdue: 'warn',
  reimaging: 'info',
  repair: 'bad',
};

const STATUS_LABEL: Record<BoardStatus, string> = {
  in: 'In',
  out: 'Out',
  overdue: 'Overdue',
  reimaging: 'Reimaging',
  repair: 'Repair',
};

export function HomePage() {
  const { store, me } = useApp<Schema>();
  const [view, setView] = useState<'stage' | 'list'>('stage');
  const [lens, setLens] = useState<BoardLens>('availability');
  const [roleView, setRoleView] = useState<'custodian' | 'borrower'>(me.isAdmin ? 'custodian' : 'borrower');
  const [dayOffset, setDayOffset] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const state = useAsync(() => loadPool(store), [store]);
  usePolling(state.reload, 5000);

  const todayStr = useMemo(() => toDayStr(new Date()), []);
  const selectedDate = useMemo(() => addDays(todayStr, dayOffset), [todayStr, dayOffset]);
  const holidays = useMemo(() => holidaysForYear(Number(todayStr.slice(0, 4))), [todayStr]);

  useHotkeys({
    '1': () => setLens('availability'),
    '2': () => setLens('utilisation'),
    '3': () => setLens('overdue'),
    '4': () => setLens('condition'),
    '5': () => setLens('reimaging'),
    v: () => setRoleView((r) => (r === 'custodian' ? 'borrower' : 'custodian')),
    Escape: () => setFocusedId(null),
  });

  const pool = state.data;

  const snapshots = useMemo(() => {
    if (!pool) return [];
    return pool.assets.map((asset) =>
      assetStatusOnDate(asset, pool.loans, pool.handovers, selectedDate, todayStr, holidays),
    );
  }, [pool, selectedDate, todayStr, holidays]);

  const utilByKind = useMemo(() => {
    if (!pool) return {};
    const rows = computeUtilisation(
      pool.assets,
      pool.loans,
      pool.handovers,
      addDays(todayStr, -14),
      addDays(todayStr, 14),
    );
    return Object.fromEntries(rows.map((r) => [r.kind, r.rate]));
  }, [pool, todayStr]);

  const counts = useMemo(() => {
    const c = { in: 0, out: 0, overdue: 0, reimaging: 0, repair: 0 };
    for (const s of snapshots) c[s.status] += 1;
    return c;
  }, [snapshots]);

  const todayItems: TodayItem[] = useMemo(() => {
    if (!pool) return [];
    const items: TodayItem[] = [];

    const overdue = snapshots.filter((s) => s.status === 'overdue');
    if (overdue[0]) {
      items.push({
        id: overdue[0].asset.id,
        severity: 'warn',
        title: `${overdue.length} overdue — ${overdue[0].asset.tag} (${overdue[0].activeLoan?.borrowerName})`,
        meta: `Due ${overdue[0].dueOn}`,
      });
    }

    const dueToday = snapshots.filter((s) => s.status === 'out' && s.dueOn === todayStr);
    if (dueToday[0]) {
      items.push({
        id: dueToday[0].asset.id,
        severity: 'info',
        title: `${dueToday.length} due back today — ${dueToday[0].asset.tag}`,
        meta: dueToday[0].activeLoan?.borrowerName ?? '',
      });
    }

    const repair = snapshots.filter((s) => s.status === 'repair');
    if (repair[0]) {
      items.push({
        id: repair[0].asset.id,
        severity: 'bad',
        title: `${repair.length} in repair — ${repair[0].asset.tag}`,
        meta: 'Removed from availability',
      });
    }

    const reimaging = snapshots.filter((s) => s.status === 'reimaging');
    if (reimaging[0]) {
      items.push({
        id: reimaging[0].asset.id,
        severity: 'info',
        title: `${reimaging.length} reimaging — ${reimaging[0].asset.tag}`,
        meta: `Free ${reimaging[0].nextFreeDate}`,
      });
    }

    const upcoming = pool.loans.find((l) => {
      const h = loanHandovers(l.id, pool.handovers);
      return !h.out && toDayStr(l.startsOn) >= todayStr;
    });
    if (upcoming) {
      const asset = pool.assets.find((a) => a.id === upcoming.assetId);
      if (asset) {
        items.push({
          id: asset.id,
          severity: 'ok',
          title: `Prepare ${asset.tag} for ${upcoming.borrowerName}`,
          meta: `Starts ${toDayStr(upcoming.startsOn)}`,
        });
      }
    }

    return items.slice(0, 5);
  }, [pool, snapshots, todayStr]);

  const focusedSnap = useMemo(
    () => snapshots.find((s) => s.asset.id === focusedId) ?? null,
    [snapshots, focusedId],
  );

  const legendItems = [
    { label: `In (${counts.in})`, swatch: 'var(--fg)' },
    { label: `Out (${counts.out})`, swatch: 'var(--muted)' },
    { label: `Overdue (${counts.overdue})`, swatch: 'var(--warn)' },
    { label: `Reimaging (${counts.reimaging})`, swatch: 'var(--accent-9)' },
    { label: `Repair (${counts.repair})`, swatch: 'var(--bad)' },
  ];

  return (
    <AppShell immersive>
      <DataState state={state} empty={!pool || pool.assets.length === 0}>
        {() => (
          <StagePage
            label="Workshop pegboard"
            view={view}
            title="Shadow Board"
            meta={`${selectedDate} · ${counts.in} in · ${counts.out} out · ${counts.overdue} overdue · ${counts.reimaging} reimaging · ${counts.repair} repair`}
            breadcrumb={
              focusedSnap
                ? [
                    { label: 'Board', onClick: () => setFocusedId(null) },
                    { label: focusedSnap.asset.tag },
                  ]
                : [{ label: 'Board' }]
            }
            topRight={
              <ViewToggle
                value={view}
                onChange={setView}
                stageLabel="Board"
                glass={view === 'stage'}
              />
            }
            lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} />}
            legend={<Legend title="Key" items={legendItems} collapsible />}
            bottomRight={
              <ViewAsSwitch
                options={[
                  { value: 'custodian', label: 'Custodian' },
                  { value: 'borrower', label: 'Borrower' },
                ]}
                value={roleView}
                onChange={setRoleView}
              />
            }
            side={
              <TodayPanel
                bare
                items={todayItems}
                activeId={focusedId ?? undefined}
                onSelect={(item) => setFocusedId(item.id)}
              />
            }
            sideCount={todayItems.length}
            stage={
              <div className="w-[calc(100%-var(--side-w,0px))] h-full flex flex-col items-center justify-center px-3 pt-14 pb-20">
                <ShadowBoardSvg
                  snapshots={snapshots}
                  lens={lens}
                  focusedId={focusedId}
                  onSelect={setFocusedId}
                  utilByKind={utilByKind}
                  selectedDate={selectedDate}
                />

                <div className="mt-2 w-full max-w-[540px] flex items-center gap-3 px-4 py-2 rounded-xl bg-surface/90 border border-border backdrop-blur-sm">
                  <label
                    htmlFor="board-date-slider"
                    className="text-xs font-medium text-muted whitespace-nowrap"
                  >
                    Board date
                  </label>
                  <input
                    id="board-date-slider"
                    data-testid="date-slider"
                    type="range"
                    min={-3}
                    max={14}
                    step={1}
                    value={dayOffset}
                    onChange={(e) => setDayOffset(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent-9)] cursor-pointer"
                  />
                  <span
                    data-testid="board-date-label"
                    className="text-xs font-mono font-semibold text-fg min-w-[92px] text-right"
                  >
                    {selectedDate}
                    {dayOffset === 0 ? ' (today)' : dayOffset > 0 ? ` (+${dayOffset}d)` : ` (${dayOffset}d)`}
                  </span>
                </div>

                {focusedSnap && (
                  <FloatingPanel className="mt-2 w-full max-w-[540px] p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-fg">
                          {focusedSnap.asset.tag}
                        </span>
                        <Badge tone={STATUS_TONE[focusedSnap.status]}>
                          {STATUS_LABEL[focusedSnap.status]}
                        </Badge>
                        <span className="text-xs text-muted truncate">
                          {focusedSnap.asset.model} · {CONDITION_LABEL[focusedSnap.asset.condition]}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {focusedSnap.activeLoan
                          ? `${focusedSnap.activeLoan.borrowerName} · due ${focusedSnap.dueOn} · next free ${focusedSnap.nextFreeDate ?? 'TBD'}`
                          : focusedSnap.status === 'repair'
                            ? 'In repair — cleared on Reimage bench'
                            : `Available · kit: ${focusedSnap.asset.kit}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {roleView === 'custodian' ? (
                        <Link
                          to={focusedSnap.status === 'repair' ? '/reimage' : '/desk'}
                          className="text-xs font-medium text-accent-11 hover:underline"
                        >
                          {focusedSnap.status === 'repair' ? 'Reimage bench' : 'Hand-out desk'}
                        </Link>
                      ) : (
                        <Link
                          to="/reserve"
                          className="text-xs font-medium text-accent-11 hover:underline"
                        >
                          Reserve
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setFocusedId(null)}
                        className="text-xs text-muted hover:text-fg px-1.5 py-0.5"
                      >
                        Close
                      </button>
                    </div>
                  </FloatingPanel>
                )}
              </div>
            }
            list={
              <div className="p-4 max-w-6xl mx-auto">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm text-muted">
                    Showing all {snapshots.length} assets on <span className="font-mono text-fg">{selectedDate}</span>
                  </div>
                  <Link to="/reserve" className="text-sm font-medium text-accent-11 hover:underline">
                    Reserve an asset
                  </Link>
                </div>
                <TableWrap>
                  <Table data-testid="asset-list-table">
                    <thead>
                      <Tr>
                        <Th>Tag</Th>
                        <Th>Kind</Th>
                        <Th>Model</Th>
                        <Th>Status</Th>
                        <Th>Condition</Th>
                        <Th>Borrower / Due</Th>
                        <Th numeric>Next free</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s) => (
                        <Tr key={s.asset.id} data-testid={`list-row-${s.asset.tag}`} data-status={s.status}>
                          <Td className="font-mono font-medium">{s.asset.tag}</Td>
                          <Td>{KIND_LABEL[s.asset.kind]}</Td>
                          <Td>{s.asset.model}</Td>
                          <Td>
                            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                          </Td>
                          <Td>{CONDITION_LABEL[s.asset.condition]}</Td>
                          <Td className="text-muted">
                            {s.activeLoan ? `${s.activeLoan.borrowerName} (due ${s.dueOn})` : '—'}
                          </Td>
                          <Td numeric className="font-mono">
                            {s.nextFreeDate ?? 'In repair'}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            }
          />
        )}
      </DataState>
    </AppShell>
  );
}
