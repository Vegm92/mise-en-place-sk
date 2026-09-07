#!/usr/bin/env node
// Generates docs/diagrams/*.excalidraw from the declarative {nodes, edges} specs
// at the bottom of this file. Run: node scripts/gen-excalidraw.mjs
//
// Stroke convention (docs/system-design-audit.md):
//   solid  #1e1e1e  exists in the repo, cited at path:line
//   dashed #e03131  missing, and its absence is a risk
//   dashed #1971c2  proposed, label carries the metric trigger that justifies it

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'diagrams');

const STYLES = {
	exists:   { strokeColor: '#1e1e1e', strokeStyle: 'solid'  },
	missing:  { strokeColor: '#e03131', strokeStyle: 'dashed' },
	proposed: { strokeColor: '#1971c2', strokeStyle: 'dashed' },
};

const NODE_W = 260;
const H_GAP = 70;   // >= 60
const V_GAP = 110;  // >= 90
const PAD_Y = 14;
const MARGIN = 60;
const CENTER_X = 1100;
const LINE_HEIGHT = 1.25;

function makeBase() {
	let seq = 0;
	return function base(id, type, extra) {
		const n = ++seq;
		return {
			id,
			type,
			angle: 0,
			backgroundColor: 'transparent',
			fillStyle: 'solid',
			strokeWidth: 2,
			roughness: 1,
			opacity: 100,
			groupIds: [],
			frameId: null,
			seed: 1000 + n,
			version: 1,
			versionNonce: 5000 + n,
			isDeleted: false,
			boundElements: [],
			updated: 1,
			link: null,
			locked: false,
			...extra,
		};
	};
}

function textHeight(label, fontSize) {
	return Math.round(label.split('\n').length * fontSize * LINE_HEIGHT);
}

function layout(nodes, fontSize) {
	const rows = new Map();
	for (const node of nodes) {
		if (!rows.has(node.row)) rows.set(node.row, []);
		rows.get(node.row).push(node);
	}
	const rowKeys = [...rows.keys()].sort((a, b) => a - b);
	const placed = new Map();
	let y = MARGIN;

	for (const key of rowKeys) {
		const row = rows.get(key);
		const rowHeight = Math.max(
			...row.map((n) => textHeight(n.label, fontSize) + 2 * PAD_Y),
			70,
		);
		const widths = row.map((n) => n.width ?? NODE_W);
		const total = widths.reduce((a, b) => a + b, 0) + H_GAP * (row.length - 1);
		let x = Math.round(CENTER_X - total / 2);
		row.forEach((node, i) => {
			placed.set(node.id, { ...node, x, y, width: widths[i], height: rowHeight });
			x += widths[i] + H_GAP;
		});
		y += rowHeight + V_GAP;
	}
	return placed;
}

function anchors(from, to) {
	if (from.y + from.height <= to.y) {
		return [
			[from.x + from.width / 2, from.y + from.height],
			[to.x + to.width / 2, to.y],
		];
	}
	if (to.y + to.height <= from.y) {
		return [
			[from.x + from.width / 2, from.y],
			[to.x + to.width / 2, to.y + to.height],
		];
	}
	const leftFirst = from.x <= to.x;
	return leftFirst
		? [[from.x + from.width, from.y + from.height / 2], [to.x, to.y + to.height / 2]]
		: [[from.x, from.y + from.height / 2], [to.x + to.width, to.y + to.height / 2]];
}

export function buildExcalidraw(spec) {
	const base = makeBase();
	const fontSize = spec.fontSize ?? 16;
	const edgeFontSize = spec.edgeFontSize ?? 12;
	const placed = layout(spec.nodes, fontSize);
	const elements = [];
	const bound = new Map();

	for (const node of placed.values()) {
		const style = STYLES[node.style ?? 'exists'];
		const th = textHeight(node.label, fontSize);
		const textId = `${node.id}__t`;
		elements.push(
			base(node.id, 'rectangle', {
				x: node.x,
				y: node.y,
				width: node.width,
				height: node.height,
				roundness: { type: 3 },
				...style,
			}),
		);
		elements.push(
			base(textId, 'text', {
				x: node.x + 10,
				y: node.y + Math.round((node.height - th) / 2),
				width: node.width - 20,
				height: th,
				roundness: null,
				text: node.label,
				originalText: node.label,
				fontSize,
				fontFamily: 1,
				textAlign: 'center',
				verticalAlign: 'middle',
				containerId: node.id,
				lineHeight: LINE_HEIGHT,
				...style,
			}),
		);
		bound.set(node.id, [{ type: 'text', id: textId }]);
	}

	spec.edges.forEach((edge, i) => {
		const from = placed.get(edge.from);
		const to = placed.get(edge.to);
		if (!from || !to) throw new Error(`edge ${edge.from}->${edge.to} references an unknown node`);
		const style = STYLES[edge.style ?? 'exists'];
		const [start, end] = anchors(from, to);
		const edgeId = `e${i + 1}`;
		const arrowBound = [];

		if (edge.label) {
			const labelId = `${edgeId}__t`;
			const th = textHeight(edge.label, edgeFontSize);
			const midX = (start[0] + end[0]) / 2;
			const midY = (start[1] + end[1]) / 2;
			elements.push(
				base(labelId, 'text', {
					x: Math.round(midX - 110),
					y: Math.round(midY - th / 2),
					width: 220,
					height: th,
					roundness: null,
					text: edge.label,
					originalText: edge.label,
					fontSize: edgeFontSize,
					fontFamily: 1,
					textAlign: 'center',
					verticalAlign: 'middle',
					containerId: edgeId,
					lineHeight: LINE_HEIGHT,
					...style,
				}),
			);
			arrowBound.push({ type: 'text', id: labelId });
		}

		elements.push(
			base(edgeId, 'arrow', {
				x: start[0],
				y: start[1],
				width: Math.abs(end[0] - start[0]),
				height: Math.abs(end[1] - start[1]),
				roundness: { type: 2 },
				points: [[0, 0], [end[0] - start[0], end[1] - start[1]]],
				lastCommittedPoint: null,
				startBinding: { elementId: edge.from, focus: 0, gap: 4 },
				endBinding: { elementId: edge.to, focus: 0, gap: 4 },
				startArrowhead: null,
				endArrowhead: 'arrow',
				boundElements: arrowBound,
				...style,
			}),
		);
		bound.get(edge.from).push({ type: 'arrow', id: edgeId });
		bound.get(edge.to).push({ type: 'arrow', id: edgeId });
	});

	for (const el of elements) {
		if (el.type === 'rectangle') el.boundElements = bound.get(el.id) ?? [];
	}

	return {
		type: 'excalidraw',
		version: 2,
		source: 'https://excalidraw.com',
		appState: { viewBackgroundColor: '#ffffff', gridSize: null },
		files: {},
		elements,
	};
}

// ---------------------------------------------------------------------------
// D1 — runtime-current
// ---------------------------------------------------------------------------
const D1 = {
	fontSize: 15,
	edgeFontSize: 11,
	nodes: [
		{ id: 'browser', row: 0, label: 'Browser / installed PWA\nvite-plugin-pwa\npackage.json:56' },
		{ id: 'cdn', row: 1, style: 'missing', label: 'CDN / edge cache\nNOT IN REPO' },
		{ id: 'web', row: 2, width: 340, label: 'SvelteKit web service (adapter-node)\nnumReplicas 1 · railway.json:10\nCMD node build · Dockerfile:49' },
		{ id: 'redis', row: 3, label: 'Upstash Redis (optional)\nrate-limiter.ts:18\nfalls back in-process' },
		{ id: 'pg', row: 3, width: 300, label: 'Postgres 17 (Railway)\ndb.ts:26 · pool max 20\nstatement_timeout 15s' },
		{ id: 'sentry', row: 3, label: 'Sentry\nhooks.server.ts:40\nworker.ts:37' },
		{ id: 'boss', row: 4, width: 340, label: 'pg-boss queues (pgboss schema in Postgres)\nqueue.ts:6-16 · 5 queues + 5 dead-letter' },
		{ id: 'worker', row: 5, width: 340, label: 'Worker service (node build/worker.js)\nrailway.worker.json:10 · numReplicas 1\nrestartPolicy ALWAYS' },
		{ id: 'gemini', row: 6, label: 'Google Gemini\nllm-provider.ts:32\nmodel env.ts:16' },
		{ id: 'bucket', row: 6, label: 'Railway bucket (S3 API)\nstorage.ts:48' },
		{ id: 'whatsapp', row: 6, label: 'WhatsApp (Baileys)\nworker.ts:138' },
		{ id: 'stripe', row: 6, label: 'Stripe webhook\napi/stripe-webhook\n/+server.ts:6' },
	],
	edges: [
		{ from: 'browser', to: 'cdn', style: 'missing', label: 'no CDN hop exists' },
		{ from: 'cdn', to: 'web', style: 'missing', label: 'MISSING' },
		{ from: 'browser', to: 'web', label: 'HTTPS · 300 req/min/user\nhooks.server.ts:33 · no client timeout' },
		{ from: 'web', to: 'redis', label: 'no timeout, no retry\nrate-limiter.ts:94' },
		{ from: 'web', to: 'pg', label: 'statement_timeout 15s db.ts:10\nno retry, no circuit breaker' },
		{ from: 'web', to: 'sentry', label: 'errors only\nhooks.server.ts:53' },
		{ from: 'pg', to: 'boss', label: 'enqueue retryLimit 2,\nretryDelay 30s, singletonKey\nqueue.ts:62' },
		{ from: 'boss', to: 'worker', label: 'batchSize 3, expireInSeconds 600\nworker.ts:80' },
		{ from: 'worker', to: 'gemini', label: 'timeout 120s extract.ts:584\n3 retries on 429/503 extract.ts:528' },
		{ from: 'worker', to: 'bucket', label: 'no timeout, no retry — MISSING\nextraction-worker.ts:314' },
		{ from: 'worker', to: 'whatsapp', label: 'retryLimit 3 queue.ts:113' },
		{ from: 'stripe', to: 'web', label: 'HMAC + idempotency_keys\nbilling.ts:680' },
	],
};

// ---------------------------------------------------------------------------
// D2 — data-model
// ---------------------------------------------------------------------------
const D2 = {
	fontSize: 13,
	edgeFontSize: 11,
	nodes: [
		{ id: 'restaurants', row: 0, width: 300, label: 'restaurants  ← TENANT ROOT\nPK id uuid · parent_id FK self\nschema.ts:7' },
		{ id: 'user_restaurants', row: 1, width: 300, label: 'user_restaurants\nPK (user_id, restaurant_id)\nno FK to users · no RLS\nschema.ts:27' },
		{ id: 'users', row: 1, style: 'missing', width: 260, label: 'users\nNO restaurant_id\nschema.ts:207' },
		{ id: 'accounts', row: 1, style: 'missing', label: 'accounts\nNO restaurant_id\nuser_id FK unindexed\nschema.ts:227' },
		{ id: 'suppliers', row: 2, label: 'suppliers  restaurant_id\nuq (rid, lower(name))\nschema.ts:36' },
		{ id: 'invoices', row: 2, width: 300, label: 'invoices  restaurant_id\nuq (rid, content_hash)\ndeleted_at soft delete\nschema.ts:70' },
		{ id: 'products', row: 2, label: 'products  restaurant_id\nuq (rid, name_key)\nschema.ts:158' },
		{ id: 'line_items', row: 3, width: 300, label: 'invoice_line_items  restaurant_id\nFK invoice_id, product_id\nschema.ts:133' },
		{ id: 'audit', row: 3, label: 'invoice_audit_log  restaurant_id\ncovers edit/claim/soft_delete\nonly · schema.ts:257' },
		{ id: 'batches', row: 4, label: 'upload_batches  restaurant_id\nrid FK unindexed\nschema.ts:453' },
		{ id: 'batch_items', row: 4, width: 300, label: 'batch_items  restaurant_id\nextracted_data jsonb in-row\nrid FK unindexed · schema.ts:459' },
		{ id: 'extraction_results', row: 4, width: 280, label: 'extraction_results  restaurant_id\nfield_confidences jsonb\nNO RLS policy · schema.ts:487' },
		{ id: 'dlq', row: 5, label: 'dead_letter_queue  restaurant_id\nnullable · schema.ts:642' },
		{ id: 'app_flags', row: 5, style: 'missing', label: 'app_flags\nNO restaurant_id\nschema.ts:599' },
		{ id: 'wa_session', row: 5, style: 'missing', label: 'whatsapp_session\nNO restaurant_id\ndata jsonb in-row · schema.ts:523' },
		{ id: 'heartbeats', row: 5, style: 'missing', label: 'worker_heartbeats\nNO restaurant_id\nschema.ts:676' },
	],
	edges: [
		{ from: 'restaurants', to: 'user_restaurants', label: 'FK restaurant_id CASCADE\nschema.ts:29' },
		{ from: 'users', to: 'accounts', label: 'FK user_id CASCADE\nschema.ts:228' },
		{ from: 'restaurants', to: 'suppliers', label: 'FK CASCADE schema.ts:38' },
		{ from: 'restaurants', to: 'invoices', label: 'FK CASCADE schema.ts:72' },
		{ from: 'restaurants', to: 'products', label: 'FK CASCADE schema.ts:160' },
		{ from: 'invoices', to: 'line_items', label: 'FK invoice_id CASCADE\nschema.ts:136' },
		{ from: 'invoices', to: 'audit', label: 'invoice_id — no FK\nschema.ts:260' },
		{ from: 'suppliers', to: 'line_items', label: 'via invoices.supplier_id\nunindexed schema.ts:73' },
		{ from: 'batches', to: 'batch_items', label: 'FK batch_id CASCADE\nschema.ts:461' },
		{ from: 'batch_items', to: 'extraction_results', label: 'FK batch_item_id SET NULL\nschema.ts:490' },
		{ from: 'batch_items', to: 'dlq', label: 'source_id, no FK\ndead-letter.ts:195' },
	],
};

// ---------------------------------------------------------------------------
// D5 — target-state
// ---------------------------------------------------------------------------
const D5 = {
	fontSize: 14,
	edgeFontSize: 11,
	nodes: [
		{ id: 'browser', row: 0, label: 'Browser / PWA\npackage.json:56' },
		{ id: 'cdn', row: 1, style: 'proposed', width: 300, label: 'CDN / edge cache (proposed)\nTRIGGER: web p95 > 300 ms\n(measured max bucket 140 ms)' },
		{ id: 'web', row: 2, width: 320, label: 'SvelteKit web · 1 replica\nrailway.json:10\nCPU avg 0.0012 vCPU of 8' },
		{ id: 'web2', row: 2, style: 'proposed', width: 300, label: 'Web replica #2 (proposed)\nTRIGGER: web CPU > 60% for 15 min\nAND UPSTASH_REDIS_REST_* set\nDEPLOYMENT.md:350' },
		{ id: 'cache', row: 3, style: 'proposed', width: 300, label: 'Read-through cache, dashboard\naggregates (proposed)\nTRIGGER: mv/query p95 > 500 ms' },
		{ id: 'pg', row: 3, width: 300, label: 'Postgres 17 primary\nCPU avg 0.014 vCPU of 8, max 0.049\ndisk 0.25 GB (7 d, Railway)' },
		{ id: 'replica', row: 3, style: 'proposed', width: 300, label: 'Read replica (proposed)\nTRIGGER: primary CPU > 60%\nsustained 15 min' },
		{ id: 'boss', row: 4, width: 320, label: 'pg-boss queues\nqueue.ts:6-16\nretry + dead-letter wired' },
		{ id: 'worker', row: 5, width: 300, label: 'Worker · 1 replica\nrailway.worker.json:10\nCPU avg 0.0053 vCPU of 8' },
		{ id: 'worker2', row: 5, style: 'proposed', width: 300, label: 'Worker replica #2 (proposed)\nTRIGGER: extract-invoice depth > 50\nOR queue wait p95 > 120 s\n(EXTRACTION_STALL_WARN_MS env.ts:22)' },
		{ id: 'dlq', row: 6, width: 280, label: 'dead_letter_queue table\nschema.ts:642\nadmin/dead-letters page' },
		{ id: 'dlqalert', row: 6, style: 'proposed', width: 300, label: 'DLQ paging rule (proposed)\nTRIGGER: pending rows > 10 / 24 h\nmonitoring.md:70-71' },
		{ id: 'audit', row: 6, style: 'proposed', width: 300, label: 'Full invoice audit trail (proposed)\nTRIGGER: write actions covered\n< 100% (today 3 of 6)' },
		{ id: 'fkidx', row: 7, style: 'proposed', width: 320, label: 'FK indexes: batch_items.restaurant_id,\nupload_batches.restaurant_id, accounts.user_id,\nextraction_corrections.* (proposed)\nTRIGGER: any seq scan on those tables' },
		{ id: 'rls', row: 7, style: 'missing', width: 300, label: 'RLS gaps: extraction_results,\nsupplier_aliases, categories,\nuser_restaurants have no policy' },
	],
	edges: [
		{ from: 'browser', to: 'cdn', style: 'proposed', label: 'static + public pages' },
		{ from: 'cdn', to: 'web', style: 'proposed', label: 'origin fetch' },
		{ from: 'browser', to: 'web', label: 'measured 33,874 req / 7 d\n0 x 5xx (Railway)' },
		{ from: 'web', to: 'web2', style: 'proposed', label: 'horizontal scale' },
		{ from: 'web', to: 'cache', style: 'proposed', label: 'aggregate reads' },
		{ from: 'web', to: 'pg', label: 'pool max 20 db.ts:11' },
		{ from: 'pg', to: 'replica', style: 'proposed', label: 'streaming replication' },
		{ from: 'pg', to: 'boss', label: 'queues live in Postgres' },
		{ from: 'boss', to: 'worker', label: 'batchSize 3 worker.ts:79' },
		{ from: 'worker', to: 'worker2', style: 'proposed', label: 'needs Upstash semaphore\nrate-limiter.ts:33' },
		{ from: 'worker', to: 'dlq', label: 'recordDeadLetter\ndead-letter.ts:148' },
		{ from: 'dlq', to: 'dlqalert', style: 'proposed', label: 'page on growth' },
		{ from: 'worker', to: 'audit', style: 'proposed', label: 'log create/confirm' },
		{ from: 'pg', to: 'fkidx', style: 'proposed', label: 'planner support' },
		{ from: 'pg', to: 'rls', style: 'missing', label: 'unprotected tables' },
	],
};

const DIAGRAMS = [
	['runtime-current', D1],
	['data-model', D2],
	['target-state', D5],
];

function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	for (const [name, spec] of DIAGRAMS) {
		const doc = buildExcalidraw(spec);
		const file = path.join(OUT_DIR, `${name}.excalidraw`);
		writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
		console.log(`wrote ${path.relative(ROOT, file)} (${doc.elements.length} elements)`);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
