import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import puppeteer from 'puppeteer';
import { makeFactura } from './generators/factura.mjs';
import { makeAlbaran } from './generators/albaran.mjs';
import { SeededRng } from './rng.mjs';
import { FACTURA_TEMPLATES, ALBARAN_TEMPLATES, sampleDifficulty, selectMutations } from './config.mjs';
import { MUTATOR_MAP as WRONG_MATH_MAP } from './mutators/wrong_math.mjs';
import { MUTATOR_MAP as MISSING_MAP } from './mutators/missing_fields.mjs';
import { formatDate, formatMoney, DATE_STYLES, DECIMAL_STYLES, CURRENCY_STYLES } from './mutators/weird_formats.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');
const CSS_DIR = join(__dirname, '..', 'synth', 'templates', 'static', 'css');

const MUTATOR_MAP = { ...WRONG_MATH_MAP, ...MISSING_MAP };

export function buildEnv() {
  const env = nunjucks.configure(TEMPLATES_DIR, { autoescape: false });
  env.addFilter('int', v => Math.trunc(Number(v)));
  env.addFilter('sumattr', (arr, attr) =>
    (arr || []).reduce((s, it) => s + (Number(it[attr]) || 0), 0)
  );
  return env;
}

export function inlineCSS(html) {
  return html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\/([^/"']+\.css)["'][^>]*\/?>/g,
    (_match, filename) => {
      const cssPath = join(CSS_DIR, filename);
      if (!existsSync(cssPath)) return '';
      return `<style>${readFileSync(cssPath, 'utf8')}</style>`;
    }
  );
}

export function buildContext(rng, spec) {
  const dateStyle = rng.choice(DATE_STYLES);
  const decStyle = rng.choice(DECIMAL_STYLES);

  return {
    spec,
    css_path: '__CSS__',
    currency_symbol: '€',
    cif_label: 'CIF/NIF',
    watermark: spec.watermark || null,
    date_format: (d) => formatDate(d, dateStyle),
    format_money: (n) => (n == null ? '' : formatMoney(n, decStyle, 'no_symbol')),
    format_qty: (n) => {
      if (n == null) return '';
      return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(3)).toString();
    },
    format_pct: (r) => `${Math.round((r || 0) * 100)}%`,
  };
}

export async function generateOne(opts = {}) {
  const {
    seed = (Math.random() * 2 ** 32) >>> 0,
    difficulty = null,
    docType = null,
    errorMode = 'strict',
  } = opts;

  const rng = new SeededRng(seed);
  const diff = difficulty || sampleDifficulty(rng);
  const type = docType || (rng.random() < 0.6 ? 'factura' : 'albaran');

  let spec, gt, templateKey;
  if (type === 'factura') {
    ({ spec, gt } = makeFactura(rng, seed, diff, errorMode));
    templateKey = rng.choice(FACTURA_TEMPLATES);
  } else {
    ({ spec, gt } = makeAlbaran(rng, seed, diff));
    templateKey = rng.choice(ALBARAN_TEMPLATES);
  }

  const mutations = selectMutations(rng, diff, [], []);
  for (const mutName of mutations) {
    const fn = MUTATOR_MAP[mutName];
    if (fn) fn(spec, gt, rng);
  }

  gt._meta.template = `${templateKey}.html`;

  const env = buildEnv();
  const ctx = buildContext(rng, spec);
  let html = env.render(`${templateKey}.html`, ctx);
  html = inlineCSS(html);

  return { seed, docType: type, difficulty: diff, template: templateKey, html, gt };
}

export async function generateBatch(opts = {}) {
  const { count = 10, outputDir = './output', ...genOpts } = opts;
  mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const manifest = [];

  try {
    for (let i = 0; i < count; i++) {
      const seed =
        genOpts.seed != null
          ? (genOpts.seed + i) >>> 0
          : (Math.random() * 2 ** 32) >>> 0;

      const { docType, difficulty, template, html, gt } = await generateOne({
        ...genOpts,
        seed,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      await page.close();

      const base = `${String(i).padStart(4, '0')}_${docType}_seed${seed}`;
      writeFileSync(join(outputDir, `${base}.pdf`), pdf);
      writeFileSync(
        join(outputDir, `${base}_gt.json`),
        JSON.stringify(gt, null, 2)
      );

      manifest.push({
        index: i,
        seed,
        docType,
        difficulty,
        template,
        pdf: `${base}.pdf`,
        gt: `${base}_gt.json`,
      });

      process.stdout.write(`\r[${i + 1}/${count}] seed=${seed} ${docType}/${template}`);
    }
  } finally {
    await browser.close();
  }

  process.stdout.write('\n');
  writeFileSync(
    join(outputDir, '_manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}
