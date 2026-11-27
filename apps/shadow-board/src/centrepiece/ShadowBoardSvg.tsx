import { useReducedMotion } from '@x10/shared/ui';

import type { AssetDaySnapshot, BoardStatus } from '../domain/rules';
import type { AssetKind } from '../model';
import { KIND_LABEL } from '../domain/config';

export type BoardLens = 'availability' | 'utilisation' | 'overdue' | 'condition' | 'reimaging';

interface Props {
  snapshots: AssetDaySnapshot[];
  lens: BoardLens;
  focusedId: string | null;
  onSelect: (assetId: string) => void;
  utilByKind: Record<string, number>;
  selectedDate: string;
}

const GROUPS: { kind: AssetKind; label: string }[] = [
  { kind: 'laptop', label: 'LAPTOPS' },
  { kind: 'phone', label: 'PHONES' },
  { kind: 'hotspot', label: 'HOTSPOTS' },
  { kind: 'security-key', label: 'SECURITY KEYS' },
  { kind: 'headset', label: 'HEADSETS' },
];

function silhouettePath(kind: AssetKind): string {
  switch (kind) {
    case 'laptop':
      return 'M14 14h52v34H14z M6 48h68l-4 7H10z';
    case 'phone':
      return 'M18 10h24a4 4 0 0 1 4 4v38a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z';
    case 'hotspot':
      return 'M12 18h40a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5z';
    case 'security-key':
      return 'M22 10h16v28h-3v14h-10V38h-3z';
    case 'headset':
      return 'M14 36a18 18 0 0 1 36 0v10h-6V36a12 12 0 0 0-24 0v10h-6z';
    default:
      return 'M12 12h44v34H12z';
  }
}

function isDimmed(snap: AssetDaySnapshot, lens: BoardLens): boolean {
  if (lens === 'overdue') return snap.status !== 'overdue';
  if (lens === 'reimaging') return snap.status !== 'reimaging' && snap.status !== 'repair';
  return false;
}

function statusStroke(status: BoardStatus): string {
  if (status === 'overdue') return 'var(--warn)';
  if (status === 'repair') return 'var(--bad)';
  if (status === 'reimaging') return 'var(--accent-9)';
  if (status === 'out') return 'var(--muted)';
  return 'var(--fg)';
}

export function ShadowBoardSvg({
  snapshots,
  lens,
  focusedId,
  onSelect,
  utilByKind,
  selectedDate,
}: Props) {
  const reduced = useReducedMotion();

  const byKind = new Map<AssetKind, AssetDaySnapshot[]>();
  for (const s of snapshots) {
    const arr = byKind.get(s.asset.kind) ?? [];
    arr.push(s);
    byKind.set(s.asset.kind, arr);
  }

  const padX = 34;
  const boardW = 860;
  const boardH = 540;

  const renderSlot = (snap: AssetDaySnapshot, x: number, y: number, w: number, h: number) => {
    const focused = focusedId === snap.asset.id;
    const dimmed = isDimmed(snap, lens);
    const stroke = statusStroke(snap.status);
    const isIn = snap.status === 'in';
    const isOut = snap.status === 'out' || snap.status === 'overdue';
    const isRepair = snap.status === 'repair';
    const isReimaging = snap.status === 'reimaging';

    const condColor =
      snap.asset.condition === 'new'
        ? 'var(--ok)'
        : snap.asset.condition === 'good'
          ? 'var(--accent-9)'
          : snap.asset.condition === 'worn'
            ? 'var(--warn)'
            : 'var(--bad)';

    const tagBg =
      snap.status === 'overdue'
        ? 'var(--warn)'
        : isRepair
          ? 'var(--bad)'
          : isReimaging
            ? 'var(--accent-9)'
            : 'var(--surface)';

    const tagFg = snap.status === 'overdue' || isRepair || isReimaging ? '#ffffff' : 'var(--fg)';

    return (
      <g
        key={snap.asset.id}
        transform={`translate(${x}, ${y})`}
        opacity={dimmed ? 0.25 : 1}
        role="button"
        tabIndex={0}
        aria-label={`${snap.asset.tag} ${snap.asset.model} — ${snap.status}`}
        data-testid={`board-slot-${snap.asset.tag}`}
        data-status={snap.status}
        className="cursor-pointer focus:outline-none"
        onClick={() => onSelect(snap.asset.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(snap.asset.id);
          }
        }}
      >
        {focused && (
          <rect
            x={-4}
            y={-4}
            width={w + 8}
            height={h + 8}
            rx={10}
            fill="none"
            stroke="var(--accent-9)"
            strokeWidth={2.5}
          />
        )}

        <circle cx={w / 2} cy={6} r={3.5} fill="var(--accent-9)" stroke="var(--border)" strokeWidth={1} />

        <g transform={`translate(${(w - (snap.asset.kind === 'laptop' ? 80 : 60)) / 2}, 10)`}>
          <path
            d={silhouettePath(snap.asset.kind)}
            fill={
              isIn
                ? lens === 'condition'
                  ? condColor
                  : 'var(--fg)'
                : isRepair
                  ? 'url(#repair-hatch)'
                  : 'none'
            }
            fillOpacity={isIn ? (lens === 'condition' ? 0.85 : 0.82) : 1}
            stroke={lens === 'condition' ? condColor : stroke}
            strokeWidth={isIn ? 1.5 : 1.75}
            strokeDasharray={isReimaging ? '4 3' : undefined}
          />
        </g>

        {(isOut || isRepair || isReimaging) && (
          <g
            transform={`translate(${w / 2}, 14)`}
            className={snap.status === 'overdue' && !reduced ? 'origin-top animate-pulse' : undefined}
          >
            <line x1={0} y1={-6} x2={0} y2={6} stroke="var(--muted)" strokeWidth={1.2} />
            <rect
              x={-26}
              y={6}
              width={52}
              height={32}
              rx={4}
              fill={tagBg}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <circle cx={0} cy={11} r={2} fill="var(--bg)" />
            <text
              x={0}
              y={23}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fontFamily="var(--font-mono, monospace)"
              fill={tagFg}
            >
              {isRepair ? 'FIX' : isReimaging ? 'IMG' : snap.borrowerInitials ?? 'OUT'}
            </text>
            <text
              x={0}
              y={34}
              textAnchor="middle"
              fontSize={8}
              fontFamily="var(--font-mono, monospace)"
              fill={tagFg}
              opacity={0.9}
            >
              {isRepair
                ? 'spanner'
                : isReimaging
                  ? snap.bufferEndsOn?.slice(5) ?? 'buf'
                  : snap.dueOn?.slice(5) ?? ''}
            </text>
          </g>
        )}

        <text
          x={w / 2}
          y={h - 4}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fontFamily="var(--font-mono, monospace)"
          fill={focused ? 'var(--accent-11)' : 'var(--muted)'}
        >
          {snap.asset.tag}
        </text>
      </g>
    );
  };

  const laptops = byKind.get('laptop') ?? [];
  const phones = byKind.get('phone') ?? [];
  const hotspots = byKind.get('hotspot') ?? [];
  const keys = byKind.get('security-key') ?? [];
  const headsets = byKind.get('headset') ?? [];

  return (
    <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 select-none">
      <svg
        viewBox={`0 0 ${boardW} ${boardH}`}
        className="w-full max-w-[920px] h-auto max-h-[68vh] drop-shadow-sm"
        role="img"
        aria-label={`Shadow board pegboard for ${selectedDate}`}
      >
        <defs>
          <pattern id="pegboard-holes" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="9" cy="9" r="1.6" fill="var(--border)" opacity="0.55" />
          </pattern>
          <pattern
            id="repair-hatch"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad)" strokeWidth="1.5" opacity="0.65" />
          </pattern>
        </defs>

        <rect
          x={8}
          y={8}
          width={boardW - 16}
          height={boardH - 16}
          rx={14}
          fill="var(--surface)"
          stroke="var(--border)"
          strokeWidth={2}
        />
        <rect
          x={14}
          y={14}
          width={boardW - 28}
          height={boardH - 28}
          rx={10}
          fill="url(#pegboard-holes)"
        />

        {[
          [24, 24],
          [boardW - 24, 24],
          [24, boardH - 24],
          [boardW - 24, boardH - 24],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={4} fill="var(--accent-9)" opacity={0.7} />
        ))}

        <text x={padX} y={36} fontSize={10} fontWeight={700} letterSpacing={1.4} fill="var(--muted)">
          {GROUPS[0].label}
          {lens === 'utilisation' && utilByKind.laptop !== undefined
            ? ` · ${Math.round(utilByKind.laptop * 100)}% UTIL`
            : ''}
        </text>
        {laptops.map((s, i) => {
          const col = i % 7;
          const row = Math.floor(i / 7);
          return renderSlot(s, padX + col * 114, 44 + row * 94, 106, 86);
        })}

        <line x1={padX} y1={240} x2={boardW - padX} y2={240} stroke="var(--border)" strokeDasharray="3 3" />

        <text x={padX} y={258} fontSize={10} fontWeight={700} letterSpacing={1.4} fill="var(--muted)">
          {GROUPS[1].label}
          {lens === 'utilisation' && utilByKind.phone !== undefined
            ? ` · ${Math.round(utilByKind.phone * 100)}% UTIL`
            : ''}
        </text>
        {phones.map((s, i) => renderSlot(s, padX + i * 79, 266, 74, 80))}

        <line x1={padX} y1={362} x2={boardW - padX} y2={362} stroke="var(--border)" strokeDasharray="3 3" />

        <text x={padX} y={382} fontSize={10} fontWeight={700} letterSpacing={1.4} fill="var(--muted)">
          {KIND_LABEL.hotspot.toUpperCase()}S
          {lens === 'utilisation' && utilByKind.hotspot !== undefined
            ? ` · ${Math.round(utilByKind.hotspot * 100)}%`
            : ''}
        </text>
        {hotspots.map((s, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return renderSlot(s, padX + col * 92, 390 + row * 68, 84, 62);
        })}

        <text x={338} y={382} fontSize={10} fontWeight={700} letterSpacing={1.4} fill="var(--muted)">
          SECURITY KEYS
        </text>
        {keys.map((s, i) => renderSlot(s, 338 + i * 78, 412, 72, 78))}

        <text x={596} y={382} fontSize={10} fontWeight={700} letterSpacing={1.4} fill="var(--muted)">
          HEADSETS
        </text>
        {headsets.map((s, i) => renderSlot(s, 596 + i * 78, 412, 72, 78))}
      </svg>
    </div>
  );
}
