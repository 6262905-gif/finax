// Genera el código QR de una dirección: node qr.js https://ejemplo.trycloudflare.com
const url = process.argv[2];
if (!url) { console.error('Uso: node qr.js <direccion>'); process.exit(1); }
console.log('\n  Dirección pública: ' + url + '\n');
(async () => {
  try {
    const QR = require('qrcode');
    await QR.toFile('qr-finax.png', url, { width: 900, margin: 2, color: { dark: '#191133', light: '#FFFFFF' } });
    console.log(await QR.toString(url, { type: 'terminal', small: true }));
    console.log('  Imagen del QR guardada en: qr-finax.png (para proyectarla o imprimirla)');
  } catch (e) {
    console.log('  No se pudo generar el QR (' + e.message + ').');
    console.log('  La dirección de arriba sí funciona: pégala en cualquier generador de QR.');
  }
})();
