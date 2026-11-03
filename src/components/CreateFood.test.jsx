// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const label = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../lib/labelScan', () => ({ readNutritionLabel: label.read }));
// The camera is its own full-screen step; here it is just a button that "takes" a photo.
vi.mock('./CameraCapture', () => ({ default: ({ onCapture }) => <button onClick={() => onCapture(new File(['x'], 'label.jpg', { type: 'image/jpeg' }))}>Take photo</button> }));

import CreateFood from './CreateFood';

const setup = (props = {}) => {
  const handlers = { onClose: vi.fn(), onSave: vi.fn().mockResolvedValue({ id: 'f1' }), onLog: vi.fn().mockResolvedValue() };
  render(<CreateFood defaultMeal="Lunch" {...handlers} {...props} />);
  return handlers;
};
const type = (name, value) => userEvent.type(screen.getByLabelText(name), String(value));

beforeEach(() => { label.read.mockReset(); });
afterEach(cleanup);

describe('auto-calculate', () => {
  it('starts on, filling calories from the macros as they are typed', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Macro auto-calculate' })).toHaveAttribute('aria-pressed', 'true');
    await type('Protein (g)', 32); await type('Carbs (g)', 44); await type('Fat (g)', 18);
    expect(screen.getByLabelText('Calories 466')).toBeInTheDocument();           // 128 + 176 + 162
    expect(screen.getByText('128 kcal')).toBeInTheDocument();                    // per-macro calories under the tiles
    expect(screen.getByText('176 kcal')).toBeInTheDocument();
    expect(screen.getByText('162 kcal')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /match the macros 100 percent/ })).toBeInTheDocument();
  });

  it('switches to typing calories yourself, and the ring shows how well they agree', async () => {
    setup();
    await type('Protein (g)', 25);                                               // 100 kcal from macros
    await userEvent.click(screen.getByRole('button', { name: 'Macro auto-calculate' }));
    const cal = screen.getByLabelText('Calories');
    expect(cal).toHaveValue(100);                                                // keeps what was calculated
    await userEvent.clear(cal); await userEvent.type(cal, '200');
    expect(screen.getByRole('img', { name: /match the macros 50 percent/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('differ from what the macros add up to (100 kcal)');
    await userEvent.clear(cal); await userEvent.type(cal, '100');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is off from the start when a scan result brings its own calories', () => {
    setup({ initialFood: { name: 'Curry', cal: 520, protein: 30, carbs: 40, fat: 22, portion: '1 bowl' } });
    expect(screen.getByRole('button', { name: 'Macro auto-calculate' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Calories')).toHaveValue(520);
    expect(screen.getByLabelText('Food title *')).toHaveValue('Curry');
    expect(screen.getByLabelText('Unit / portion')).toHaveValue('1 bowl');
  });
});

describe('saving', () => {
  it('needs a name, and calories when auto-calculate is off', async () => {
    setup();
    expect(screen.getByRole('button', { name: /Save to My Foods/ })).toBeDisabled();
    await type('Food title *', 'Toast');
    expect(screen.getByRole('button', { name: /Save to My Foods/ })).toBeEnabled();       // auto: 0 kcal is allowed
    await userEvent.click(screen.getByRole('button', { name: 'Macro auto-calculate' }));
    expect(screen.getByRole('button', { name: /Save to My Foods/ })).toBeDisabled();       // manual: calories required
    await type('Calories', 80);
    expect(screen.getByRole('button', { name: /Save to My Foods/ })).toBeEnabled();
  });

  it('saves the food with everything entered, then closes', async () => {
    const { onSave, onLog, onClose } = setup();
    await type('Food title *', "Mum's lasagna");
    await type('Brand / source', 'Homemade');
    await type('Protein (g)', 32); await type('Carbs (g)', 44); await type('Fat (g)', 18); await type('Fibre (g)', 4);
    await userEvent.click(screen.getByRole('button', { name: 'Increase weight' }));       // 0 -> 5 g
    await userEvent.click(screen.getByRole('button', { name: /Save to My Foods/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({
      name: "Mum's lasagna", brand: 'Homemade', servingLabel: '1 serving', servingGrams: 5,
      cal: 466, protein: 32, carbs: 44, fat: 18, fibre: 4, sodium: 0, sugar: 0,
    });
    expect(onLog).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('can log it straight away to the chosen meal', async () => {
    const { onSave, onLog } = setup();
    await type('Food title *', 'Toast');
    await userEvent.click(screen.getByRole('button', { name: 'Dinner' }));
    await userEvent.click(screen.getByRole('button', { name: /Save & log immediately to Dinner/ }));
    await waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalled();
    expect(onLog.mock.calls[0][1]).toBe('Dinner');
    expect(onLog.mock.calls[0][0].name).toBe('Toast');
  });

  it('while building a recipe there is no logging and no meal chips', () => {
    setup({ onLog: undefined });
    expect(screen.queryByRole('button', { name: /Save & log/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Meal' })).not.toBeInTheDocument();
  });

  it('for people who log by time, logs at that time instead of a meal', () => {
    setup({ slotTime: '12:30 PM' });
    expect(screen.getByRole('button', { name: /Save & log immediately at 12:30 PM/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Meal' })).not.toBeInTheDocument();
  });

  it('says so when saving fails, and stays open', async () => {
    const { onClose } = setup({ onSave: vi.fn().mockRejectedValue(new Error('nope')) });
    await type('Food title *', 'Toast');
    await userEvent.click(screen.getByRole('button', { name: /Save to My Foods/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this food");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('scan label', () => {
  it('fills the form from the label and uses the label\'s own calories', async () => {
    label.read.mockResolvedValue({ serving: '1 bar (40g)', servingGrams: 40, cal: 190, protein: 12, carbs: 18, fat: 8, fibre: 3, sodium: 120, sugar: 5 });
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Scan label' }));
    await userEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(screen.getByLabelText('Protein (g)')).toHaveValue(12));
    expect(screen.getByLabelText('Calories')).toHaveValue(190);                          // typed-in mode now
    expect(screen.getByRole('button', { name: 'Macro auto-calculate' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Unit / portion')).toHaveValue('1 bar (40g)');
    expect(screen.getByLabelText('Serving weight in grams')).toHaveValue(40);
    expect(screen.getByLabelText('Sodium (mg)')).toHaveValue(120);                       // micronutrients opened for it
  });

  it('shows the reader\'s message when it fails and keeps what was typed', async () => {
    label.read.mockRejectedValue(new Error("Couldn't read this label. Try again or enter the numbers yourself."));
    setup();
    await type('Food title *', 'Bar');
    await userEvent.click(screen.getByRole('button', { name: 'Scan label' }));
    await userEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read this label");
    expect(screen.getByLabelText('Food title *')).toHaveValue('Bar');
  });
});

describe('save as recipe card', () => {
  const card = (over = {}) => ({ atLimit: false, photosSupported: true, create: vi.fn().mockResolvedValue({}), uploadPhoto: vi.fn().mockResolvedValue('u/p.jpg'), ...over });

  it('is only offered when it can be used', () => {
    setup();
    expect(screen.queryByRole('switch', { name: 'Save as recipe card' })).not.toBeInTheDocument();
  });

  it('also creates a one-ingredient recipe, with the photo when one was chosen', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:x'); global.URL.revokeObjectURL = vi.fn();
    const recipeCard = card();
    const { onSave } = setup({ recipeCard });
    await type('Food title *', 'Chia pudding');
    await type('Protein (g)', 10);
    await userEvent.click(screen.getByRole('switch', { name: 'Save as recipe card' }));
    fireEvent.change(screen.getByLabelText('Choose a recipe card photo'), { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } });
    await userEvent.click(screen.getByRole('button', { name: /Save to My Foods/ }));
    await waitFor(() => expect(recipeCard.create).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalled();
    const [name, items, servings, extras] = recipeCard.create.mock.calls[0];
    expect([name, servings, extras]).toEqual(['Chia pudding', 1, { photoPath: 'u/p.jpg' }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Chia pudding', loggedAmount: 1, loggedUnit: 'serving', protein: 10, cal: 40 });
    expect(recipeCard.uploadPhoto).toHaveBeenCalled();
  });

  it('does nothing extra when the switch is off', async () => {
    const recipeCard = card();
    setup({ recipeCard });
    await type('Food title *', 'Toast');
    await userEvent.click(screen.getByRole('button', { name: /Save to My Foods/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Saving/ })).not.toBeInTheDocument());
    expect(recipeCard.create).not.toHaveBeenCalled();
  });

  it('is switched off when the free recipe limit is reached', () => {
    setup({ recipeCard: card({ atLimit: true }) });
    expect(screen.getByRole('switch', { name: 'Save as recipe card' })).toBeDisabled();
  });

  it('without photo support still offers the recipe card, just no photo', () => {
    setup({ recipeCard: card({ photosSupported: false }) });
    expect(screen.getByRole('switch', { name: 'Save as recipe card' })).toBeEnabled();
    expect(screen.queryByLabelText('Choose a recipe card photo')).toBeInTheDocument();      // input exists but no button to open it
    expect(screen.queryByRole('button', { name: 'Add photo' })).not.toBeInTheDocument();
  });
});
