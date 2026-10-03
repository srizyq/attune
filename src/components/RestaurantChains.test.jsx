// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const getRestaurantItems = vi.hoisted(() => vi.fn());
vi.mock('../lib/db', () => ({ getRestaurantItems }));

import { ChainResultCards, ChainMenu } from './RestaurantChains';

const row = (id, name, category, extra = {}) => ({
  id, chain_id: 'mcdonalds-au', chain_name: "McDonald's", name, category, size_label: null,
  serving_label: '1 serve', serving_grams: 100, calories: 300, protein_g: 10, carbs_g: 30, fat_g: 10, fibre_g: 1, sodium_mg: 400, sugar_g: 2, ...extra,
});
const chain = { id: 'mcdonalds-au', name: "McDonald's", category: 'burgers' };

beforeEach(() => {
  getRestaurantItems.mockReset();
  getRestaurantItems.mockResolvedValue([row('1', 'Big Mac', 'Burgers'), row('2', 'McChicken', 'Burgers'), row('3', 'Medium Fries', 'Sides'), row('4', 'Hash Brown', 'Breakfast')]);
});
afterEach(cleanup);

describe('ChainResultCards', () => {
  it('renders nothing with no chains', () => {
    const { container } = render(<ChainResultCards chains={[]} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows a card per chain and opens the one tapped', async () => {
    const onOpen = vi.fn();
    render(<ChainResultCards chains={[chain, { id: 'kfc-au', name: 'KFC', category: 'chicken' }]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /McDonald's/ }));
    expect(onOpen).toHaveBeenCalledWith(chain);
    expect(screen.getByRole('button', { name: /KFC/ })).toBeInTheDocument();
  });
});

describe('ChainMenu', () => {
  const renderFood = (f) => <div key={f.id} data-testid="food">{f.name}</div>;
  const names = () => screen.queryAllByTestId('food').map((n) => n.textContent);

  it('loads only that chain and lists the first section (A-Z) with a chip per section', async () => {
    render(<ChainMenu chain={chain} onBack={() => {}} renderFood={renderFood} />);
    await screen.findByText('4 menu items · Burgers');
    expect(getRestaurantItems).toHaveBeenCalledWith('mcdonalds-au');
    expect(names()).toEqual(['Hash Brown']); // Breakfast comes first alphabetically
    expect(screen.getAllByRole('tab').map((t) => t.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Breakfast 1', 'Burgers 2', 'Sides 1']);
  });

  it('switches section', async () => {
    render(<ChainMenu chain={chain} onBack={() => {}} renderFood={renderFood} />);
    await screen.findByRole('tab', { name: /Burgers/ });
    await userEvent.click(screen.getByRole('tab', { name: /Burgers/ }));
    expect(names()).toEqual(['Big Mac', 'McChicken']);
  });

  it('searches inside this chain across every section, and says so when nothing matches', async () => {
    render(<ChainMenu chain={chain} onBack={() => {}} renderFood={renderFood} />);
    const box = await screen.findByLabelText("Search McDonald's menu");
    await userEvent.type(box, 'mc');
    expect(names()).toEqual(['McChicken']);
    await userEvent.clear(box);
    await userEvent.type(box, 'fr');
    expect(names()).toEqual(['Medium Fries']);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText(/Nothing on the McDonald's menu matches/)).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('goes back', async () => {
    const onBack = vi.fn();
    render(<ChainMenu chain={chain} onBack={onBack} renderFood={renderFood} />);
    await userEvent.click(screen.getByRole('button', { name: /Back to results/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it('says so when the chain has no menu items yet', async () => {
    getRestaurantItems.mockResolvedValue([]);
    render(<ChainMenu chain={chain} onBack={() => {}} renderFood={renderFood} />);
    expect(await screen.findByText(/We don't have the McDonald's menu yet/)).toBeInTheDocument();
  });

  it('shows an error, not a blank page, when the menu cannot load', async () => {
    getRestaurantItems.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ChainMenu chain={chain} onBack={() => {}} renderFood={renderFood} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load this menu/));
  });
});
