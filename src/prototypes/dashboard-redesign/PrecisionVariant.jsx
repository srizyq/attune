import { useState } from 'react';
import { mock } from './mockData';
import ThemeToggle from './ThemeToggle';
import AppNav from '../../components/AppNav';

// Uses the real, unmodified AppNav from the production app (not a
// recreation) so this reads as "Attune with this content design," not a
// standalone mockup — this is the actual sidebar/bottom-nav a user would
// see. It's intentionally still dark-only (that's how it exists in the
// app today); the light theme below just shows what pairing it with a
// light content area actually looks like, mismatch included, rather than
// hiding that the nav hasn't been redesigned yet.

// PRECISION — directly informed by real MacroFactor screenshots (their
// Expenditure, Food Search, and Weight Trend screens), not a guess at
// what a "data app" might look like. What actually carries their design:
// a high-contrast black/white/gray base (real black borders, not thin
// translucent ones), exactly ONE accent color used only where it's
// carrying real data (the chart line), a real chart with an uncertainty
// band instead of a bare line, a dark-pill-on-light-track segmented
// control for time range, dense "insights & data" change-rows with a
// trend badge, and small colorful (here: emoji, standing in for their
// custom illustrations) food icons as the one place warmth lives on a
// daily-use screen. None of my last two rounds had any of this — they
// were both "add color/boldness", which is the opposite of what
// actually makes MacroFactor read as premium instead of plain.

const accent = 'var(--accent)';

const THEMES = {
  light: {
    bg: '#ffffff', text: '#0a0a0a', textM: '#6b6b6b', textFaint: '#b0b0b0',
    borderStrong: '#0a0a0a', borderSoft: '#e7e7e5', pillTrack: '#f0f0ee',
    pillBg: '#0a0a0a', pillText: '#ffffff',
    bandFill: `color-mix(in srgb, ${accent} 13%, transparent)`,
  },
  dark: {
    bg: '#0a0a0a', text: '#f5f5f2', textM: '#8f8f89', textFaint: '#4a4a46',
    borderStrong: '#f5f5f2', borderSoft: '#242422', pillTrack: 'var(--pill-track)',
    pillBg: '#f5f5f2', pillText: '#0a0a0a',
    bandFill: `color-mix(in srgb, ${accent} 15%, transparent)`,
  },
};

function Icon({ name, style }) { return <i className={`ti ti-${name}`} style={style} />; }

function Pills({ options, active, C }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: C.pillTrack, borderRadius: 99, padding: 3 }}>
      {options.map(o => (
        <div key={o} style={{
          padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
          background: o === active ? C.pillBg : 'transparent', color: o === active ? C.pillText : C.textM,
        }}>{o}</div>
      ))}
    </div>
  );
}

function ChangeRow({ label, value, trend, C }) {
  // Neutral by design: "down" isn't automatically bad (weight trending
  // down is often the whole point) and "up" isn't automatically good —
  // this just reports direction, the same way MacroFactor's own
  // expenditure-change rows do, and leaves the judgment to the reader.
  const up = trend === 'up';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ fontSize: 13, color: C.textM }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.textM }}>
          <Icon name={up ? 'trending-up' : 'trending-down'} style={{ fontSize: 12 }} />
          {up ? 'Increase' : 'Decrease'}
        </span>
      </div>
    </div>
  );
}

export default function PrecisionVariant() {
  const [theme, setTheme] = useState('light');
  const C = THEMES[theme];

  const pts = mock.weekCalories;
  const max = Math.max(...pts), min = Math.min(...pts);
  const norm = (v) => 60 - ((v - min) / (max - min || 1)) * 50 - 5;
  const linePts = pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${norm(v)}`).join(' ');
  const bandTop = pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${norm(v) - 6}`).join(' ');
  const bandBottom = pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${norm(v) + 6}`).reverse().join(' ');

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: C.bg }}>
      <AppNav active="dashboard" initials="S" />
      <div style={{ flex: 1, overflow: 'auto', fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '26px 28px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Good evening, {mock.name}</div>
            <div style={{ fontSize: 13, color: C.textM }}>{mock.date}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.borderStrong}`, borderRadius: 99, padding: '5px 12px' }}>
              <span style={{ fontSize: 13 }}>🔥</span><span style={{ fontSize: 12, fontWeight: 700 }}>{mock.streak}</span>
            </div>
            <ThemeToggle theme={theme === 'dark' ? 'dark' : 'light'} onToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')} activeColor={accent} trackColor={C.pillTrack} />
          </div>
        </div>

        {/* Calorie module — directly modelled on MacroFactor's Expenditure screen */}
        <div style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 11, color: C.textM, marginBottom: 2 }}>TODAY</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 700 }}>{mock.calorieConsumed.toLocaleString()} <span style={{ fontSize: 14, color: C.textM, fontWeight: 400 }}>/ {mock.calorieTarget.toLocaleString()} kcal</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: C.textM, marginBottom: 2 }}>REMAINING</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: accent }}>{(mock.calorieTarget - mock.calorieConsumed).toLocaleString()}</div>
            </div>
          </div>

          <svg viewBox="0 0 300 60" style={{ width: '100%', height: 70, marginTop: 14, marginBottom: 4 }} preserveAspectRatio="none">
            <polygon points={`${bandTop} ${bandBottom}`} fill={C.bandFill} />
            <polyline points={linePts} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((v, i) => (
              <circle key={i} cx={(i / (pts.length - 1)) * 300} cy={norm(v)} r={i === pts.length - 1 ? 3.5 : 2} fill={i === pts.length - 1 ? accent : C.bg} stroke={accent} strokeWidth="1.5" />
            ))}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            {mock.weekLabels.map(l => <span key={l} style={{ fontSize: 10, color: C.textFaint }}>{l}</span>)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pills options={['1W', '1M', '3M']} active="1W" C={C} />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.textM, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.bandFill, border: `1px solid ${accent}` }} />Flux range</span>
            </div>
          </div>
        </div>

        {/* Dense macro grid — modelled on the Food Log screen's 2x2 stat header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: C.borderSoft, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          {[{ l: 'Protein', v: mock.protein }, { l: 'Carbs', v: mock.carbs }, { l: 'Fat', v: mock.fat }].map(m => (
            <div key={m.l} style={{ background: C.bg, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: C.textM, marginBottom: 4 }}>{m.l.toUpperCase()}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700 }}>{m.v.value}<span style={{ fontSize: 12, color: C.textM, fontWeight: 400 }}>g / {m.v.target}g</span></div>
            </div>
          ))}
        </div>

        {/* Favourites row — small colorful icons, the one place warmth lives */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.textM, marginBottom: 12, letterSpacing: '0.04em' }}>FAVOURITES</div>
          <div style={{ display: 'flex', gap: 18, overflowX: 'auto' }}>
            {mock.favourites.map(f => (
              <div key={f.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ position: 'relative', width: 48, height: 48 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.pillTrack, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{f.emoji}</div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: accent, border: `2px solid ${C.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" style={{ fontSize: 10, color: '#0a0a0a' }} />
                  </div>
                </div>
                <span style={{ fontSize: 11, color: C.textM, whiteSpace: 'nowrap' }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[{ icon: 'plus', label: 'Log food' }, { icon: 'barcode', label: 'Scan barcode' }].map((s, i) => (
            <div key={i} style={{ flex: 1, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name={s.icon} style={{ fontSize: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Insights & Data — modelled directly on their change-row pattern */}
        <div>
          <div style={{ fontSize: 11, color: C.textM, marginBottom: 10, letterSpacing: '0.04em' }}>INSIGHTS &amp; DATA</div>
          <div style={{ background: C.pillTrack, borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="sparkles" style={{ color: accent, fontSize: 15, marginTop: 2 }} />
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>{mock.insight}</div>
          </div>
          <div>
            <ChangeRow label="Weight trend (7-day)" value="-0.5 kg" trend="down" C={C} />
            <ChangeRow label="Avg. expenditure" value={`${mock.expenditure.avg} kcal`} trend={mock.expenditure.diff >= 0 ? 'up' : 'down'} C={C} />
            <ChangeRow label="Logging streak" value={`${mock.streak} days`} trend="up" C={C} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
