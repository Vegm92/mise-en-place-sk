#!/usr/bin/env node
import { Command } from 'commander';
import { generateBatch, generateOne } from './engine.mjs';

const program = new Command();

program
  .name('synth')
  .description('Synthetic Spanish invoice/albarán generator — dev only');

program
  .command('generate')
  .description('Generate a batch of synthetic PDF documents with ground truth JSON')
  .option('-n, --count <n>', 'number of documents to generate', '10')
  .option('-o, --output <dir>', 'output directory', './output')
  .option('-s, --seed <n>', 'base seed (each doc increments by 1)')
  .option('-d, --difficulty <level>', 'easy|medium|hard|cursed (default: random)')
  .option('-t, --type <type>', 'factura|albaran (default: random)')
  .action(async (opts) => {
    const count = parseInt(opts.count, 10);
    const seed = opts.seed != null ? parseInt(opts.seed, 10) : undefined;
    console.log(`Generating ${count} documents → ${opts.output}`);
    const manifest = await generateBatch({
      count,
      outputDir: opts.output,
      seed,
      difficulty: opts.difficulty || null,
      docType: opts.type || null,
    });
    console.log(`Done. ${manifest.length} documents written to ${opts.output}`);
    console.log(`Manifest: ${opts.output}/_manifest.json`);
  });

program
  .command('preview')
  .description('Generate a single document and print the ground truth JSON')
  .option('-s, --seed <n>', 'seed', '42')
  .option('-d, --difficulty <level>', 'easy|medium|hard|cursed', 'easy')
  .option('-t, --type <type>', 'factura|albaran')
  .action(async (opts) => {
    const { seed: _seed, docType, difficulty, template, gt } = await generateOne({
      seed: parseInt(opts.seed, 10),
      difficulty: opts.difficulty,
      docType: opts.type || null,
    });
    console.log(`seed=${_seed} type=${docType} difficulty=${difficulty} template=${template}`);
    console.log(JSON.stringify(gt, null, 2));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
