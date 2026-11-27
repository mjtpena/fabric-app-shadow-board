import { boolean, date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

import type { AssetCondition } from './Asset.js';

export type HandoverKind = 'out' | 'in' | 'repair';

@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', { policy: (claims, item) => claims.sub.eq(item.custodianSub) })
export class Handover {
  @uuid() id!: string;
  @uuid() loanId!: string;
  @uuid() assetId!: string;
  @text({ max: 120 }) custodianSub!: string;
  @set('out', 'in', 'repair') kind!: HandoverKind;
  @date() at!: Date;
  @set('new', 'good', 'worn', 'repair') condition!: AssetCondition;
  @boolean() kitOk!: boolean;
  @text({ max: 200, optional: true }) note?: string;
}
