#!/usr/bin/env bash
# Publica Finax en internet de forma TEMPORAL (túnel HTTPS de Cloudflare) y genera un código QR.
# Uso:  bash publicar.sh        (para cerrar todo: Ctrl+C)
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3000}"
SERVER_PID=""; TUNNEL_PID=""

command -v cloudflared >/dev/null || { echo "Falta cloudflared (mira la guía de instalación)."; exit 1; }
[ -f node_modules/qrcode/package.json ] || { echo "Falta la dependencia del QR. Ejecuta:  npm i qrcode"; exit 1; }

cleanup() { echo; echo "Cerrando Finax y el túnel..."; kill $SERVER_PID $TUNNEL_PID 2>/dev/null; wait 2>/dev/null; exit 0; }
trap cleanup INT TERM

echo "1/3 Iniciando Finax en modo público..."
# Modo público: cookies seguras, IP real detrás del túnel y límites de intentos más amplios (muchos comparten el mismo wifi)
NODE_ENV=production TRUST_PROXY=1 LOGIN_MAX="${LOGIN_MAX:-60}" DEMO_MAX="${DEMO_MAX:-120}" node server.js > servidor.log 2>&1 &
SERVER_PID=$!
sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "El servidor no arrancó. ¿Ya hay otro 'node server.js' abierto en el puerto $PORT? Detalle:"; cat servidor.log; exit 1
fi

echo "2/3 Abriendo el túnel seguro (HTTPS)..."
cloudflared tunnel --url "http://localhost:$PORT" > tunel.log 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 45); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunel.log 2>/dev/null | grep -v '^https://api\.' | head -n1)
  [ -n "$URL" ] && break
  kill -0 "$TUNNEL_PID" 2>/dev/null || break
  sleep 1
done
if [ -z "$URL" ]; then echo "No se pudo obtener la dirección pública. ¿Hay internet? Detalle:"; tail -n 15 tunel.log; cleanup; fi

echo "3/3 Generando el código QR..."
node qr.js "$URL"
echo
echo "  Finax está EN LÍNEA. Deja esta ventana abierta durante la exposición."
echo "  Presiona Ctrl+C para cerrar el servidor y el túnel."
wait
