import { AppShell } from '@x10/shared/runtime';
import { Callout, PageHeader, Section, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import { BUFFER_BUSINESS_DAYS, MAX_LOAN_DAYS, OVERDUE_LADDER } from '../domain/config';

export function AboutPage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <PageHeader title="About Shadow Board" />

        <Section title="Purpose">
          <p className="text-sm text-muted leading-relaxed">
            Shadow Board manages a shared hardware loaner pool of laptops, phones, hotspots,
            security keys and headsets. Every reservation accounts for reimaging turnaround time,
            best-fit allocation keeps long gaps available for longer trips, and return inspections
            automatically quarantine incomplete or damaged kits.
          </p>
        </Section>

        <Section title="Rules and thresholds">
          <TableWrap>
            <Table>
              <thead>
                <Tr>
                  <Th>Rule</Th>
                  <Th>Threshold</Th>
                </Tr>
              </thead>
              <tbody>
                <Tr>
                  <Td>Laptop reimage buffer</Td>
                  <Td className="font-mono">{BUFFER_BUSINESS_DAYS.laptop} business days</Td>
                </Tr>
                <Tr>
                  <Td>Phone / hotspot / accessory buffer</Td>
                  <Td className="font-mono">{BUFFER_BUSINESS_DAYS.phone} business day</Td>
                </Tr>
                <Tr>
                  <Td>Maximum loan duration</Td>
                  <Td className="font-mono">{MAX_LOAN_DAYS} calendar days</Td>
                </Tr>
                <Tr>
                  <Td>Overdue ladder</Td>
                  <Td className="font-mono">
                    Reminder {OVERDUE_LADDER.reminder}d · Overdue +{OVERDUE_LADDER.overdue}d · Manager +
                    {OVERDUE_LADDER.manager}d · Presumed lost +{OVERDUE_LADDER.presumedLost}d
                  </Td>
                </Tr>
              </tbody>
            </Table>
          </TableWrap>
        </Section>

        <Callout tone="neutral" title="Process support">
          Shadow Board supports internal IT asset custody and return workflows. It does not replace
          formal security incident reporting or financial asset-write-off approvals.
        </Callout>
      </div>
    </AppShell>
  );
}
