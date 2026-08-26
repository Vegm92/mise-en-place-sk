const hex=h=>{const s=h.replace('#','');return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));};
const lin=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
const L=h=>{const[r,g,b]=hex(h);return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);};
const cr=(a,b)=>{const l1=L(a),l2=L(b);const[hi,lo]=l1>l2?[l1,l2]:[l2,l1];return (hi+0.05)/(lo+0.05);};
const LG='#eceae6', DG='#0e0d10';
for (const c of ['#1a1a1a','#4d4d52','#56565b','#5d5d62','#63636a','#6b6b70'])
  console.log('light', c, cr(c,LG).toFixed(2));
for (const c of ['#e8e8ea','#a0a0a8','#9d9da5','#93939b','#8d8d94','#83838a'])
  console.log('dark ', c, cr(c,DG).toFixed(2));
