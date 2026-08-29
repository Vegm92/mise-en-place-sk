/**
 * Issue #736 (sub-item 1): `linkableRecipes` used to call
 * `wouldCycle(graph, id, r.id)` once per candidate recipe — a full graph walk
 * per candidate, O(V*E) overall. It is replaced with `recipeAncestors(graph,
 * id)`, a single reverse BFS over the "contains" graph that runs in O(V+E)
 * and returns every recipe that transitively contains `id`.
 *
 * Equivalence being pinned here: for any candidateId,
 *
 *   wouldCycle(graph, id, candidateId)
 *     === (candidateId === id || recipeAncestors(graph, id).has(candidateId))
 *
 * `wouldCycle(graph, parentId, childId)` walks forward from `childId`
 * through childRecipeId edges and succeeds iff it reaches `parentId` — i.e.
 * iff `childId` transitively contains `parentId`. So
 * `wouldCycle(graph, id, candidateId)` is true iff `candidateId` transitively
 * contains `id` (or equals it) — exactly the "ancestors of id, plus id
 * itself" that `recipeAncestors` computes by walking the reverse edges
 * (child -> parent = "is contained by") starting at `id`.
 *
 * Both implementations run inside this test, against the same nontrivial
 * random directed graphs (including graphs with pre-existing cycles, which
 * `wouldCycle` is already expected to tolerate without hanging).
 */
import { describe, it, expect } from 'vitest';
import { recipeAncestors, wouldCycle, type RecipeNode, type RecipeRow } from '../src/lib/server/recipes';

// ── minimal graph builder — only childRecipeId edges matter to either algorithm ──

function stubRecipe(id: number): RecipeRow {
	return { id } as unknown as RecipeRow;
}

function stubNode(id: number, childIds: number[]): RecipeNode {
	return {
		recipe: stubRecipe(id),
		items: childIds.map((childRecipeId, i) => ({
			id: i,
			childRecipeId,
		})) as unknown as RecipeNode['items'],
	};
}

/** Deterministic PRNG (mulberry32) so a failure is reproducible. */
function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Builds a random directed graph over `n` recipe ids with `edgesPerNode` childRecipeId edges each (cycles allowed). */
function randomGraph(n: number, edgesPerNode: number, rand: () => number): Map<number, RecipeNode> {
	const graph = new Map<number, RecipeNode>();
	for (let id = 1; id <= n; id++) {
		const childIds: number[] = [];
		for (let e = 0; e < edgesPerNode; e++) {
			const target = 1 + Math.floor(rand() * n);
			if (target !== id) childIds.push(target); // skip trivial self-loops; wouldCycle(x,x) is covered separately
		}
		graph.set(id, stubNode(id, childIds));
	}
	return graph;
}

function oldExclusionSet(graph: Map<number, RecipeNode>, id: number): Set<number> {
	const excluded = new Set<number>();
	for (const candidateId of graph.keys()) {
		if (wouldCycle(graph, id, candidateId)) excluded.add(candidateId);
	}
	return excluded;
}

function newExclusionSet(graph: Map<number, RecipeNode>, id: number): Set<number> {
	const excluded = recipeAncestors(graph, id);
	excluded.add(id);
	return excluded;
}

describe('issue #736 — recipeAncestors is equivalent to the old per-candidate wouldCycle walk', () => {
	it('matches on hand-built chains (a contains b contains c)', () => {
		const graph = new Map<number, RecipeNode>([
			[1, stubNode(1, [2])],
			[2, stubNode(2, [3])],
			[3, stubNode(3, [])],
		]);
		for (const id of graph.keys()) {
			expect([...newExclusionSet(graph, id)].sort()).toEqual([...oldExclusionSet(graph, id)].sort());
		}
		// Sanity-check against the concrete wouldCycle assertions in recipe-cost.test.ts.
		expect(wouldCycle(graph, 1, 3)).toBe(false);
		expect(wouldCycle(graph, 3, 1)).toBe(true);
		expect(recipeAncestors(graph, 3).has(1)).toBe(true);
		expect(recipeAncestors(graph, 1).has(3)).toBe(false);
	});

	it('matches on a graph with a pre-existing cycle (corrupted data wouldCycle already tolerates)', () => {
		const graph = new Map<number, RecipeNode>([
			[1, stubNode(1, [2])],
			[2, stubNode(2, [1])], // 1 <-> 2 cycle
			[3, stubNode(3, [1])],
		]);
		for (const id of graph.keys()) {
			expect([...newExclusionSet(graph, id)].sort()).toEqual([...oldExclusionSet(graph, id)].sort());
		}
	});

	it('matches on a disconnected graph (isolated recipes, no edges at all)', () => {
		const graph = new Map<number, RecipeNode>([
			[1, stubNode(1, [])],
			[2, stubNode(2, [])],
			[3, stubNode(3, [])],
		]);
		for (const id of graph.keys()) {
			expect([...newExclusionSet(graph, id)]).toEqual([...oldExclusionSet(graph, id)]);
			expect(recipeAncestors(graph, id).size).toBe(0);
		}
	});

	it('matches for every id, on 30 random nontrivial directed graphs (30 nodes, 3 edges/node, with cycles)', () => {
		const rand = mulberry32(736);
		for (let trial = 0; trial < 30; trial++) {
			const n = 30;
			const graph = randomGraph(n, 3, rand);
			for (let id = 1; id <= n; id++) {
				const oldSet = oldExclusionSet(graph, id);
				const newSet = newExclusionSet(graph, id);
				expect(
					[...newSet].sort((a, b) => a - b),
					`trial ${trial}, id ${id}: mismatch between recipeAncestors-derived exclusion and wouldCycle-derived exclusion`
				).toEqual([...oldSet].sort((a, b) => a - b));
			}
		}
	});

	it('a cycle elsewhere in the graph does not pull unrelated recipes into the ancestor set', () => {
		const graph = new Map<number, RecipeNode>([
			[1, stubNode(1, [])], // unrelated — no edges in or out
			[2, stubNode(2, [3])],
			[3, stubNode(3, [2])], // 2 <-> 3 cycle, disjoint from 1
		]);
		expect(recipeAncestors(graph, 1).size).toBe(0);
		expect([...newExclusionSet(graph, 1)]).toEqual([...oldExclusionSet(graph, 1)]);
	});
});
