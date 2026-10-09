import { useEffect, useMemo, useState } from 'react';
import { getRestaurantItems } from '../lib/db';
import { mapRestaurantItemRow } from '../lib/restaurantFood';
import { groupByCategory } from '../lib/restaurantChains';

// A restaurant as one thing in food search: a card among the results
// ("McDonald's · Burgers") that opens that chain's own menu page, with
// nothing from anywhere else mixed in.

const initials = (name) => name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export function ChainResultCards({ chains, onOpen }) {
  if (!chains.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Restaurants</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chains.map((chain) => (
          <button
            key={chain.id}
            onClick={() => onOpen(chain)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'var(--bg-card)', border: '1px solid var(--border-active)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 56 }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>
              {initials(chain.name)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chain.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
                {titleCase(chain.category) || 'Restaurant'} · full menu
              </span>
            </span>
            <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 16, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

const MAX_SEARCH_RESULTS = 60;

/**
 * One chain's menu: category chips, a search box that only looks inside this
 * chain, and the items themselves — drawn by `renderFood` so they behave
 * exactly like any other search result (expand, pick meal, add, favourite).
 */
export function ChainMenu({ chain, onBack, renderFood }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setItems(null); setError(null); setCategory(null); setFilter('');
    getRestaurantItems(chain.id)
      .then((rows) => { if (!cancelled) setItems(rows.map((row) => ({ ...mapRestaurantItemRow(row), category: row.category }))); })
      .catch((err) => { console.error('Restaurant menu failed:', err); if (!cancelled) setError("Couldn't load this menu. Check your connection and try again."); });
    return () => { cancelled = true; };
  }, [chain.id]);

  const groups = useMemo(() => (items ? groupByCategory(items) : []), [items]);
  const activeCategory = category ?? groups[0]?.category ?? null;
  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!items) return [];
    if (q) {
      const words = q.split(/\s+/);
      return items.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).slice(0, MAX_SEARCH_RESULTS);
    }
    return groups.find((g) => g.category === activeCategory)?.items || [];
  }, [items, groups, activeCategory, q]);

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0', minHeight: 32, marginBottom: 6 }}>
        <i className="ti ti-arrow-left" aria-hidden="true" /> Back to results
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: 'var(--accent-bg)', border: '1px solid var(--border-active)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>
          {initials(chain.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chain.name}</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {items ? `${items.length} menu item${items.length === 1 ? '' : 's'}` : 'Menu'}{chain.category ? ` · ${titleCase(chain.category)}` : ''}
          </div>
        </div>
      </div>

      {items === null && !error && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Loading menu…</div>}
      {error && <div role="alert" style={{ background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)' }}>{error}</div>}

      {items && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, color: 'var(--text-hint)', background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 10 }}>
          We don't have the {chain.name} menu yet.
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${chain.name}…`}
            aria-label={`Search ${chain.name} menu`}
            style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit', marginBottom: 10 }}
          />
          {!q && groups.length > 1 && (
            <div role="tablist" aria-label="Menu sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {groups.map((g) => {
                const on = g.category === activeCategory;
                return (
                  <button
                    key={g.category}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setCategory(g.category)}
                    style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: on ? 700 : 600, background: on ? 'var(--accent-bg)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--border-active)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}
                  >
                    {g.category} <span style={{ opacity: 0.7 }}>{g.items.length}</span>
                  </button>
                );
              })}
            </div>
          )}
          {q && visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-hint)' }}>Nothing on the {chain.name} menu matches "{filter.trim()}"</div>
          )}
          {visible.map(renderFood)}
        </>
      )}
    </div>
  );
}
