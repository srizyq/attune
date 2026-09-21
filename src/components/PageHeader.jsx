// The one header every app screen uses: big title, optional subtitle, round
// back button, right-hand actions, and an optional second row (date stepper,
// chips). Sticky and translucent so content slides under it like a native
// nav bar. Styles live in appshell.css (.app-page-header*), so the layout
// tests and every page get the same geometry.
export default function PageHeader({ title, subtitle, onBack, backLabel = 'Back', right, children, leading }) {
  return (
    <header className="app-page-header page-pad-top">
      <div className="app-page-header-row">
        {onBack && (
          <button type="button" className="app-icon-btn" onClick={onBack} aria-label={backLabel} title={backLabel}>
            <i className="ti ti-chevron-left" />
          </button>
        )}
        {leading}
        <div className="app-page-header-titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {right && <div className="app-page-header-right">{right}</div>}
      </div>
      {children && <div className="app-page-header-sub">{children}</div>}
    </header>
  );
}
