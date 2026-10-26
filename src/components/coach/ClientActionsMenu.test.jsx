// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import ClientActionsMenu from './ClientActionsMenu';

const row = { id: 'l1', group_label: null, client: { id: 'c1', name: 'Maya Patel' } };
const setup = (props = {}) => {
  const handlers = { onSetGroup: vi.fn().mockResolvedValue(undefined), onRevoke: vi.fn(), onExport: vi.fn() };
  render(<ClientActionsMenu row={row} {...handlers} {...props} />);
  return handlers;
};
const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'More actions' }));

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ClientActionsMenu', () => {
  it('keeps everything out of the way until opened — a stray tap cannot reach Disconnect', async () => {
    setup();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect client' })).toBeNull();
    await openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('asks before disconnecting, and only disconnects on yes', async () => {
    const { onRevoke } = setup();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disconnect client' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Maya Patel'));
    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument(); // still open after "no"
    window.confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disconnect client' }));
    expect(onRevoke).toHaveBeenCalledWith('l1');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('names a group inline and saves it with Enter', async () => {
    const { onSetGroup } = setup();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Set group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cut{Enter}');
    expect(onSetGroup).toHaveBeenCalledWith('l1', 'Cut');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the current group, and starts the edit from it', async () => {
    setup({ row: { ...row, group_label: 'Online' } });
    await openMenu();
    expect(screen.getByText('Group: Online')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Set group' }));
    expect(screen.getByLabelText('Group name')).toHaveValue('Online');
  });

  it('exports a report and closes', async () => {
    const { onExport } = setup();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export a report' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape (returning focus to the button) and on a tap outside', async () => {
    setup();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus();
    await openMenu();
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('read-only (a team owner viewing a teammate\'s client): export only, nothing that changes the link', async () => {
    setup({ readOnly: true });
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Export a report' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Set group' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Disconnect client' })).toBeNull();
  });

  it('renders nothing at all when there is nothing to offer', () => {
    const { container } = render(<ClientActionsMenu readOnly />);
    expect(container).toBeEmptyDOMElement();
  });
});
