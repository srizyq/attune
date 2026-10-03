// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import RecipeEditor from './RecipeEditor';

afterEach(cleanup);

const recipe = {
  id: 'r1', name: 'Pre workout meal', servings: 1,
  items: [
    { name: 'Weetbix', cal: 268, protein: 8, carbs: 50, fat: 2, servingGrams: 60, loggedAmount: 2, loggedUnit: 'serving' },
    { name: 'Almond milk', cal: 102, protein: 2, carbs: 4, fat: 8, servingGrams: 375, loggedAmount: 375, loggedUnit: 'ml' },
  ],
};

function setup(over = {}) {
  const props = { recipe, onCancel: vi.fn(), onSave: vi.fn().mockResolvedValue(), onAddIngredient: vi.fn(), ...over };
  render(<RecipeEditor {...props} />);
  return props;
}

describe('RecipeEditor', () => {
  it('opens on the saved name, servings and each ingredient\'s real amount and unit', () => {
    setup();
    expect(screen.getByLabelText('Name')).toHaveValue('Pre workout meal');
    expect(screen.getByLabelText('Makes')).toHaveValue(1);
    expect(screen.getByLabelText('Amount of Weetbix')).toHaveValue(2);
    expect(screen.getByLabelText('Unit for Weetbix')).toHaveValue('serving');
    expect(screen.getByLabelText('Amount of Almond milk')).toHaveValue(375);
    expect(screen.getByLabelText('Unit for Almond milk')).toHaveValue('ml');
    expect(screen.getByTestId('per-serving')).toHaveTextContent('370 kcal per serving');
  });

  it('changing an amount updates the ingredient and the totals live', async () => {
    setup();
    const amount = screen.getByLabelText('Amount of Weetbix');
    await userEvent.clear(amount);
    await userEvent.type(amount, '3');
    expect(screen.getByTestId('per-serving')).toHaveTextContent('504 kcal per serving'); // 402 + 102
  });

  it('saves the new amounts as a snapshot with the quantity fields kept', async () => {
    const { onSave } = setup();
    const amount = screen.getByLabelText('Amount of Almond milk');
    await userEvent.clear(amount);
    await userEvent.type(amount, '750');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ name: 'Pre workout meal', servings: 1 });
    expect(saved.items[1]).toMatchObject({ name: 'Almond milk', cal: 204, servingGrams: 750, loggedAmount: 750, loggedUnit: 'ml' });
    expect(saved.items[0]).toMatchObject({ name: 'Weetbix', cal: 268, loggedAmount: 2 });
  });

  it('renames the recipe and changes how many servings it makes', async () => {
    const { onSave } = setup();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), '  Big pre workout  ');
    await userEvent.clear(screen.getByLabelText('Makes'));
    await userEvent.type(screen.getByLabelText('Makes'), '2');
    expect(screen.getByTestId('per-serving')).toHaveTextContent('185 kcal per serving');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Big pre workout', servings: 2 });
  });

  it('removes an ingredient', async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Weetbix' }));
    expect(screen.queryByLabelText('Amount of Weetbix')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].items.map((i) => i.name)).toEqual(['Almond milk']);
  });

  it('blocks saving, saying why, for an empty name, a blank amount, or no ingredients', async () => {
    const { onSave } = setup();
    const save = screen.getByRole('button', { name: 'Save changes' });
    await userEvent.clear(screen.getByLabelText('Name'));
    expect(save).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.clear(screen.getByLabelText('Amount of Weetbix'));
    expect(save).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/amount for Weetbix/);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Weetbix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Almond milk' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one ingredient/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows an error and stays open if saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ onSave: vi.fn().mockRejectedValue(new Error('offline')) });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('"Add ingredient" hands over the unsaved edits so they are not lost', async () => {
    const { onAddIngredient } = setup();
    const amount = screen.getByLabelText('Amount of Weetbix');
    await userEvent.clear(amount);
    await userEvent.type(amount, '4');
    await userEvent.click(screen.getByRole('button', { name: /Add ingredient/ }));
    const draft = onAddIngredient.mock.calls[0][0];
    expect(draft.name).toBe('Pre workout meal');
    expect(draft.items[0]).toMatchObject({ name: 'Weetbix', cal: 536, loggedAmount: 4 });
  });

  it('cancel does not save', async () => {
    const { onCancel, onSave } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a weight-less ingredient is edited in calories, with no unit picker', async () => {
    const { onSave } = setup({ recipe: { ...recipe, items: [{ name: 'Mystery sauce', cal: 80, protein: 1, carbs: 10, fat: 4 }] } });
    expect(screen.queryByLabelText('Unit for Mystery sauce')).toBeNull();
    const amount = screen.getByLabelText('Amount of Mystery sauce');
    await userEvent.clear(amount);
    await userEvent.type(amount, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].items[0]).toMatchObject({ cal: 40, servingGrams: null, loggedAmount: null });
  });
});
