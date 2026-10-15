require('dotenv').config();
const express = require('express'), mysql = require('mysql2/promise'), bcrypt = require('bcryptjs'),
  jwt = require('jsonwebtoken'), helmet = require('helmet'), rateLimit = require('express-rate-limit'),
  cookieParser = require('cookie-parser'), path = require('path'), crypto = require('crypto');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) throw new Error('Define JWT_SECRET largo en .env');
const db = mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS,
  database: process.env.DB_NAME, dateStrings: true, decimalNumbers: true, connectionLimit: 10 });

const app = express();
// Detrás de un túnel/proxy HTTPS (modo público) hay que confiar en el proxy para ver la IP real de cada visitante.
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); // activar CSP cuando saquemos el JS a archivos aparte
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/html5-qrcode'), { index: false })); // librería del lector QR/barras (npm i html5-qrcode)
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const T = { in: 'ingreso', out: 'gasto', save: 'ahorro' };
const ah = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Error del servidor' }); });
const bad = (res, m) => res.status(400).json({ error: m });
const money = v => Number.isFinite(v) && v > 0 && v <= 99999999.99;
// Límites por IP. En un evento muchos visitantes comparten el mismo wifi, por eso son ajustables (LOGIN_MAX / DEMO_MAX).
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: +process.env.LOGIN_MAX || 10, message: { error: 'Demasiados intentos. Espera unos minutos.' } });
const demoLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: +process.env.DEMO_MAX || 60, message: { error: 'Demasiadas demostraciones seguidas. Espera unos minutos.' } });

const startSession = (res, id) => res.cookie('token', jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '2h' }),
  { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 3600 * 1000 });
const auth = (req, res, next) => {
  try { req.uid = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id; next(); }
  catch { res.status(401).json({ error: 'No autenticado' }); }
};

/* ---------- Autenticación ---------- */
app.post('/api/auth/register', loginLimit, ah(async (req, res) => {
  const { name, apellido, email, pw } = req.body;
  if (!name?.trim() || !apellido?.trim() || name.length > 50 || apellido.length > 50) return bad(res, 'Nombre y apellido inválidos');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || email.length > 100) return bad(res, 'Correo inválido');
  if (email.toLowerCase().endsWith('@finax.demo')) return bad(res, 'Ese dominio está reservado para las cuentas de demostración');
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 72) return bad(res, 'La contraseña debe tener entre 8 y 72 caracteres');
  try {
    const [r] = await db.execute('INSERT INTO usuarios (nombre,apellido,correo,password_hash) VALUES (?,?,?,?)',
      [name.trim(), apellido.trim(), email.toLowerCase(), await bcrypt.hash(pw, 12)]);
    startSession(res, r.insertId); res.json({ ok: true });
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') return bad(res, 'Ese correo ya está registrado'); throw e; }
}));

app.post('/api/auth/login', loginLimit, ah(async (req, res) => {
  const { email, pw } = req.body;
  const [[u]] = await db.execute('SELECT id_usuario,password_hash FROM usuarios WHERE correo=?', [String(email || '').toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(pw || ''), u.password_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  startSession(res, u.id_usuario); res.json({ ok: true });
}));

/* ---------- Cuenta de demostración: cada visitante recibe su propia cuenta temporal con datos realistas ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;

function buildDemo(now = new Date()) {
  const today = ymd(now), cur = today.slice(0, 7), tx = [];
  const add = (tipo, cat, desc, amt, y, m, d) => {
    const dt = new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
    if (ymd(dt) <= today) tx.push({ tipo, cat, desc, amt, fecha: ymd(dt) });
  };
  for (let i = 5; i >= 0; i--) {
    const b = new Date(now.getFullYear(), now.getMonth() - i, 1), y = b.getFullYear(), m = b.getMonth();
    add('ingreso', 'ingreso', 'Salario', 850, y, m, 1);
    if (i % 2 === 1) add('ingreso', 'ingreso', 'Trabajo freelance', rnd(60, 140), y, m, 18);
    add('gasto', 'comida', 'Supermercado', rnd(45, 70), y, m, 3);
    add('gasto', 'comida', 'Supermercado', rnd(40, 65), y, m, 12);
    add('gasto', 'comida', 'Supermercado', rnd(40, 65), y, m, 22);
    add('gasto', 'comida', 'Almuerzo con amigos', rnd(8, 18), y, m, 8);
    add('gasto', 'comida', 'Cena', rnd(10, 22), y, m, 16);
    add('gasto', 'servicios', 'Energía eléctrica', rnd(26, 42), y, m, 5);
    add('gasto', 'servicios', 'Agua', rnd(9, 14), y, m, 6);
    add('gasto', 'servicios', 'Internet', 25, y, m, 7);
    if (i > 0) add('gasto', 'suscripciones', 'Streaming de video', 11.99, y, m, 1); // este mes queda pendiente de confirmar
    add('gasto', 'suscripciones', 'Música', 4.99, y, m, 10);
    add('gasto', 'transporte', 'Gasolina', rnd(18, 30), y, m, 4);
    add('gasto', 'transporte', 'Gasolina', rnd(18, 30), y, m, 19);
    add('gasto', 'ocio', 'Cine', rnd(9, 15), y, m, 14);
    add('gasto', 'ocio', 'Salida de fin de semana', rnd(20, 40), y, m, 26);
    if (i % 3 === 0) add('gasto', 'salud', 'Consulta médica', rnd(15, 30), y, m, 20);
  }
  // Metas de ahorro y sus abonos (cada abono también es un movimiento de ahorro)
  const goals = [
    { name: 'Viaje a la playa', emoji: '🏖️', target: 400, saved: 0 },
    { name: 'Laptop nueva', emoji: '💻', target: 1200, saved: 0 },
    { name: 'Fondo de emergencia', emoji: '🛟', target: 1500, saved: 0 }];
  [[0, 60, 4, 15], [0, 60, 2, 15], [1, 100, 3, 20], [1, 120, 1, 20], [2, 150, 2, 8], [2, 100, 0, 2]].forEach(([g, amt, back, d]) => {
    const b = new Date(now.getFullYear(), now.getMonth() - back, 1), dt = new Date(b.getFullYear(), b.getMonth(), d);
    if (ymd(dt) <= today) { goals[g].saved += amt; tx.push({ tipo: 'ahorro', cat: 'ahorro', desc: 'Ahorro: ' + goals[g].name, amt, fecha: ymd(dt), goal: g }); }
  });
  // Presupuestos calibrados con el mes actual para que se vean las alertas (comida ~85%, ocio superado)
  const sp = c => tx.filter(t => t.tipo === 'gasto' && t.cat === c && t.fecha.startsWith(cur)).reduce((a, t) => a + t.amt, 0);
  const cc = sp('comida'), oc = sp('ocio');
  const budgets = [
    { cat: 'comida', limit: cc >= 20 ? Math.ceil(cc / 0.88 / 5) * 5 : 250 },
    { cat: 'ocio', limit: oc >= 20 ? Math.max(10, Math.floor(oc / 1.2 / 5) * 5) : 60 },
    { cat: 'suscripciones', limit: 20 }];
  // Pagos recurrentes: "ultimo" = mes ya atendido; el streaming no tiene movimiento este mes, así que aparece como pendiente
  const recurring = [
    { tipo: 'ingreso', cat: 'ingreso', desc: 'Salario', amt: 850, dia: 1 },
    { tipo: 'gasto', cat: 'servicios', desc: 'Internet', amt: 25, dia: 7 },
    { tipo: 'gasto', cat: 'suscripciones', desc: 'Streaming de video', amt: 11.99, dia: 1 }]
    .map(r => ({ ...r, ultimo: tx.some(t => t.desc === r.desc && t.fecha.startsWith(cur)) ? cur : null }));
  // Mi mes en espejo: un mes pasado ya cerrado (se cumplen unas intenciones y otras no) y el mes en curso (en progreso)
  const prev = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const spm = (c, k) => tx.filter(t => t.tipo === 'gasto' && t.cat === c && t.fecha.startsWith(k)).reduce((a, t) => a + t.amt, 0);
  const intentions = [
    // mes pasado: ahorró 120 de 150 (se atrasa la meta), comida y transporte dentro de lo dicho, ocio se escapó
    { mes: prev, cat: 'ahorro', amt: 150 },
    { mes: prev, cat: 'comida', amt: Math.ceil((spm('comida', prev) + 25) / 5) * 5 },
    { mes: prev, cat: 'transporte', amt: Math.ceil((spm('transporte', prev) + 15) / 5) * 5 },
    { mes: prev, cat: 'ocio', amt: Math.max(10, Math.floor(spm('ocio', prev) * 0.6 / 5) * 5) },
    // mes en curso: todo "al día" salvo el ahorro, que va en camino
    { mes: cur, cat: 'ahorro', amt: 150 },
    { mes: cur, cat: 'comida', amt: budgets[0].limit },
    { mes: cur, cat: 'transporte', amt: Math.ceil((spm('transporte', cur) + 40) / 5) * 5 },
    { mes: cur, cat: 'ocio', amt: Math.max(20, Math.ceil(oc / 5) * 5 + 10) }];
  return { tx, goals, budgets, recurring, intentions };
}

app.post('/api/auth/demo', demoLimit, ah(async (req, res) => {
  const [[n]] = await db.execute("SELECT COUNT(*) n FROM usuarios WHERE correo LIKE 'demo-%@finax.demo'");
  if (n.n >= 400) await db.query("DELETE FROM usuarios WHERE correo LIKE 'demo-%@finax.demo' ORDER BY creado_en LIMIT 100");
  const d = buildDemo(), [cats] = await db.execute('SELECT clave, id_categoria FROM categorias');
  const id = Object.fromEntries(cats.map(c => [c.clave, c.id_categoria]));
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    const [u] = await cn.execute('INSERT INTO usuarios (nombre,apellido,correo,password_hash) VALUES (?,?,?,?)',
      ['Visitante', 'Demo', `demo-${crypto.randomBytes(5).toString('hex')}@finax.demo`, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)]);
    const uid = u.insertId;
    const gid = [];
    for (const g of d.goals) { const [r] = await cn.execute('INSERT INTO metas_ahorro (id_usuario,nombre,emoji,monto_objetivo,monto_ahorrado) VALUES (?,?,?,?,?)', [uid, g.name, g.emoji, g.target, g.saved]); gid.push(r.insertId); }
    await cn.query('INSERT INTO movimientos (id_usuario,id_categoria,id_meta,tipo,monto,fecha,descripcion) VALUES ?',
      [d.tx.map(t => [uid, id[t.cat], t.goal === undefined ? null : gid[t.goal], t.tipo, t.amt, t.fecha, t.desc])]);
    await cn.query('INSERT INTO presupuestos (id_usuario,id_categoria,monto_limite) VALUES ?', [d.budgets.map(b => [uid, id[b.cat], b.limit])]);
    await cn.query('INSERT INTO recurrentes (id_usuario,id_categoria,tipo,descripcion,monto,dia_mes,ultimo_mes) VALUES ?',
      [d.recurring.map(r => [uid, id[r.cat], r.tipo, r.desc, r.amt, r.dia, r.ultimo])]);
    await cn.query('INSERT INTO intenciones (id_usuario,id_categoria,mes,monto) VALUES ?', [d.intentions.map(i => [uid, id[i.cat], i.mes, i.amt])]);
    await cn.commit();
    startSession(res, uid); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

// Las cuentas de demostración se borran solas a las 24 horas (sus datos se eliminan en cascada)
const cleanDemo = () => db.execute("DELETE FROM usuarios WHERE correo LIKE 'demo-%@finax.demo' AND creado_en < (NOW() - INTERVAL 24 HOUR)")
  .catch(e => console.error('Limpieza de demos:', e.message));
cleanDemo(); setInterval(cleanDemo, 60 * 60 * 1000).unref();

app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

app.get('/api/auth/me', auth, ah(async (req, res) => {
  const [[u]] = await db.execute('SELECT nombre,apellido,correo,telefono FROM usuarios WHERE id_usuario=?', [req.uid]);
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  res.json({ name: `${u.nombre} ${u.apellido}`, nombre: u.nombre, apellido: u.apellido, email: u.correo, phone: u.telefono || '' });
}));

app.put('/api/profile', auth, ah(async (req, res) => {
  const { nombre, apellido, telefono } = req.body;
  if (!nombre?.trim() || !apellido?.trim() || nombre.length > 50 || apellido.length > 50) return bad(res, 'Nombre y apellido inválidos');
  const tel = String(telefono || '').trim();
  if (tel && !/^[0-9+()\-\s]{6,20}$/.test(tel)) return bad(res, 'Teléfono inválido (6 a 20 caracteres: números, +, -, paréntesis)');
  await db.execute('UPDATE usuarios SET nombre=?, apellido=?, telefono=? WHERE id_usuario=?', [nombre.trim(), apellido.trim(), tel || null, req.uid]);
  res.json({ ok: true });
}));

app.put('/api/auth/password', auth, loginLimit, ah(async (req, res) => {
  const { actual, nueva } = req.body;
  if (typeof nueva !== 'string' || nueva.length < 8 || nueva.length > 72) return bad(res, 'La nueva contraseña debe tener entre 8 y 72 caracteres');
  const [[u]] = await db.execute('SELECT password_hash FROM usuarios WHERE id_usuario=?', [req.uid]);
  if (!u || !(await bcrypt.compare(String(actual || ''), u.password_hash))) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
  if (actual === nueva) return bad(res, 'La nueva contraseña debe ser distinta a la actual');
  await db.execute('UPDATE usuarios SET password_hash=? WHERE id_usuario=?', [await bcrypt.hash(nueva, 12), req.uid]);
  res.json({ ok: true });
}));

/* ---------- Datos (todo filtrado por el usuario de la sesión) ---------- */
app.get('/api/data', auth, ah(async (req, res) => {
  const [tx] = await db.execute(
    `SELECT m.id_movimiento id, CASE m.tipo WHEN 'ingreso' THEN 'in' WHEN 'gasto' THEN 'out' ELSE 'save' END type,
     c.clave cat, m.descripcion \`desc\`, m.monto amt, m.fecha \`date\`
     FROM movimientos m JOIN categorias c USING (id_categoria) WHERE m.id_usuario=? ORDER BY m.fecha DESC, m.id_movimiento DESC`, [req.uid]);
  const [goals] = await db.execute(
    'SELECT id_meta id, nombre name, emoji, monto_objetivo target, monto_ahorrado saved FROM metas_ahorro WHERE id_usuario=?', [req.uid]);
  const [budgets] = await db.execute(
    `SELECT c.clave cat, p.monto_limite \`limit\` FROM presupuestos p JOIN categorias c USING (id_categoria) WHERE p.id_usuario=?`, [req.uid]);
  const [recurring] = await db.execute(
    `SELECT x.*, (x.active=1 AND (x.ult IS NULL OR x.ult <> DATE_FORMAT(CURDATE(),'%Y-%m')) AND CURDATE() >= x.due) AS pending FROM (
       SELECT r.id_recurrente id, CASE r.tipo WHEN 'ingreso' THEN 'in' ELSE 'out' END type, c.clave cat, r.descripcion \`desc\`,
              r.monto amt, r.dia_mes dia, r.activo active, r.ultimo_mes ult,
              DATE(DATE_ADD(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL LEAST(r.dia_mes, DAY(LAST_DAY(CURDATE()))) - 1 DAY)) due
       FROM recurrentes r JOIN categorias c USING (id_categoria) WHERE r.id_usuario=?) x
     ORDER BY x.dia, x.id`, [req.uid]);
  let intentions = [];
  try {
    [intentions] = await db.execute(
      `SELECT i.mes, c.clave cat, i.monto amt FROM intenciones i JOIN categorias c USING (id_categoria)
       WHERE i.id_usuario=? ORDER BY i.mes, i.id_intencion`, [req.uid]);
  } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; console.warn('Falta la tabla intenciones: ejecuta migracion_espejo.sql'); }
  res.json({ tx, goals, budgets, intentions, recurring: recurring.map(r => ({ ...r, active: !!r.active, pending: !!r.pending })) });
}));

/* ---------- Pagos recurrentes: la app los propone cada mes y el usuario confirma ---------- */
const recParse = b => {
  const tipo = b.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const desc = String(b.desc || '').trim(), amt = +b.amt, dia = +b.dia;
  if (!desc || desc.length > 50) return { err: 'Descripción inválida' };
  if (!money(amt)) return { err: 'Monto inválido' };
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { err: 'El día del mes debe estar entre 1 y 31' };
  return { v: { tipo, cat: tipo === 'ingreso' ? 'ingreso' : String(b.cat), desc, amt, dia } };
};
const catId = async (clave, tipo) => {
  const [[c]] = await db.execute('SELECT id_categoria FROM categorias WHERE clave=? AND tipo=?', [clave, tipo]);
  return c ? c.id_categoria : null;
};

app.post('/api/recurring', auth, ah(async (req, res) => {
  const { err, v } = recParse(req.body); if (err) return bad(res, err);
  const idc = await catId(v.cat, v.tipo); if (!idc) return bad(res, 'Categoría inválida');
  const [[n]] = await db.execute('SELECT COUNT(*) n FROM recurrentes WHERE id_usuario=?', [req.uid]);
  if (n.n >= 50) return bad(res, 'Llegaste al límite de 50 pagos recurrentes');
  const ult = req.body.yaRegistrado ? "DATE_FORMAT(CURDATE(),'%Y-%m')" : 'NULL';
  await db.execute(`INSERT INTO recurrentes (id_usuario,id_categoria,tipo,descripcion,monto,dia_mes,ultimo_mes) VALUES (?,?,?,?,?,?,${ult})`,
    [req.uid, idc, v.tipo, v.desc, v.amt, v.dia]);
  res.json({ ok: true });
}));

app.put('/api/recurring/:id', auth, ah(async (req, res) => {
  const { err, v } = recParse(req.body); if (err) return bad(res, err);
  const idc = await catId(v.cat, v.tipo); if (!idc) return bad(res, 'Categoría inválida');
  await db.execute('UPDATE recurrentes SET id_categoria=?, tipo=?, descripcion=?, monto=?, dia_mes=? WHERE id_recurrente=? AND id_usuario=?',
    [idc, v.tipo, v.desc, v.amt, v.dia, +req.params.id, req.uid]);
  res.json({ ok: true });
}));

app.post('/api/recurring/:id/toggle', auth, ah(async (req, res) => {
  await db.execute('UPDATE recurrentes SET activo = 1 - activo WHERE id_recurrente=? AND id_usuario=?', [+req.params.id, req.uid]);
  res.json({ ok: true });
}));

app.delete('/api/recurring/:id', auth, ah(async (req, res) => {
  await db.execute('DELETE FROM recurrentes WHERE id_recurrente=? AND id_usuario=?', [+req.params.id, req.uid]);
  res.json({ ok: true });
}));

app.post('/api/recurring/:id/skip', auth, ah(async (req, res) => {
  await db.execute("UPDATE recurrentes SET ultimo_mes=DATE_FORMAT(CURDATE(),'%Y-%m') WHERE id_recurrente=? AND id_usuario=?", [+req.params.id, req.uid]);
  res.json({ ok: true });
}));

// Confirmar: crea el movimiento (con la fecha de vencimiento del mes) y marca el mes como atendido, todo en una transacción.
app.post('/api/recurring/:id/confirm', auth, ah(async (req, res) => {
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    const [[r]] = await cn.execute(
      `SELECT r.id_categoria, r.tipo, r.descripcion, r.monto, r.ultimo_mes, DATE_FORMAT(CURDATE(),'%Y-%m') mes,
              DATE(DATE_ADD(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL LEAST(r.dia_mes, DAY(LAST_DAY(CURDATE()))) - 1 DAY)) due
       FROM recurrentes r WHERE r.id_recurrente=? AND r.id_usuario=? FOR UPDATE`, [+req.params.id, req.uid]);
    if (!r) { await cn.rollback(); return res.status(404).json({ error: 'Pago recurrente no encontrado' }); }
    if (r.ultimo_mes === r.mes) { await cn.rollback(); return res.status(409).json({ error: 'Este pago ya fue atendido este mes' }); }
    const amt = req.body.amt === undefined || req.body.amt === '' ? +r.monto : +req.body.amt;
    if (!money(amt)) { await cn.rollback(); return bad(res, 'Monto inválido'); }
    await cn.execute('INSERT INTO movimientos (id_usuario,id_categoria,tipo,monto,fecha,descripcion) VALUES (?,?,?,?,?,?)',
      [req.uid, r.id_categoria, r.tipo, amt, r.due, r.descripcion]);
    await cn.execute('UPDATE recurrentes SET ultimo_mes=? WHERE id_recurrente=? AND id_usuario=?', [r.mes, +req.params.id, req.uid]);
    await cn.commit(); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

/* ---------- Presupuestos mensuales por categoría de gasto ---------- */
app.put('/api/budgets', auth, ah(async (req, res) => {
  const { cat, limit } = req.body;
  if (!money(+limit)) return bad(res, 'El límite debe ser un monto mayor a 0');
  const [[c]] = await db.execute("SELECT id_categoria FROM categorias WHERE clave=? AND tipo='gasto'", [String(cat)]);
  if (!c) return bad(res, 'Categoría inválida');
  await db.execute(
    'INSERT INTO presupuestos (id_usuario,id_categoria,monto_limite) VALUES (?,?,?) ON DUPLICATE KEY UPDATE monto_limite=VALUES(monto_limite)',
    [req.uid, c.id_categoria, +limit]);
  res.json({ ok: true });
}));

app.delete('/api/budgets/:cat', auth, ah(async (req, res) => {
  await db.execute(
    'DELETE p FROM presupuestos p JOIN categorias c USING (id_categoria) WHERE p.id_usuario=? AND c.clave=?', [req.uid, String(req.params.cat)]);
  res.json({ ok: true });
}));

/* ---------- Mi mes en espejo: lo que la persona se propone cada mes. La app solo observa y compara al cierre ---------- */
// Una intención es un monto por categoría: en 'ahorro' es el mínimo que quiere ahorrar; en una categoría de gasto es el máximo (0 = "nada").
app.put('/api/intentions', auth, ah(async (req, res) => {
  const { mes, items } = req.body;
  const [[m]] = await db.execute("SELECT DATE_FORMAT(CURDATE(),'%Y-%m') cur");
  if (mes !== m.cur) return bad(res, 'Solo puedes declarar intenciones para el mes en curso');
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) return bad(res, 'Escribe al menos una intención');
  const seen = new Set(), rows = [];
  for (const it of items) {
    const cat = String(it?.cat), amt = +it?.amt;
    if (seen.has(cat)) return bad(res, 'Categoría repetida');
    if (!Number.isFinite(amt) || amt < 0 || amt > 99999999.99) return bad(res, 'Monto inválido');
    if (cat === 'ahorro' && amt <= 0) return bad(res, 'Lo que quieres ahorrar debe ser mayor a 0');
    const [[c]] = await db.execute("SELECT id_categoria FROM categorias WHERE clave=? AND tipo IN ('gasto','ahorro')", [cat]);
    if (!c) return bad(res, 'Categoría inválida');
    seen.add(cat); rows.push([req.uid, c.id_categoria, mes, Math.round(amt * 100) / 100]);
  }
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    await cn.execute('DELETE FROM intenciones WHERE id_usuario=? AND mes=?', [req.uid, mes]);
    await cn.query('INSERT INTO intenciones (id_usuario,id_categoria,mes,monto) VALUES ?', [rows]);
    await cn.commit(); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

app.post('/api/tx', auth, ah(async (req, res) => {
  const { type, cat, desc, amt, date } = req.body;
  if (!T[type] || type === 'save') return bad(res, 'Tipo inválido');
  if (!money(+amt)) return bad(res, 'Monto inválido');
  if (!desc?.trim() || desc.length > 50) return bad(res, 'Descripción inválida');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return bad(res, 'Fecha inválida');
  const [r] = await db.execute(
    'INSERT INTO movimientos (id_usuario,id_categoria,tipo,monto,fecha,descripcion) SELECT ?,id_categoria,?,?,?,? FROM categorias WHERE clave=?',
    [req.uid, T[type], +amt, date, desc.trim(), String(cat)]);
  if (!r.affectedRows) return bad(res, 'Categoría inválida');
  res.json({ ok: true });
}));

/* ---------- Lector QR / código de barras: productos ---------- */
const CODE = /^[\w\-.:\/ ]{1,64}$/;
app.get('/api/products/:codigo', auth, ah(async (req, res) => {
  if (!CODE.test(req.params.codigo)) return bad(res, 'Código no válido');
  const [[p]] = await db.execute(
    `SELECT p.codigo, p.nombre name, p.precio price, c.clave cat FROM productos p JOIN categorias c USING (id_categoria) WHERE p.codigo=?`, [req.params.codigo]);
  res.json({ product: p || null });
}));
app.post('/api/products', auth, ah(async (req, res) => {
  const { codigo, name, price, cat } = req.body;
  if (!CODE.test(codigo || '')) return bad(res, 'Código no válido');
  if (!name?.trim() || name.length > 50) return bad(res, 'Nombre inválido');
  if (!money(+price)) return bad(res, 'Precio inválido');
  try {
    const [r] = await db.execute(
      "INSERT INTO productos (codigo,nombre,precio,id_categoria,creado_por) SELECT ?,?,?,id_categoria,? FROM categorias WHERE clave=? AND tipo='gasto'",
      [codigo, name.trim(), +price, req.uid, String(cat)]);
    if (!r.affectedRows) return bad(res, 'Categoría inválida');
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') return bad(res, 'Ese código ya está registrado'); throw e; }
  res.json({ ok: true });
}));

app.delete('/api/tx/:id', auth, ah(async (req, res) => {
  const [[m]] = await db.execute('SELECT tipo FROM movimientos WHERE id_movimiento=? AND id_usuario=?', [+req.params.id, req.uid]);
  if (m && m.tipo === 'ahorro') return bad(res, 'Los abonos se administran desde la meta de ahorro: al eliminar la meta, ese dinero vuelve a tu saldo.');
  await db.execute('DELETE FROM movimientos WHERE id_movimiento=? AND id_usuario=?', [+req.params.id, req.uid]);
  res.json({ ok: true });
}));

app.post('/api/goals', auth, ah(async (req, res) => {
  const { name, target, emoji } = req.body;
  if (!name?.trim() || name.length > 40 || !money(+target)) return bad(res, 'Datos de meta inválidos');
  await db.execute('INSERT INTO metas_ahorro (id_usuario,nombre,emoji,monto_objetivo) VALUES (?,?,?,?)',
    [req.uid, name.trim(), String(emoji || '🎯').slice(0, 8), +target]);
  res.json({ ok: true });
}));

app.delete('/api/goals/:id', auth, ah(async (req, res) => {
  await db.execute('DELETE FROM metas_ahorro WHERE id_meta=? AND id_usuario=?', [+req.params.id, req.uid]);
  res.json({ ok: true });
}));

app.post('/api/goals/:id/contrib', auth, ah(async (req, res) => {
  const amt = +req.body.amt; if (!money(amt)) return bad(res, 'Monto inválido');
  const cn = await db.getConnection();
  try {
    await cn.beginTransaction();
    const [[g]] = await cn.execute('SELECT nombre FROM metas_ahorro WHERE id_meta=? AND id_usuario=? FOR UPDATE', [+req.params.id, req.uid]);
    if (!g) { await cn.rollback(); return res.status(404).json({ error: 'Meta no encontrada' }); }
    await cn.execute('UPDATE metas_ahorro SET monto_ahorrado=monto_ahorrado+? WHERE id_meta=?', [amt, +req.params.id]);
    await cn.execute(`INSERT INTO movimientos (id_usuario,id_categoria,id_meta,tipo,monto,fecha,descripcion)
      SELECT ?,id_categoria,?,'ahorro',?,CURDATE(),? FROM categorias WHERE clave='ahorro'`, [req.uid, +req.params.id, amt, ('Ahorro: ' + g.nombre).slice(0, 50)]);
    await cn.commit(); res.json({ ok: true });
  } catch (e) { await cn.rollback(); throw e; } finally { cn.release(); }
}));

app.listen(process.env.PORT || 3000, () => console.log('Finax en http://localhost:' + (process.env.PORT || 3000)));
