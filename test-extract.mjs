import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: 'C:/Users/victo/Proyectos/in_development/mise_en_place_sk-PF/.env' });

const { GoogleGenAI } = await import('@google/genai');

const IMAGE_PATH = 'C:/Users/victo/.claude/image-cache/f4377a98-3ae2-40ac-842b-4f471de07ca2/3.png';

const PROMPT = readFileSync(
  'C:/Users/victo/Proyectos/in_development/mise_en_place_sk-PF/src/lib/server/extract.ts',
  'utf-8'
).match(/const EXTRACTION_PROMPT = `([\s\S]*?)`;/)?.[1];

if (!PROMPT) { console.error('Could not extract prompt'); process.exit(1); }

const finalPrompt = PROMPT
  .replace('${VALID_CATEGORIES.length - 1}', '30')
  .replace('${categoryGuideBlock()}', 'Carnes y Embutidos, Pescados y Mariscos, Lácteos, Verduras y Hortalizas, Frutas, Bebidas, Panadería y Bollería')
  .replace('${UNCATEGORIZED_CATEGORY}', 'Sin categoría');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const imageData = readFileSync(IMAGE_PATH).toString('base64');
const ext = path.extname(IMAGE_PATH).toLowerCase().replace('.', '');
const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
console.log('mimeType:', mimeType, '| file size:', readFileSync(IMAGE_PATH).length, 'bytes');

const response = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ inlineData: { data: imageData, mimeType } }] }],
  config: { systemInstruction: finalPrompt },
});

const text = response.text ?? '';
const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ?? text.match(/(\{[\s\S]*\})/);
const json = jsonMatch?.[1] ?? text;

try {
  const parsed = JSON.parse(json);
  console.log('supplier:', parsed.supplier_name);
  console.log('total_amount:', parsed.total_amount);
  console.log('tax_base:', parsed.tax_base);
  console.log('tax_breakdown:', JSON.stringify(parsed.tax_breakdown, null, 2));
  console.log('tax_inferred:', parsed.tax_inferred ?? false);
  console.log('confidence:', parsed.confidence);
} catch {
  console.log('Raw response:', text.slice(0, 3000));
}
