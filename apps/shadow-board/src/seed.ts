import type { DataStore } from '@x10/shared/data';
import type { SeedContext } from '@x10/shared/runtime';

import type { Asset, AssetCondition, AssetKind, LoanPurpose, Schema } from './model';
import { addDays, toDayStr } from './domain/rules';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_BORROWERS = [
  { sub: 'demo-b3', name: 'Jordan Chen' },
  { sub: 'demo-b4', name: 'Elena Novak' },
  { sub: 'demo-b5', name: 'Marcus Reid' },
  { sub: 'demo-b6', name: 'Hannah Osei' },
  { sub: 'demo-b7', name: 'Liam Brooks' },
  { sub: 'demo-b8', name: 'Nadia Farah' },
];

const PURPOSES: LoanPurpose[] = ['travel', 'remote', 'replacement', 'event'];

interface AssetSpec {
  tag: string;
  kind: AssetKind;
  model: string;
  condition: AssetCondition;
  kit: string;
}

function buildAssetSpecs(): AssetSpec[] {
  const specs: AssetSpec[] = [];
  const laptopModels = ['ThinkPad X1 Carbon', 'Surface Laptop 6', 'Latitude 7440', 'EliteBook 840'];
  const phoneModels = ['Pixel 9 Pro', 'Galaxy S24', 'iPhone 15'];
  const hotspotModels = ['Netgear Nighthawk M6', 'Inseego MiFi X Pro'];
  const keyModels = ['YubiKey 5C NFC', 'Feitian BioPass K27'];
  const headsetModels = ['Jabra Evolve2 65', 'Poly Voyager Focus 2'];

  for (let i = 1; i <= 14; i++) {
    const cond: AssetCondition = i === 14 ? 'repair' : i <= 3 ? 'new' : i <= 11 ? 'good' : 'worn';
    specs.push({
      tag: `LP-${String(i).padStart(2, '0')}`,
      kind: 'laptop',
      model: laptopModels[(i - 1) % laptopModels.length],
      condition: cond,
      kit: 'USB-C charger, Sleeve, Ethernet dongle',
    });
  }
  for (let i = 1; i <= 10; i++) {
    const cond: AssetCondition = i <= 2 ? 'new' : i <= 8 ? 'good' : 'worn';
    specs.push({
      tag: `PH-${String(i).padStart(2, '0')}`,
      kind: 'phone',
      model: phoneModels[(i - 1) % phoneModels.length],
      condition: cond,
      kit: 'USB-C cable, Wall plug, Travel SIM',
    });
  }
  for (let i = 1; i <= 6; i++) {
    specs.push({
      tag: `HS-${String(i).padStart(2, '0')}`,
      kind: 'hotspot',
      model: hotspotModels[(i - 1) % hotspotModels.length],
      condition: i <= 2 ? 'new' : 'good',
      kit: 'USB-C cable, Carry pouch',
    });
  }
  for (let i = 1; i <= 3; i++) {
    specs.push({
      tag: `SK-${String(i).padStart(2, '0')}`,
      kind: 'security-key',
      model: keyModels[(i - 1) % keyModels.length],
      condition: 'new',
      kit: 'Lanyard, Protective cap',
    });
  }
  for (let i = 1; i <= 3; i++) {
    specs.push({
      tag: `HD-${String(i).padStart(2, '0')}`,
      kind: 'headset',
      model: headsetModels[(i - 1) % headsetModels.length],
      condition: i === 1 ? 'new' : 'good',
      kit: 'USB dongle, Charging cable, Case',
    });
  }
  return specs;
}

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const rand = mulberry32(8052025);
  const today = toDayStr(ctx.now);
  const custodianSub = ctx.people[0]?.sub ?? 'demo-admin';

  const borrowers = [
    ...(ctx.people.slice(1).map((p) => ({ sub: p.sub, name: p.displayName }))),
    ...EXTRA_BORROWERS,
  ];

  const specs = buildAssetSpecs();
  const assets: Asset[] = [];
  for (const s of specs) {
    const created = await store.repo('Asset').create({
      custodianSub,
      tag: s.tag,
      kind: s.kind,
      model: s.model,
      condition: s.condition,
      kit: s.kit,
    });
    assets.push(created);
  }

  const byTag = (tag: string) => assets.find((a) => a.tag === tag)!;
  const iso = (day: string, hour = 9) => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;

  const addLoan = async (
    tag: string,
    borrowerIdx: number,
    startOffset: number,
    dueOffset: number,
    purpose: LoanPurpose,
    opts: { handedOut?: boolean; returnedOffset?: number; missingCharger?: boolean; ticket?: string } = {},
  ) => {
    const asset = byTag(tag);
    const b = borrowers[borrowerIdx % borrowers.length];
    const startsOn = addDays(today, startOffset);
    const dueOn = addDays(today, dueOffset);
    const loan = await store.repo('Loan').create({
      assetId: asset.id,
      borrowerSub: b.sub,
      borrowerName: b.name,
      startsOn: iso(startsOn, 9),
      dueOn: iso(dueOn, 17),
      purpose,
      ticketRef: opts.ticket ?? `IT-${1040 + Math.floor(rand() * 800)}`,
      createdAt: iso(addDays(startsOn, -3), 10),
    });

    if (opts.handedOut) {
      await store.repo('Handover').create({
        loanId: loan.id,
        assetId: asset.id,
        custodianSub,
        kind: 'out',
        at: iso(startsOn, 9),
        condition: asset.condition === 'repair' ? 'good' : asset.condition,
        kitOk: true,
        note: 'Checked out at desk',
      });
    }

    if (opts.returnedOffset !== undefined) {
      const retDay = addDays(today, opts.returnedOffset);
      await store.repo('Handover').create({
        loanId: loan.id,
        assetId: asset.id,
        custodianSub,
        kind: 'in',
        at: iso(retDay, 15),
        condition: opts.missingCharger ? 'repair' : asset.condition,
        kitOk: !opts.missingCharger,
        note: opts.missingCharger ? 'Missing kit: USB-C charger' : 'Returned complete',
      });
    }
    return loan;
  };

  // 1) 3 Overdue loans
  await addLoan('LP-01', 0, -9, -2, 'travel', { handedOut: true, ticket: 'IT-1101' });
  await addLoan('PH-01', 1, -10, -4, 'remote', { handedOut: true, ticket: 'IT-1102' });
  await addLoan('HS-01', 2, -20, -15, 'travel', { handedOut: true, ticket: 'IT-1103' });

  // 2) 2 Assets currently reimaging
  await addLoan('LP-02', 3, -6, -1, 'travel', { handedOut: true, returnedOffset: -1, ticket: 'IT-1104' });
  await addLoan('LP-03', 4, -5, 0, 'replacement', { handedOut: true, returnedOffset: 0, ticket: 'IT-1105' });

  // 3) 1 Asset in repair for a missing charger (LP-14)
  await addLoan('LP-14', 5, -8, -2, 'travel', {
    handedOut: true,
    returnedOffset: -2,
    missingCharger: true,
    ticket: 'IT-1106',
  });

  // 4) 10 Active loans currently out
  await addLoan('LP-04', 0, -4, 0, 'remote', { handedOut: true });
  await addLoan('LP-05', 1, -3, 1, 'travel', { handedOut: true });
  await addLoan('LP-06', 2, -2, 2, 'event', { handedOut: true });
  await addLoan('LP-07', 6, -5, 3, 'travel', { handedOut: true });
  await addLoan('LP-08', 7, -1, 4, 'replacement', { handedOut: true });
  await addLoan('PH-02', 3, -3, 0, 'travel', { handedOut: true });
  await addLoan('PH-03', 4, -2, 2, 'remote', { handedOut: true });
  await addLoan('PH-04', 5, -4, 5, 'travel', { handedOut: true });
  await addLoan('HS-02', 6, -3, 1, 'travel', { handedOut: true });
  await addLoan('HD-01', 7, -2, 3, 'remote', { handedOut: true });

  // 5) 5 Future reservations
  await addLoan('LP-09', 0, 1, 5, 'travel', { handedOut: false });
  await addLoan('LP-10', 1, 2, 7, 'remote', { handedOut: false });
  await addLoan('PH-05', 2, 1, 4, 'event', { handedOut: false });
  await addLoan('HS-03', 3, 2, 6, 'travel', { handedOut: false });
  await addLoan('SK-01', 4, 1, 8, 'remote', { handedOut: false });

  // 6) 7 Historical completed loans
  const pastTags = ['LP-11', 'LP-12', 'PH-06', 'PH-07', 'HS-04', 'SK-02', 'HD-02'];
  for (let i = 0; i < pastTags.length; i++) {
    const startOff = -18 + i;
    const dueOff = startOff + 4 + (i % 3);
    await addLoan(pastTags[i], i, startOff, dueOff, PURPOSES[i % PURPOSES.length], {
      handedOut: true,
      returnedOffset: dueOff,
    });
  }
}
