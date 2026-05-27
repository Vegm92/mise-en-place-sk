#!/usr/bin/env node
/**
 * Demo seed — creates a demo user with 55 invoices (50 clean + 5 with math errors)
 * spread over 12 months for a realistic analytics showcase.
 *
 * Usage:  node scripts/seed-demo.mjs
 * Idempotent: re-running skips user/restaurant creation if they already exist.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { makeFactura } from '../synth/js/generators/factura.mjs';
import { SeededRng } from '../synth/js/rng.mjs';
import { randomSupplier } from '../synth/js/data/suppliers.mjs';

// ── Config ─────────────────────────────────────────────────────────────────
const DEMO_EMAIL    = 'demo@mise-en-place.app';
const DEMO_PASSWORD = 'Demo2025!';
const DEMO_REST     = 'Restaurante Demo El Mercado';
const DEMO_SLUG     = 'restaurante-demo-el-mercado';

const TOTAL_INVOICES    = 50;
const MISTAKE_INVOICES  = 5;
const SUPPLIER_COUNT    = 9;

// ── Bootstrap DB and Supabase ──────────────────────────────────────────────
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 3 });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Helpers ────────────────────────────────────────────────────────────────
function isoDateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Spread N dates over the last `span` days using seeded jitter. */
function spreadDates(n, spanDays, rng) {
  const step = spanDays / n;
  return Array.from({ length: n }, (_, i) => {
    const base  = spanDays - Math.round(i * step);
    const jitter = rng.randint(-Math.round(step * 0.4), Math.round(step * 0.4));
    return isoDateDaysAgo(Math.max(1, Math.min(spanDays, base + jitter)));
  }).reverse(); // oldest first
}

// ── Step 1: Supabase auth user ─────────────────────────────────────────────
async function ensureDemoUser() {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users?.find(u => u.email === DEMO_EMAIL);
  if (existing) {
    console.log(`  ↳ demo user already exists (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  console.log(`  ↳ created demo user ${data.user.id}`);
  return data.user.id;
}

// ── Step 2: Restaurant row ─────────────────────────────────────────────────
async function ensureRestaurant(userId) {
  const [existing] = await sql`SELECT id FROM restaurants WHERE slug = ${DEMO_SLUG}`;
  if (existing) {
    console.log(`  ↳ restaurant already exists (${existing.id})`);
    return existing.id;
  }
  const [{ id: rid }] = await sql`
    INSERT INTO restaurants (name, slug) VALUES (${DEMO_REST}, ${DEMO_SLUG})
    RETURNING id
  `;
  await sql`
    INSERT INTO user_restaurants (user_id, restaurant_id, role)
    VALUES (${userId}, ${rid}, 'owner')
    ON CONFLICT DO NOTHING
  `;
  console.log(`  ↳ created restaurant ${rid}`);
  return rid;
}

// ── Step 3: Suppliers ──────────────────────────────────────────────────────
async function ensureSuppliers(restaurantId) {
  const rng = new SeededRng(999);

  // Generate a fixed pool of SUPPLIER_COUNT distinct suppliers
  const pool = [];
  for (let i = 0; i < SUPPLIER_COUNT; i++) {
    pool.push(randomSupplier(new SeededRng(1000 + i)));
  }

  const rows = await sql`SELECT id, name FROM suppliers WHERE restaurant_id = ${restaurantId}`;
  const existing = new Map(rows.map(r => [r.name, r.id]));

  const idMap = new Map(); // supplierName → db id
  for (const sup of pool) {
    if (existing.has(sup.name)) {
      idMap.set(sup.name, existing.get(sup.name));
      continue;
    }
    const [{ id }] = await sql`
      INSERT INTO suppliers (restaurant_id, name, category, contact_email, notes)
      VALUES (${restaurantId}, ${sup.name}, ${sup.category}, ${sup.email ?? null}, ${sup.cif ?? null})
      RETURNING id
    `;
    idMap.set(sup.name, id);
  }
  console.log(`  ↳ ${idMap.size} suppliers ready`);
  return { pool, idMap };
}

// ── Step 4: Invoices ───────────────────────────────────────────────────────
async function seedInvoices(restaurantId, supplierPool, idMap) {
  const rng = new SeededRng(42);
  const dates = spreadDates(TOTAL_INVOICES + MISTAKE_INVOICES, 365, new SeededRng(77));

  let inserted = 0;

  // ── 50 clean invoices ────────────────────────────────────────────────────
  for (let i = 0; i < TOTAL_INVOICES; i++) {
    const supplier = supplierPool[i % supplierPool.length];
    const spec     = makeFactura(new SeededRng(100 + i), 100 + i, 'easy', 'strict', supplier);
    const gt       = spec.gt;

    // Override date for realistic spread
    gt.invoice_date = dates[i];
    gt.due_date     = gt.due_date ? addDays(dates[i], 30) : null;

    const supplierId = idMap.get(supplier.name);
    const taxBreakdown = JSON.stringify(gt._meta.iva_breakdown ?? []);

    const [{ id: invId }] = await sql`
      INSERT INTO invoices
        (restaurant_id, supplier_id, invoice_number, invoice_date, due_date,
         total_amount, tax_base, tax_breakdown, status, confidence, source_file)
      VALUES
        (${restaurantId}, ${supplierId}, ${gt.invoice_number}, ${gt.invoice_date},
         ${gt.due_date ?? null}, ${gt.total_amount}, ${spec.spec.totals?.base_total ?? null},
         ${taxBreakdown}, 'approved', ${gt.confidence ?? 1.0}, 'synth-demo.pdf')
      RETURNING id
    `;

    for (const item of gt.line_items) {
      await sql`
        INSERT INTO invoice_line_items
          (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price, tax_rate)
        VALUES
          (${restaurantId}, ${invId}, ${item.description}, ${item.quantity},
           ${item.unit ?? null}, ${item.unit_price}, ${item.total_price},
           ${supplier.iva_rate ?? 0.10})
      `;
    }
    inserted++;
  }
  console.log(`  ↳ ${inserted} clean invoices inserted`);

  // ── 5 "mistake" invoices (wrong IVA math, pending review) ────────────────
  let mistakes = 0;
  const mistakeInvIds = [];
  for (let i = 0; i < MISTAKE_INVOICES; i++) {
    const supplier = supplierPool[(TOTAL_INVOICES + i) % supplierPool.length];
    const spec     = makeFactura(new SeededRng(200 + i), 200 + i, 'hard', 'wrong_iva_sum', supplier);
    const gt       = spec.gt;

    gt.invoice_date = dates[TOTAL_INVOICES + i];
    gt.due_date     = addDays(dates[TOTAL_INVOICES + i], 30);

    const supplierId  = idMap.get(supplier.name);
    const confidence  = 0.65 + (i * 0.04); // 0.65 – 0.81
    const taxBreakdown = JSON.stringify(gt._meta.iva_breakdown ?? []);

    const [{ id: invId }] = await sql`
      INSERT INTO invoices
        (restaurant_id, supplier_id, invoice_number, invoice_date, due_date,
         total_amount, tax_base, tax_breakdown, status, confidence, source_file, notes)
      VALUES
        (${restaurantId}, ${supplierId}, ${gt.invoice_number}, ${gt.invoice_date},
         ${gt.due_date}, ${gt.total_amount}, ${spec.spec.totals?.base_total ?? null},
         ${taxBreakdown}, 'pending', ${confidence}, 'synth-demo-err.pdf',
         'Discrepancia detectada en total IVA — pendiente revisión')
      RETURNING id
    `;
    mistakeInvIds.push({ invId, supplierId, gt, spec });

    for (const item of gt.line_items) {
      await sql`
        INSERT INTO invoice_line_items
          (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price, tax_rate)
        VALUES
          (${restaurantId}, ${invId}, ${item.description}, ${item.quantity},
           ${item.unit ?? null}, ${item.unit_price}, ${item.total_price},
           ${supplier.iva_rate ?? 0.10})
      `;
    }

    // Extraction correction: AI extracted wrong total
    const trueTax  = spec.spec.totals?.grand_total ?? gt.total_amount;
    const wrongVal = gt.total_amount.toFixed(2);
    const trueVal  = trueTax.toFixed(2);
    if (wrongVal !== trueVal) {
      await sql`
        INSERT INTO extraction_corrections
          (restaurant_id, invoice_id, supplier_id, field_name, original_value, corrected_value)
        VALUES
          (${restaurantId}, ${invId}, ${supplierId},
           'total_amount', ${wrongVal}, ${trueVal})
      `;
    }
    mistakes++;
  }
  console.log(`  ↳ ${mistakes} mistake invoices inserted (status=pending)`);
  return mistakeInvIds;
}

// ── Step 5: Category budgets ───────────────────────────────────────────────
async function seedBudgets(restaurantId) {
  const budgets = [
    ['Carnes y Derivados',       3200],
    ['Pescados y Mariscos',      2400],
    ['Frutas y Verduras',        1600],
    ['Lácteos',                   900],
    ['Bebidas',                   750],
    ['Panadería y Bollería',      500],
    ['Aceites y Conservas',       400],
    ['Embutidos y Charcutería',   600],
    ['Productos de Limpieza',     300],
  ];
  for (const [category, monthly_budget] of budgets) {
    await sql`
      INSERT INTO category_budgets (restaurant_id, category, monthly_budget)
      VALUES (${restaurantId}, ${category}, ${monthly_budget})
      ON CONFLICT (restaurant_id, category) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget
    `;
  }
  console.log(`  ↳ ${budgets.length} category budgets upserted`);
}

// ── Step 6: Sample notifications ──────────────────────────────────────────
async function seedNotifications(restaurantId, mistakeInvIds) {
  // Price shock on the first mistake invoice
  if (mistakeInvIds.length > 0) {
    const { invId, gt } = mistakeInvIds[0];
    const item = gt.line_items[0];
    const payload = JSON.stringify({ ingredient: item.description, pct_change: 18.4 });
    await sql`
      INSERT INTO system_notifications
        (restaurant_id, invoice_id, notification_type, message, payload, status)
      VALUES
        (${restaurantId}, ${invId}, 'price_shock',
         ${'Subida de precio detectada en ' + item.description + ' (+18.4%)'},
         ${payload}, 'pending')
      ON CONFLICT DO NOTHING
    `;

    // Budget alert on the second mistake invoice
    if (mistakeInvIds.length > 1) {
      const { invId: invId2 } = mistakeInvIds[1];
      const payloadB = JSON.stringify({ category: 'Carnes y Derivados', budget: 3200, spent: 3541.80 });
      await sql`
        INSERT INTO system_notifications
          (restaurant_id, invoice_id, notification_type, message, payload, status)
        VALUES
          (${restaurantId}, ${invId2}, 'budget_overrun',
           'Presupuesto de Carnes y Derivados superado este mes (110.7%)',
           ${payloadB}, 'pending')
        ON CONFLICT DO NOTHING
      `;
    }
  }
  console.log('  ↳ sample notifications inserted');
}

// ── Step 7: Supplier metrics ───────────────────────────────────────────────
async function seedMetrics(restaurantId, idMap) {
  const rng = new SeededRng(314);
  for (const [, supplierId] of idMap) {
    const score    = rng.randint(55, 98);
    const psScore  = rng.randint(50, 100);
    const freqScore = rng.randint(40, 100);
    const timeScore = rng.randint(60, 100);
    const cv       = parseFloat((rng.uniform(0.02, 0.18)).toFixed(4));
    await sql`
      INSERT INTO supplier_metrics
        (restaurant_id, supplier_id, score, price_stability_score, frequency_score,
         timeliness_score, price_stability_cv)
      VALUES
        (${restaurantId}, ${supplierId}, ${score}, ${psScore}, ${freqScore}, ${timeScore}, ${cv})
      ON CONFLICT (supplier_id)
      DO UPDATE SET score = EXCLUDED.score, price_stability_score = EXCLUDED.price_stability_score,
                    frequency_score = EXCLUDED.frequency_score, timeliness_score = EXCLUDED.timeliness_score,
                    price_stability_cv = EXCLUDED.price_stability_cv, computed_at = NOW()
    `;
  }
  console.log(`  ↳ supplier metrics upserted`);
}

// ── Main ───────────────────────────────────────────────────────────────────
try {
  console.log('\n🌱 Seeding demo account…\n');

  console.log('1. Auth user');
  const userId = await ensureDemoUser();

  console.log('2. Restaurant');
  const restaurantId = await ensureRestaurant(userId);

  console.log('3. Suppliers');
  const { pool, idMap } = await ensureSuppliers(restaurantId);

  console.log('4. Invoices (50 clean + 5 with mistakes)');
  const mistakeInvIds = await seedInvoices(restaurantId, pool, idMap);

  console.log('5. Category budgets');
  await seedBudgets(restaurantId);

  console.log('6. Notifications');
  await seedNotifications(restaurantId, mistakeInvIds);

  console.log('7. Supplier metrics');
  await seedMetrics(restaurantId, idMap);

  console.log('\n✅ Demo seeded successfully!');
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`   URL:      http://localhost:5173/login\n`);
} catch (err) {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
