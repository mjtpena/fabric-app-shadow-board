import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

export type LoanPurpose = 'travel' | 'remote' | 'replacement' | 'event';

@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', { policy: (claims, item) => claims.sub.eq(item.borrowerSub) })
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.borrowerSub),
  exclude: ['borrowerSub', 'createdAt'],
})
@role('authenticated', 'delete', { policy: (claims, item) => claims.sub.eq(item.borrowerSub) })
export class Loan {
  @uuid() id!: string;
  @uuid() assetId!: string;
  @text({ max: 120 }) borrowerSub!: string;
  @text({ min: 2, max: 100 }) borrowerName!: string;
  @date() startsOn!: Date;
  @date() dueOn!: Date;
  @set('travel', 'remote', 'replacement', 'event') purpose!: LoanPurpose;
  @text({ max: 30, optional: true }) ticketRef?: string;
  @date() createdAt!: Date;
}
