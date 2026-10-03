// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const reportError = vi.fn();
vi.mock('../lib/reportError', () => ({ reportError: (...a) => reportError(...a) }));

import ErrorBoundary from './ErrorBoundary';

afterEach(() => { cleanup(); reportError.mockClear(); });

function Boom() { throw new Error('render exploded'); }

describe('ErrorBoundary', () => {
  it('renders its children normally', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows a recovery screen and reports the error when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'render exploded' }), expect.anything());
  });
});
