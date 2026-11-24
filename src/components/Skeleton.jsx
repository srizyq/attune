import { ScanCard } from './scan/ScanKit';

// Placeholder shapes shown while a page's data is on its way. They sit where
// the real content will land, so nothing jumps when it arrives. The shimmer is
// pure CSS (.skeleton in index.css) and stills under reduced-motion.

export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  return <div className="skeleton" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

// Wraps a group of placeholders so assistive tech hears one "Loading" instead
// of a stack of empty boxes.
export function SkeletonGroup({ label = 'Loading', children, style, testId = 'skeleton' }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-testid={testId} style={style}>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 2, last = '60%', gap = 8, h = 12 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={h} w={i === lines - 1 && lines > 1 ? last : '100%'} />)}
    </div>
  );
}

// A card with an avatar/thumbnail on the left and two lines of text, the shape
// shared by recipe, friend, client and notification rows.
export function SkeletonRow({ thumb = 44, round = false, lines = 2 }) {
  return (
    <ScanCard style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
      <Skeleton w={thumb} h={thumb} r={round ? 99 : 12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton h={14} w="55%" style={{ marginBottom: 9 }} />
        {lines > 1 && <Skeleton h={11} w="80%" />}
      </div>
    </ScanCard>
  );
}

export function SkeletonRows({ rows = 3, ...rest }) {
  return Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} {...rest} />);
}

// A big photo card above a title, as the recipe list and recipe page open with.
export function SkeletonHero({ height = 170 }) {
  return (
    <ScanCard style={{ padding: 0, overflow: 'hidden' }}>
      <Skeleton h={height} r={0} />
      <div style={{ padding: 16 }}>
        <Skeleton h={18} w="60%" style={{ marginBottom: 10 }} />
        <Skeleton h={12} w="35%" />
      </div>
    </ScanCard>
  );
}

// A card of label/value stats in a row (energy + macros, weekly totals, etc.).
export function SkeletonStats({ cols = 4 }) {
  return (
    <ScanCard style={{ display: 'flex', gap: 14, padding: '16px 16px 14px' }}>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} style={{ flex: '1 1 0', minWidth: 0 }}>
          <Skeleton h={9} w="70%" style={{ marginBottom: 10 }} />
          <Skeleton h={22} w="85%" style={{ marginBottom: 8 }} />
          <Skeleton h={9} w="45%" />
        </div>
      ))}
    </ScanCard>
  );
}

// A titled card holding a few lines — the generic "section" placeholder.
export function SkeletonCard({ lines = 3, title = true, height }) {
  return (
    <ScanCard style={height ? { minHeight: height } : undefined}>
      {title && <Skeleton h={10} w="30%" style={{ marginBottom: 14 }} />}
      <SkeletonLines lines={lines} />
    </ScanCard>
  );
}

// A whole page's worth, for the moment a screen's code or the sign-in check is
// still loading: a back-arrow header and a few cards.
export function PageSkeleton({ label = 'Loading' }) {
  return (
    <SkeletonGroup label={label} testId="page-skeleton" style={{ minHeight: 'var(--app-h)', background: 'var(--bg-primary)', padding: 'calc(16px + env(safe-area-inset-top)) 16px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Skeleton w={44} h={44} r={99} />
          <Skeleton w="40%" h={20} />
        </div>
        <SkeletonStats />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    </SkeletonGroup>
  );
}

// The dashboard's top block: weight and water on the left, today's calories on
// the right. Uses the same responsive grid class as the real cards.
export function DashboardHeroSkeleton() {
  return (
    <SkeletonGroup label="Loading your calories" testId="dash-hero-skeleton">
      <div className="dash-top-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 12, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <ScanCard style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 16px' }}>
          <Skeleton h={10} w="35%" />
          <Skeleton w={150} h={150} r={99} />
          <Skeleton h={12} w="55%" />
        </ScanCard>
      </div>
    </SkeletonGroup>
  );
}

// "Daily macronutrients": a label, then protein / carbs / fat tiles.
export function DashboardMacrosSkeleton() {
  return (
    <SkeletonGroup label="Loading your macros" testId="dash-macros-skeleton">
      <ScanCard style={{ padding: '16px 14px 14px', marginBottom: 20 }}>
        <Skeleton h={10} w="40%" style={{ margin: '0 2px 16px' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Skeleton w={64} h={64} r={99} />
              <Skeleton h={10} w="60%" />
            </div>
          ))}
        </div>
      </ScanCard>
    </SkeletonGroup>
  );
}
