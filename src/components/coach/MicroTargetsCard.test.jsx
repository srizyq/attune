// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import MicroTargetsCard from './MicroTargetsCard';
import { MICRO_NUTRIENTS } from '../../lib/microNutrients';

afterEach(cleanup);
const setup = (micro_targets = {}, onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<MicroTargetsCard clientData={{ name: 'Sam', micro_targets }} onSave={onSave} />);
  return onSave;
};

describe('MicroTargetsCard', () => {
  it('summarises what is set', () => {
    setup({});
    expect(screen.getByText(/no custom nutrient targets/)).toBeInTheDocument();
    cleanup();
    setup({ fibre: 30, iron: 18 });
    expect(screen.getByText('Custom targets set for 2 nutrients; the rest use standard guidelines.')).toBeInTheDocument();
    cleanup();
    setup({ fibre: 30 });
    expect(screen.getByText(/1 nutrient;/)).toBeInTheDocument();
  });

  it('offers an input for every nutrient, prefilled and with the default as placeholder', async () => {
    setup({ fibre: 35 });
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    for (const n of MICRO_NUTRIENTS) expect(screen.getByLabelText(`${n.label} (${n.unit})`)).toBeInTheDocument();
    expect(screen.getByLabelText('Fibre (g)')).toHaveValue(35);
    expect(screen.getByLabelText('Sodium (mg)')).toHaveValue(null);
    expect(screen.getByLabelText('Sodium (mg)')).toHaveAttribute('placeholder', '2300');
  });

  it('saves only what was filled in, as numbers', async () => {
    const onSave = setup({});
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText('Fibre (g)'), '30');
    await userEvent.type(screen.getByLabelText('Trans fat (g)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save nutrient targets' }));
    expect(onSave).toHaveBeenCalledWith({ fibre: 30, transFat: 0 });
    expect(await screen.findByRole('button', { name: /Edit/ })).toBeInTheDocument(); // back to the summary
  });

  it('clearing a box removes that target', async () => {
    const onSave = setup({ fibre: 30, iron: 18 });
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.clear(screen.getByLabelText('Fibre (g)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save nutrient targets' }));
    expect(onSave).toHaveBeenCalledWith({ iron: 18 });
  });

  it('rejects a bad value without saving', async () => {
    const onSave = setup({});
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText('Fibre (g)'), '-4');
    await userEvent.click(screen.getByRole('button', { name: 'Save nutrient targets' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Fibre must be a number/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the form open and shows the server\'s reason when saving fails', async () => {
    const onSave = setup({}, vi.fn().mockRejectedValue(new Error('Not an active trainer for this client')));
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText('Iron (mg)'), '18');
    await userEvent.click(screen.getByRole('button', { name: 'Save nutrient targets' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an active trainer');
    expect(screen.getByLabelText('Iron (mg)')).toHaveValue(18);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('cancel discards edits', async () => {
    const onSave = setup({});
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText('Fibre (g)'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(screen.getByLabelText('Fibre (g)')).toHaveValue(null);
    expect(onSave).not.toHaveBeenCalled();
  });
});
