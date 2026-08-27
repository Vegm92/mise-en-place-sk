import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';

export const CATEGORY_GUIDE: Record<string, string> = {
	'Frutas y Verduras': 'fresh or minimally processed fruit, vegetables, mushrooms, herbs',
	'Carnes y Derivados': 'raw meat, poultry, game; offal; meat-based prepared foods',
	'Pescados y Mariscos': 'fresh, smoked, or cured fish; shellfish; seafood products',
	'Lácteos': 'milk, cream, butter, cheese, yoghurt, eggs',
	'Aceites y Conservas': 'cooking oils, vinegars, tinned/jarred foods, pickles, sauces',
	'Bebidas': 'water, soft drinks, juices, beer, spirits, non-wine alcohol',
	'Panadería y Bollería': 'bread, pastries, cakes, flour-based bakery goods',
	'Especias y Condimentos': 'spices, dried herbs, salt, pepper, mustards, seasonings',
	'Productos de Limpieza': 'detergents, disinfectants, cleaning cloths, hygiene supplies',
	'Congelados': 'frozen food of any type (meat, fish, veg, pre-cooked meals)',
	'Embutidos y Charcutería': 'cured meats, cold cuts, salami, chorizo, jamón, pâtés',
	'Vinos y Cavas': 'still wine, sparkling wine, cava, champagne, vermouth',
	'Café y Bebidas Calientes': 'coffee beans/pods/capsules, tea, hot chocolate, infusions',
	'Mantenimiento y Reparaciones':
		'repair services, HVAC, plumbing, electrical work, technical servicing of equipment',
	'Material y Menaje':
		'tableware, crockery, glassware, cutlery, kitchen utensils, small appliances',
	'Embalaje y Packaging': 'take-away containers, bags, cling film, napkins, food-grade packaging',
};

export const GUIDED_CATEGORIES: string[] = VALID_CATEGORIES.filter(
	(c) => c !== UNCATEGORIZED_CATEGORY,
);

export function categoryGuideBlock(): string {
	return GUIDED_CATEGORIES.map((c) => `${c.padEnd(26)} — ${CATEGORY_GUIDE[c]}`).join('\n');
}
