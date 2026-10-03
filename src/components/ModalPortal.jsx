import { createPortal } from 'react-dom';

// Renders a full-screen overlay (bottom sheet, modal) at the top of the app
// instead of wherever it was declared, so it can never be trapped underneath
// the floating bottom nav by a scroll container or animated card it happens
// to sit inside.
//
// The target is the theme wrapper (ThemeProvider's [data-theme] div), NOT
// document.body: the light/dark colour variables are defined on that wrapper,
// so a portal into <body> renders dark-theme colours for light-mode users.
// Outside the themed app (tests, public pages) it falls back to <body>.
export default function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  const target = document.querySelector('[data-theme]') || document.body;
  return createPortal(children, target);
}
