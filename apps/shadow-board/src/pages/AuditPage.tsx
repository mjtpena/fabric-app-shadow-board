import { useMemo } from 'react';
import { SimpleBarChart } from '@x10/shared/charts';
import { useAsync } from '@x10/shared/lib';
import { AppShell, useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Card,
  DataState,
  PageHeader,
  Section,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { KIND_LABEL } from '../domain/config';
import { addDays, computeUtilisation, loanHandovers, toDayStr } from '../domain/rules';
import { loadPool } from '../domain/store';
import type { Schema } from '../model';

export function AuditPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadPool(store), [store]);
  const todayStr = useMemo(() => toDayStr(new Date()), []);
  const windowStart = useMemo(() => addDays(todayStr, -14), [todayStr]);
  const windowEnd = useMemo(() => addDays(todayStr, 14), [todayStr]);

  const pool = state.data;

  const util = useMemo(() => {
    if (!pool) return [];
    return computeUtilisation(pool.assets, pool.loans, pool.handovers, windowStart, windowEnd);
  }, [pool, windowStart, windowEnd]);

  const chartData = useMemo(
    () =>
      util.map((u) => ({
        label: KIND_LABEL[u.kind],
        value: Math.round(u.rate * 100),
      })),
    [util],
  );

  const avgRate = useMemo(() => {
    if (util.length === 0) return 0;
    const totalLoaned = util.reduce((s, u) => s + u.loanedDays, 0);
    const totalAvail = util.reduce((s, u) => s + u.availableDays, 0);
    return totalAvail > 0 ? Math.round((totalLoaned / totalAvail) * 100) : 0;
  }, [util]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Board audit"
          actions={
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print audit
            </Button>
          }
        />

        <DataState state={state}>
          {() => (
            <div className="space-y-6">
              <StatStrip>
                <Stat label="Pool size" value={pool?.assets.length ?? 0} />
                <Stat label="Total loans" value={pool?.loans.length ?? 0} />
                <Stat label="28-day utilisation" value={`${avgRate}%`} tone="info" />
              </StatStrip>

              <Section title="Utilisation by kind (28-day window)">
                <Card className="p-4">
                  <SimpleBarChart
                    title="Utilisation by kind"
                    summary={`Average 28-day utilisation is ${avgRate}% across ${pool?.assets.length ?? 0} assets.`}
                    data={chartData}
                    xKey="label"
                    series={[{ key: 'value', label: 'Utilisation' }]}
                    yFormat={(v) => `${v}%`}
                    height={220}
                  />
                </Card>
              </Section>

              <Section title="Loan history">
                <TableWrap>
                  <Table>
                    <thead>
                      <Tr>
                        <Th>Asset</Th>
                        <Th>Borrower</Th>
                        <Th>Purpose</Th>
                        <Th>Start</Th>
                        <Th>Due</Th>
                        <Th>Status</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {(pool?.loans ?? []).map((loan) => {
                        const asset = pool?.assets.find((a) => a.id === loan.assetId);
                        const { out, in: inH } = loanHandovers(loan.id, pool?.handovers ?? []);
                        const label = inH ? 'Returned' : out ? 'Out' : 'Reserved';
                        const tone = inH ? 'ok' : out ? 'info' : 'neutral';
                        return (
                          <Tr key={loan.id}>
                            <Td className="font-mono font-medium">{asset?.tag ?? '—'}</Td>
                            <Td>{loan.borrowerName}</Td>
                            <Td className="capitalize">{loan.purpose}</Td>
                            <Td className="font-mono">{toDayStr(loan.startsOn)}</Td>
                            <Td className="font-mono">{toDayStr(loan.dueOn)}</Td>
                            <Td>
                              <Badge tone={tone}>{label}</Badge>
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              </Section>
            </div>
          )}
        </DataState>
      </div>
    </AppShell>
  );
}
