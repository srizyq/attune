import { forwardRef } from 'react';

// Shared "bento" card container used across the whole app — promoted from
// settings/primitives.jsx (it had no Settings-specific assumptions, just
// the app's card tokens) so every screen can share one definition instead
// of hand-rolling background/border/radius/shadow per file. forwardRef
// since at least one call site (Expenditure's weight section) needs a DOM
// ref for scroll-to-section deep links.
const Card = forwardRef(function Card({ children, style, ...rest }, ref) {
  return (
    <div
      ref={ref}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--card-radius)',
        padding: '24px',
        marginBottom: '16px',
        boxShadow: 'var(--card-shadow)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
