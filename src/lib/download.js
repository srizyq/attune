// Browser-side output helpers for reports. Both must be called synchronously
// from a click handler — popup blockers (iOS Safari especially) refuse a
// window opened after an `await`, which is why the Reports tab builds the
// report first and only then offers these as separate buttons.

// Opens `html` in a new window and starts the print dialog (which is also
// how you Save as PDF). Returns false if the browser blocked the window.
export function openPrintWindow(html) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
