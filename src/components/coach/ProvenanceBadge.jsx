import { PROVENANCE, provenanceOf } from '../../lib/provenance';

const TONE = {
  good: 'var(--accent)',
  fair: 'var(--gold)',
  ai: 'var(--ai-purple)',
  none: 'var(--text-hint)',
};

// A small tag saying where a logged food's numbers came from.
export default function ProvenanceBadge({ source }) {
  const tier = PROVENANCE[provenanceOf(source)];
  return (
    <span title={tier.description} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: TONE[tier.tone], border: `1px solid ${TONE[tier.tone]}`, borderRadius: 20, padding: '1px 8px' }}>
      {tier.short}
    </span>
  );
}
