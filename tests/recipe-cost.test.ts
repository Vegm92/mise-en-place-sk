import { describe, it, expect } from 'vitest';
import {
	convertQty, fromRate, grossFromNet, lineCostCents, netFromGross, parseDecimal, parseQty,
	recipeTotals, toAllergenList, toRate
} from '../src/lib/recipes';
import {
	computeRecipeCosts, wouldCycle,
	type ProductFacts, type RecipeNode, type ResolvedPrice
} from '../src/lib/server/recipes';
import { kitchenQty } from '../src/lib/server/recipes-sheet';

type ItemInput = Partial<{
	id: number; recipeId: number; kind: string; name: string; productId: number | null; childRecipeId: number | null;
	netQuantity: string; unit: string | null; unitCost: string | null; wastePct: string;
	allergens: string[]; kcal100: string | null; protein100: string | null;
	carbs100: string | null; fat100: string | null; note: string | null; sortOrder: number;
}>;

type RecipeInput = Partial<{
	id: number; name: string; kind: string; status: string; portions: string;
	yieldQty: string | null; yieldUnit: string | null; sellingPrice: string | null;
	vatPct: string | null; targetFoodCostPct: string | null;
}>;

let nextItemId = 1;

function item(overrides: ItemInput = {}) {
	return {
		id: nextItemId++, restaurantId: 'r', recipeId: 1, kind: 'free', name: 'linea',
		productId: null, childRecipeId: null, netQuantity: '1.0000', unit: 'kg',
		unitCost: null, wastePct: '0.00', allergens: [], kcal100: null, protein100: null,
		carbs100: null, fat100: null, note: null, sortOrder: 0,
		...overrides,
	} as unknown as RecipeNode['items'][number];
}

function node(recipe: RecipeInput, items: ItemInput[]): RecipeNode {
	const id = recipe.id ?? 1;
	return {
		recipe: {
			id, restaurantId: 'r', name: 'ficha', nameKey: 'ficha', kind: 'plato',
			status: 'active', section: null, portions: '1.000', yieldQty: null, yieldUnit: null,
			sellingPrice: null, vatPct: null, targetFoodCostPct: null, preparation: null,
			notes: null, createdAt: null, updatedAt: null,
			...recipe,
		} as unknown as RecipeNode['recipe'],
		items: items.map((i) => item({ recipeId: id, ...i })),
	};
}

function graphOf(...nodes: RecipeNode[]): Map<number, RecipeNode> {
	return new Map(nodes.map((n) => [n.recipe.id, n]));
}

describe('units', () => {
	it('converts inside the mass family', () => {
		expect(convertQty(1, 'kg', 'g')).toBe(1000);
		expect(convertQty(500, 'g', 'kg')).toBe(0.5);
	});

	it('converts inside the volume family', () => {
		expect(convertQty(1, 'L', 'ml')).toBe(1000);
		expect(convertQty(25, 'cl', 'ml')).toBe(250);
	});

	it('refuses to cross families rather than assuming 1 L = 1 kg', () => {
		expect(convertQty(1, 'L', 'kg')).toBeNull();
		expect(convertQty(1, 'ud', 'g')).toBeNull();
	});

	it('returns null for unknown units', () => {
		expect(convertQty(1, 'caja', 'kg')).toBeNull();
	});
});

describe('quantity and rate parsing', () => {
	it('parses quantities to four decimals and tolerates a comma', () => {
		expect(parseQty('0,8')).toBe('0.8000');
	});

	it('rounds half-up on the fifth decimal instead of truncating (issue #738)', () => {
		expect(parseQty('1.23456')).toBe('1.2346');
		expect(parseQty('1.23454')).toBe('1.2345');
	});

	it('rejects zero and non-numeric quantities', () => {
		expect(parseQty('0')).toBeNull();
		expect(parseQty('abc')).toBeNull();
	});

	it('keeps sub-cent unit rates that toCents would flatten to zero', () => {
		expect(toRate('0.0035')).toBe(35);
		expect(fromRate(35)).toBe('0.0035');
		expect(toRate('12.00')).toBe(120_000);
	});

	it('parseDecimal rounds half-up on the digit past its scale, matching toRate (issue #738)', () => {
		expect(parseDecimal('1.235', 2)).toBe('1.24');
		expect(parseDecimal('1.234', 2)).toBe('1.23');
		expect(parseDecimal('9.995', 2)).toBe('10.00');
	});

	it('bounds a parser to the integer-digit width its column allows, rejecting past it (issue #738)', () => {
		expect(parseDecimal('99999999.99', 2, 8)).toBe('99999999.99');
		expect(parseDecimal('100000000.00', 2, 8)).toBeNull();
		expect(parseQty('9999999999.0000', 10)).toBe('9999999999.0000');
		expect(parseQty('10000000000.0000', 10)).toBeNull();
	});

	it('a rounding carry that pushes past the integer-digit bound is still rejected (issue #738)', () => {
		expect(parseDecimal('99999999.995', 2, 8)).toBeNull();
	});
});

describe('merma', () => {
	it('grosses up the net quantity', () => {
		expect(grossFromNet(0.8, 15)).toBeCloseTo(0.941176, 6);
	});

	it('nets down the gross quantity, inverting exactly', () => {
		expect(netFromGross(grossFromNet(0.8, 15), 15)).toBeCloseTo(0.8, 10);
		expect(netFromGross(1, 15)).toBeCloseTo(0.85, 10);
	});

	it('treats a zero or absurd merma as no merma', () => {
		expect(grossFromNet(2, 0)).toBe(2);
		expect(grossFromNet(2, 100)).toBe(2);
	});

	it('charges the line at the gross weight', () => {
		expect(lineCostCents(grossFromNet(0.8, 15), toRate('12.00')!)).toBe(1129);
	});
});

describe('recipeTotals', () => {
	const base = {
		totalCostCents: 1600, portions: 4, sellingPrice: '18.50',
		vatPct: '10', targetFoodCostPct: '30',
	};

	it('computes food cost against the taxable base, not the shelf price', () => {
		const t = recipeTotals(base);
		expect(t.costPerPortionCents).toBe(400);
		expect(t.grossPriceCents).toBe(1850);
		expect(t.netPriceCents).toBe(1682);
		expect(t.foodCostPct).toBeCloseTo(23.78, 2);
	});

	it('derives margin as the complement of food cost', () => {
		const t = recipeTotals(base);
		expect(t.marginCents).toBe(1282);
		expect(t.marginPct).toBeCloseTo(100 - t.foodCostPct!, 10);
	});

	it('suggests a price that hits the target food cost', () => {
		const t = recipeTotals(base);
		expect(t.suggestedNetPriceCents).toBe(1333);
		expect(t.suggestedGrossPriceCents).toBe(1466);
	});

	it('leaves the ratios null when there is no selling price', () => {
		const t = recipeTotals({ ...base, sellingPrice: null });
		expect(t.netPriceCents).toBeNull();
		expect(t.foodCostPct).toBeNull();
		expect(t.marginPct).toBeNull();
		expect(t.suggestedGrossPriceCents).toBe(1466);
	});
});

describe('computeRecipeCosts — line pricing', () => {
	it('costs a free-text line from its manual price', () => {
		const graph = graphOf(node({ id: 1, portions: '4.000' }, [
			{ name: 'almejas', netQuantity: '0.8000', unit: 'kg', unitCost: '12.0000', wastePct: '15.00' },
		]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.totalCostCents).toBe(1129);
		expect(cost.costPerPortionCents).toBe(282);
		expect(cost.lines[0]!.priceSource).toBe('manual');
		expect(cost.lines[0]!.grossQty).toBeCloseTo(0.941176, 6);
	});

	it('prices a linked product from the latest invoice, converting the unit', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ kind: 'product', name: 'merluza', productId: 7, netQuantity: '200.0000', unit: 'g' },
		]));
		const prices = new Map<number, ResolvedPrice>([[7, {
			rateUnits: toRate('9.50')!, baseUnit: 'kg', source: 'invoice',
			asOf: '2026-08-12', supplierName: 'Pescados Rius',
		}]]);
		const cost = computeRecipeCosts(graph, prices).get(1)!;
		expect(cost.lines[0]!.priceSource).toBe('invoice');
		expect(cost.lines[0]!.priceAsOf).toBe('2026-08-12');
		expect(cost.lines[0]!.supplierName).toBe('Pescados Rius');
		expect(cost.totalCostCents).toBe(190);
	});

	it('lets a pinned manual price override the live purchase price', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ kind: 'product', name: 'merluza', productId: 7, netQuantity: '1.0000', unit: 'kg', unitCost: '8.0000' },
		]));
		const prices = new Map<number, ResolvedPrice>([[7, {
			rateUnits: toRate('9.50')!, baseUnit: 'kg', source: 'invoice', asOf: null, supplierName: null,
		}]]);
		const cost = computeRecipeCosts(graph, prices).get(1)!;
		expect(cost.lines[0]!.priceSource).toBe('manual');
		expect(cost.totalCostCents).toBe(800);
	});

	it('flags a line with no resolvable price instead of silently costing zero', () => {
		const graph = graphOf(node({ id: 1 }, [{ name: 'sal', netQuantity: '0.0100', unit: 'kg' }]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.lines[0]!.warnings).toContain('missing-price');
		expect(cost.missingPriceCount).toBe(1);
		expect(cost.warnings).toContain('no-price');
	});

	it('flags a unit mismatch rather than assuming a density', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ kind: 'product', name: 'aceite', productId: 3, netQuantity: '100.0000', unit: 'ml' },
		]));
		const prices = new Map<number, ResolvedPrice>([[3, {
			rateUnits: toRate('4.00')!, baseUnit: 'kg', source: 'invoice', asOf: null, supplierName: null,
		}]]);
		const cost = computeRecipeCosts(graph, prices).get(1)!;
		expect(cost.lines[0]!.warnings).toContain('unit-mismatch');
		expect(cost.lines[0]!.warnings).toContain('missing-price');
	});

	it('reports each line share of the total', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ name: 'a', netQuantity: '1.0000', unit: 'kg', unitCost: '3.0000' },
			{ name: 'b', netQuantity: '1.0000', unit: 'kg', unitCost: '1.0000' },
		]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.lines[0]!.sharePct).toBeCloseTo(75, 6);
		expect(cost.lines[1]!.sharePct).toBeCloseTo(25, 6);
	});
});

describe('computeRecipeCosts — sub-recipes', () => {
	const sofrito = node(
		{ id: 2, name: 'sofrito', kind: 'elaboracion', yieldQty: '2.0000', yieldUnit: 'kg' },
		[{ name: 'tomate', netQuantity: '2.0000', unit: 'kg', unitCost: '5.0000' }]
	);

	it('charges a sub-recipe line pro rata of the child yield', () => {
		const plato = node({ id: 1 }, [
			{ kind: 'recipe', name: 'sofrito', childRecipeId: 2, netQuantity: '0.2000', unit: 'kg' },
		]);
		const cost = computeRecipeCosts(graphOf(plato, sofrito), new Map()).get(1)!;
		expect(computeRecipeCosts(graphOf(plato, sofrito), new Map()).get(2)!.totalCostCents).toBe(1000);
		expect(cost.totalCostCents).toBe(100);
		expect(cost.lines[0]!.priceSource).toBe('child');
		expect(cost.depth).toBe(1);
	});

	it('converts the line unit into the child yield unit', () => {
		const plato = node({ id: 1 }, [
			{ kind: 'recipe', name: 'sofrito', childRecipeId: 2, netQuantity: '200.0000', unit: 'g' },
		]);
		const cost = computeRecipeCosts(graphOf(plato, sofrito), new Map()).get(1)!;
		expect(cost.totalCostCents).toBe(100);
	});

	it('rolls a sub-recipe allergens up into the parent sheet', () => {
		const salsa = node(
			{ id: 2, kind: 'elaboracion', yieldQty: '1.0000', yieldUnit: 'kg' },
			[{ name: 'nata', netQuantity: '1.0000', unit: 'kg', unitCost: '2.0000', allergens: ['lacteos'] }]
		);
		const plato = node({ id: 1 }, [
			{ kind: 'recipe', name: 'salsa', childRecipeId: 2, netQuantity: '0.1000', unit: 'kg' },
			{ name: 'pan', netQuantity: '0.1000', unit: 'kg', unitCost: '2.0000', allergens: ['gluten'] },
		]);
		const cost = computeRecipeCosts(graphOf(plato, salsa), new Map()).get(1)!;
		expect(cost.allergens.sort()).toEqual(['gluten', 'lacteos']);
	});

	it('reports allergens in canonical EU order, not Set insertion order (issue #737)', () => {
		const salsa = node(
			{ id: 2, kind: 'elaboracion', yieldQty: '1.0000', yieldUnit: 'kg' },
			[{ name: 'nata', netQuantity: '1.0000', unit: 'kg', unitCost: '2.0000', allergens: ['lacteos'] }]
		);
		const plato = node({ id: 1 }, [
			{ kind: 'recipe', name: 'salsa', childRecipeId: 2, netQuantity: '0.1000', unit: 'kg' },
			{ name: 'pan', netQuantity: '0.1000', unit: 'kg', unitCost: '2.0000', allergens: ['gluten'] },
		]);
		const cost = computeRecipeCosts(graphOf(plato, salsa), new Map()).get(1)!;
		expect(cost.allergens).toEqual(['gluten', 'lacteos']);
	});

	it('flags a missing child instead of crashing', () => {
		const plato = node({ id: 1 }, [
			{ kind: 'recipe', name: 'fantasma', childRecipeId: 99, netQuantity: '1.0000', unit: 'kg' },
		]);
		const cost = computeRecipeCosts(graphOf(plato), new Map()).get(1)!;
		expect(cost.lines[0]!.warnings).toContain('missing-child');
	});

	it('scales a sub-recipe line nutrition on the net quantity, not the gross (issue #728)', () => {
		const base = node(
			{ id: 2, kind: 'elaboracion', yieldQty: '1.0000', yieldUnit: 'kg' },
			[{ name: 'base', netQuantity: '1.0000', unit: 'kg', unitCost: '2.0000', kcal100: '100.00' }]
		);
		expect(computeRecipeCosts(graphOf(node({ id: 1 }, []), base), new Map()).get(2)!.totalCostCents)
			.toBe(200);

		const noWaste = node({ id: 1 }, [
			{ kind: 'recipe', name: 'base', childRecipeId: 2, netQuantity: '1.0000', unit: 'kg' },
		]);
		const costNoWaste = computeRecipeCosts(graphOf(noWaste, base), new Map()).get(1)!;
		expect(costNoWaste.totalCostCents).toBe(200);
		expect(costNoWaste.nutritionTotal!.kcal).toBeCloseTo(1000, 6);

		const withWaste = node({ id: 1 }, [
			{ kind: 'recipe', name: 'base', childRecipeId: 2, netQuantity: '1.0000', unit: 'kg', wastePct: '50.00' },
		]);
		const costWithWaste = computeRecipeCosts(graphOf(withWaste, base), new Map()).get(1)!;
		expect(costWithWaste.totalCostCents).toBe(400);
		expect(costWithWaste.nutritionTotal!.kcal).toBeCloseTo(1000, 6);
	});
});

describe('cycles', () => {
	it('renders a corrupted cyclic graph instead of hanging', () => {
		const a = node({ id: 1 }, [
			{ kind: 'recipe', name: 'b', childRecipeId: 2, netQuantity: '1.0000', unit: 'kg' },
		]);
		const b = node({ id: 2, kind: 'elaboracion', yieldQty: '1.0000', yieldUnit: 'kg' }, [
			{ kind: 'recipe', name: 'a', childRecipeId: 1, netQuantity: '1.0000', unit: 'kg' },
		]);
		const costs = computeRecipeCosts(graphOf(a, b), new Map());
		expect(costs.get(1)!.warnings).toContain('cycle');
		expect(costs.get(2)!.lines[0]!.warnings).toContain('cycle');
	});

	it('rejects a self-reference on the write side', () => {
		const a = node({ id: 1 }, []);
		expect(wouldCycle(graphOf(a), 1, 1)).toBe(true);
	});

	it('rejects an edge that would close a two-level loop', () => {
		const a = node({ id: 1 }, [
			{ kind: 'recipe', name: 'b', childRecipeId: 2, netQuantity: '1.0000', unit: 'kg' },
		]);
		const b = node({ id: 2 }, [
			{ kind: 'recipe', name: 'c', childRecipeId: 3, netQuantity: '1.0000', unit: 'kg' },
		]);
		const c = node({ id: 3 }, []);
		const graph = graphOf(a, b, c);
		expect(wouldCycle(graph, 1, 3)).toBe(false);
		expect(wouldCycle(graph, 3, 1)).toBe(true);
	});
});

describe('computeRecipeCosts — depth (issue #727)', () => {
	function chainLink(id: number, childId: number | null): RecipeNode {
		const items: ItemInput[] = [
			{ name: `own-${id}`, netQuantity: '1.0000', unit: 'kg', unitCost: '1.0000' },
		];
		if (childId !== null) {
			items.push({
				kind: 'recipe', name: `link-${childId}`, childRecipeId: childId,
				netQuantity: '1.0000', unit: 'kg',
			});
		}
		return node({ id, kind: 'elaboracion', yieldQty: '1.0000', yieldUnit: 'kg' }, items);
	}

	function chainGraph(ids: number[]): Map<number, RecipeNode> {
		const nodes = ids.map((id, i) => chainLink(id, i < ids.length - 1 ? ids[i + 1]! : null));
		return graphOf(...nodes);
	}

	it('costs a twelve-link chain of 100-cent recipes completely, with no depth cutoff', () => {
		const ids = Array.from({ length: 12 }, (_, i) => i + 1);
		const costs = computeRecipeCosts(chainGraph(ids), new Map());
		const root = costs.get(1)!;
		expect(root.totalCostCents).toBe(1200);
		expect(root.warnings).toEqual(['nutrition-partial']);
	});

	it('never reports missing-price on a chain where every line is priced', () => {
		const ids = Array.from({ length: 12 }, (_, i) => i + 1);
		const costs = computeRecipeCosts(chainGraph(ids), new Map());
		let missingPriceTotal = 0;
		for (const cost of costs.values()) {
			missingPriceTotal += cost.missingPriceCount;
			expect(cost.warnings).not.toContain('no-price');
		}
		expect(missingPriceTotal).toBe(0);
	});

	it('costs a sub-recipe the same standalone as when reached deep inside a long chain', () => {
		const ids = Array.from({ length: 12 }, (_, i) => i + 1);
		const inContext = computeRecipeCosts(chainGraph(ids), new Map()).get(9)!;
		const standalone = computeRecipeCosts(chainGraph([9, 10, 11, 12]), new Map()).get(9)!;
		expect(inContext.totalCostCents).toBe(400);
		expect(standalone.totalCostCents).toBe(400);
		expect(inContext.totalCostCents).toBe(standalone.totalCostCents);
	});
});

describe('allergens and nutrition', () => {
	it('keeps only the fourteen EU codes, deduplicated and in canonical order', () => {
		expect(toAllergenList(['moluscos', 'gluten', 'gluten', 'unicornio'])).toEqual(['gluten', 'moluscos']);
		expect(toAllergenList('gluten')).toEqual([]);
	});

	it('rolls macros up per portion from the net weight', () => {
		const graph = graphOf(node({ id: 1, portions: '2.000' }, [
			{ name: 'arroz', netQuantity: '0.2000', unit: 'kg', unitCost: '2.0000',
			  kcal100: '350.00', protein100: '7.00', carbs100: '78.00', fat100: '1.00' },
		]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.nutritionTotal!.kcal).toBeCloseTo(700, 6);
		expect(cost.nutritionPerPortion!.kcal).toBeCloseTo(350, 6);
		expect(cost.nutritionPerPortion!.protein).toBeCloseTo(7, 6);
	});

	it('marks the block partial and reports coverage when a line has no macros', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ name: 'arroz', netQuantity: '0.1000', unit: 'kg', unitCost: '2.0000', kcal100: '350.00' },
			{ name: 'sal', netQuantity: '0.0100', unit: 'kg', unitCost: '1.0000' },
		]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.nutritionPartial).toBe(true);
		expect(cost.nutritionCoverage).toEqual({ known: 1, total: 2 });
		expect(cost.warnings).toContain('nutrition-partial');
	});

	it('skips lines counted in units, where grams are unknowable', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ name: 'huevo', netQuantity: '2.0000', unit: 'ud', unitCost: '0.3000', kcal100: '150.00' },
		]));
		const cost = computeRecipeCosts(graph, new Map()).get(1)!;
		expect(cost.nutritionTotal).toBeNull();
		expect(cost.lines[0]!.warnings).toContain('nutrition-skipped');
	});
});

describe('inheritance from the product catalog', () => {
	const facts = new Map<number, ProductFacts>([[7, {
		allergens: ['lacteos'], kcal100: 717, protein100: 0.9, carbs100: 0.1, fat100: 81,
	}]]);
	const prices = new Map<number, ResolvedPrice>([[7, {
		rateUnits: toRate('8.00')!, baseUnit: 'kg', source: 'invoice', asOf: null, supplierName: null,
	}]]);

	it('takes allergens and macros from the linked product when the line declares none', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ kind: 'product', name: 'Mantequilla', productId: 7, netQuantity: '0.1000', unit: 'kg' },
		]));
		const cost = computeRecipeCosts(graph, prices, facts).get(1)!;
		expect(cost.allergens).toEqual(['lacteos']);
		expect(cost.nutritionTotal!.kcal).toBeCloseTo(717, 6);
	});

	it('lets the line override what the product declares', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ kind: 'product', name: 'Mantequilla', productId: 7, netQuantity: '0.1000', unit: 'kg',
			  allergens: ['soja'], kcal100: '600.00' },
		]));
		const cost = computeRecipeCosts(graph, prices, facts).get(1)!;
		expect(cost.allergens).toEqual(['soja']);
		expect(cost.nutritionTotal!.kcal).toBeCloseTo(600, 6);
	});

	it('does not inherit for a free-text line that names no product', () => {
		const graph = graphOf(node({ id: 1 }, [
			{ name: 'Mantequilla', netQuantity: '0.1000', unit: 'kg', unitCost: '8.0000' },
		]));
		const cost = computeRecipeCosts(graph, prices, facts).get(1)!;
		expect(cost.allergens).toEqual([]);
		expect(cost.nutritionTotal).toBeNull();
	});
});

describe('kitchenQty — what the cook reads on the pass', () => {
	it('drops sub-kilo masses to grams and sub-litre volumes to millilitres', () => {
		expect(kitchenQty(0.8, 'kg')).toBe('800 g');
		expect(kitchenQty(0.25, 'L')).toBe('250 ml');
	});

	it('keeps the larger unit once it reads better there', () => {
		expect(kitchenQty(1.5, 'kg')).toBe('1,5 kg');
		expect(kitchenQty(2000, 'g')).toBe('2 kg');
		expect(kitchenQty(1000, 'ml')).toBe('1 L');
	});

	it('leaves counted units alone, since grams are unknowable', () => {
		expect(kitchenQty(2, 'ud')).toBe('2 ud');
		expect(kitchenQty(3, null)).toBe('3');
	});
});
