import { describe, it, expect } from 'vitest';
import { categoryOptions, resolveSubmittedCategory } from '../src/lib/category-options';

describe('categoryOptions', () => {
	it('appends a stored category missing from the tenant list', () => {
		expect(categoryOptions(['Bebidas', 'Lácteos'], 'Aceites y Conservas')).toEqual(['Bebidas', 'Lácteos', 'Aceites y Conservas']);
	});

	it('leaves the list unchanged when the stored category is listed or empty', () => {
		expect(categoryOptions(['Bebidas', 'Lácteos'], 'Lácteos')).toEqual(['Bebidas', 'Lácteos']);
		expect(categoryOptions(['Bebidas'], null)).toEqual(['Bebidas']);
		expect(categoryOptions(['Bebidas'], '')).toEqual(['Bebidas']);
	});

	it('does not mutate the input list', () => {
		const list = ['Bebidas'];
		categoryOptions(list, 'Aceites y Conservas');
		expect(list).toEqual(['Bebidas']);
	});
});

describe('resolveSubmittedCategory', () => {
	const selectable = ['Bebidas', 'Lácteos'];

	it('accepts a selectable category', () => {
		expect(resolveSubmittedCategory('Bebidas', selectable, 'Aceites y Conservas')).toBe('Bebidas');
	});

	it('keeps the stored category when it is resubmitted unchanged', () => {
		expect(resolveSubmittedCategory('Aceites y Conservas', selectable, 'Aceites y Conservas')).toBe('Aceites y Conservas');
	});

	it('rejects an unknown category that is not the stored one', () => {
		expect(resolveSubmittedCategory('Inventada', selectable, 'Aceites y Conservas')).toBeNull();
		expect(resolveSubmittedCategory('Inventada', selectable, null)).toBeNull();
	});

	it('clears the category when the blank option is submitted', () => {
		expect(resolveSubmittedCategory('', selectable, 'Aceites y Conservas')).toBeNull();
		expect(resolveSubmittedCategory(null, selectable, 'Bebidas')).toBeNull();
	});
});
