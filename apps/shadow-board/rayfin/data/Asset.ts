import { entity, role, set, text, uuid } from '@microsoft/rayfin-core';

export type AssetKind = 'laptop' | 'phone' | 'hotspot' | 'headset' | 'security-key' | 'monitor';
export type AssetCondition = 'new' | 'good' | 'worn' | 'repair';

@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', { policy: (claims, item) => claims.sub.eq(item.custodianSub) })
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.custodianSub),
  exclude: ['custodianSub'],
})
@role('authenticated', 'delete', { policy: (claims, item) => claims.sub.eq(item.custodianSub) })
export class Asset {
  @uuid() id!: string;
  @text({ max: 120 }) custodianSub!: string;
  @text({ min: 2, max: 20 }) tag!: string;
  @set('laptop', 'phone', 'hotspot', 'headset', 'security-key', 'monitor') kind!: AssetKind;
  @text({ min: 2, max: 60 }) model!: string;
  @set('new', 'good', 'worn', 'repair') condition!: AssetCondition;
  @text({ max: 120 }) kit!: string;
}
