// Genera codigos-prueba.html con un QR y un código de barras por cada producto de ejemplo.
// Uso: npm run codigos   (luego abre codigos-prueba.html, imprímelo o muéstralo en otra pantalla)
const fs = require('fs'), QR = require('qrcode');
const items = [['FINAX-001', 'Pupusas (3)', '2.25'], ['FINAX-002', 'Café con pan', '1.50'], ['FINAX-003', 'Pasaje de bus', '0.25'],
  ['FINAX-004', 'Recarga de celular', '5.00'], ['FINAX-005', 'Entrada al cine', '4.50'], ['FINAX-006', 'Paracetamol', '1.75']];
(async () => {
  let bw = null; try { bw = require('bwip-js'); } catch {}
  let html = '<!doctype html><meta charset="utf-8"><title>Códigos de prueba · Finax</title><style>body{font-family:sans-serif;margin:20px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.c{border:1px solid #ccc;border-radius:10px;padding:12px;text-align:center;break-inside:avoid}img{max-width:100%}h3{margin:6px 0 2px}</style><h1>Códigos de prueba · Finax</h1><div class="g">';
  for (const [code, name, price] of items) {
    const qr = await QR.toDataURL(code, { width: 260, margin: 2 });
    let bar = '';
    if (bw) try { bar = '<img src="data:image/png;base64,' + (await bw.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: true })).toString('base64') + '">'; } catch {}
    html += `<div class="c"><img src="${qr}" width="170"><br>${bar}<h3>${name}</h3>$${price} · ${code}</div>`;
  }
  fs.writeFileSync('codigos-prueba.html', html + '</div>');
  console.log('Listo: codigos-prueba.html');
})();
