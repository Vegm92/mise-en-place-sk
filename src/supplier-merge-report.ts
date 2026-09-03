import 'dotenv/config';
import { reportSupplierMerges, formatSupplierMergeReport } from './lib/server/supplier-merge-report.js';

const report = await reportSupplierMerges();
console.info(formatSupplierMergeReport(report));
process.exit(0);
