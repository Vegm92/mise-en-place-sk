import { palettes } from './palettes.mjs';
const hex = (h) => { const s=h.replace('#',''); return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)); };
const lin = (c) => { c/=255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
const L = (h) => { const [r,g,b]=hex(h); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
const cr = (a,b) => { const l1=L(a), l2=L(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05); };
const f = (n) => n.toFixed(2);
let bad = 0;
for (const p of palettes) {
  for (const mode of ['light','dark']) {
    const t = p[mode];
    const checks = [
      ['fg on surface', t.fg, t.surface, 4.5],
      ['fg on bg', t.fg, t.bg, 4.5],
      ['fg2 on surface', t.fg2, t.surface, 4.5],
      ['fg3 on surface', t.fg3, t.surface, 4.5],
      ['fg4 on surface', t.fg4, t.surface, 3.0],
      ['accFg on acc', t.accFg, t.acc, 4.5],
      ['acc text on surface', t.acc, t.surface, 4.5],
      ['acc text on bg', t.acc, t.bg, 4.5],
      ['pos on surface', t.pos, t.surface, 4.5],
      ['neg on surface', t.neg, t.surface, 4.5],
      ['warn on surface', t.warn, t.surface, 4.5],
      ['caution on surface', t.caution, t.surface, 4.5],
      ['info on surface', t.info, t.surface, 4.5],
      ['pos on surface2', t.pos, t.surface2, 4.5],
      ['neg on surface2', t.neg, t.surface2, 4.5],
      ['warn on surface2', t.warn, t.surface2, 4.5],
      ['caution on surface2', t.caution, t.surface2, 4.5],
      ['acc on surface2', t.acc, t.surface2, 4.5],
    ];
    for (const [name, a, b, min] of checks) {
      const v = cr(a,b);
      if (v < min) { bad++; console.log(`FAIL ${p.key}/${mode}  ${name.padEnd(22)} ${f(v)} < ${min}  (${a} on ${b})`); }
    }
  }
}
console.log(bad === 0 ? 'ALL PASS' : `${bad} failures`);
