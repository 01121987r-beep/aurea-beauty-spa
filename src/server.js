import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db,
  initializeDatabase,
  createBookingToken,
  getAvailableStartSlots,
  getServiceById,
  getSpecialistById,
  getShopSettings,
  toMinutes,
  toTime,
  getAvailabilityWindowsForDate
} from './db.js';
import { generateToken, hashPassword, verifyPassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const app = express();
const PORT = process.env.PORT || 3200;
const HOST = process.env.HOST || '0.0.0.0';
const SLOT_INTERVAL_MINUTES = 30;
const CLIENT_DAY_LIMIT = 12;

initializeDatabase();

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(publicDir));

function respondError(res, status, message) {
  return res.status(status).json({ error: message });
}

function authTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAdmin(req, res, next) {
  const token = authTokenFromRequest(req);
  if (!token) return respondError(res, 401, 'Unauthorized');
  const session = db.prepare(`
    SELECT admin_sessions.*, admin_users.username, admin_users.display_name
    FROM admin_sessions
    JOIN admin_users ON admin_users.id = admin_sessions.admin_id
    WHERE admin_sessions.token = ?
  `).get(token);
  if (!session) return respondError(res, 401, 'Unauthorized');
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return respondError(res, 401, 'Session expired');
  }
  req.admin = session;
  next();
}

function deleteAdminSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

function requireFields(res, fields) {
  const missing = fields.filter(([_, value]) => value === undefined || value === null || value === '' || value === false);
  if (!missing.length) return null;
  return respondError(res, 400, `Campi obbligatori mancanti: ${missing.map(([key]) => key).join(', ')}`);
}

function servicePayload(body) {
  return {
    name: `${body.name || ''}`.trim(),
    category: `${body.category || ''}`.trim(),
    description: `${body.description || ''}`.trim(),
    benefits: `${body.benefits || ''}`.trim(),
    duration_minutes: Number(body.duration_minutes || 0),
    price: Number(body.price || 0),
    image_url: `${body.image_url || ''}`.trim(),
    icon: `${body.icon || ''}`.trim() || 'spark',
    active: body.active ? 1 : 0,
    featured_home: body.featured_home ? 1 : 0,
    sort_order: Number(body.sort_order || 0)
  };
}

function specialistPayload(body) {
  return {
    name: `${body.name || ''}`.trim(),
    role: `${body.role || ''}`.trim(),
    bio: `${body.bio || ''}`.trim(),
    photo_url: `${body.photo_url || ''}`.trim(),
    active: body.active ? 1 : 0
  };
}

function mapBookingRow(row) {
  return {
    ...row,
    status_label: row.status === 'cancelled'
      ? 'Annullata'
      : row.status === 'pending'
        ? 'In attesa'
        : row.status === 'completed'
          ? 'Completata'
          : 'Confermata'
  };
}

function getServiceCards() {
  return db.prepare(`
    SELECT * FROM services
    WHERE active = 1
    ORDER BY featured_home DESC, sort_order ASC, id ASC
  `).all();
}

function getServiceDetails(serviceId) {
  return db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
}

function getSpecialistsForService(serviceId) {
  return db.prepare(`
    SELECT specialists.*
    FROM specialists
    JOIN specialist_services ON specialist_services.specialist_id = specialists.id
    WHERE specialist_services.service_id = ?
      AND specialists.active = 1
    ORDER BY specialists.name ASC
  `).all(serviceId);
}

function getDefaultSpecialistForService(serviceId) {
  return getSpecialistsForService(serviceId)[0] || null;
}

function ensureServiceSpecialistLink(serviceId, specialistId) {
  const row = db.prepare(`
    SELECT 1
    FROM specialist_services
    WHERE service_id = ? AND specialist_id = ?
  `).get(serviceId, specialistId);
  return Boolean(row);
}

function createEndTime(startTime, durationMinutes) {
  return toTime(toMinutes(startTime) + durationMinutes);
}

function buildAvailableDays(specialistId, serviceId, referenceDate) {
  const service = getServiceById(serviceId);
  if (!service) return [];
  const startDate = referenceDate ? new Date(`${referenceDate}T12:00:00`) : new Date();
  const cursor = new Date(startDate);
  const days = [];
  let safetyCounter = 0;

  while (days.length < CLIENT_DAY_LIMIT && safetyCounter < 90) {
    const date = cursor.toISOString().slice(0, 10);
    const slots = getAvailableStartSlots(specialistId, date, service.duration_minutes);
    if (slots.length) {
      days.push({
        date,
        slots,
        windows: getAvailabilityWindowsForDate(specialistId, date)
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    safetyCounter += 1;
  }

  return days;
}

function getBookingByToken(token) {
  return db.prepare(`
    SELECT bookings.*, services.name AS service_name, services.category AS service_category,
           services.price, services.duration_minutes, services.image_url,
           specialists.name AS specialist_name, specialists.role AS specialist_role
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    WHERE bookings.booking_token = ?
  `).get(token);
}

function getBookingsForDevice(deviceId) {
  return db.prepare(`
    SELECT bookings.*, services.name AS service_name, services.category AS service_category,
           services.price, services.duration_minutes, services.image_url,
           specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    WHERE bookings.customer_device_id = ?
    ORDER BY bookings.booking_date DESC, bookings.booking_time DESC
  `).all(deviceId).map(mapBookingRow);
}

function getBookingForDevice(token, deviceId) {
  return db.prepare(`
    SELECT bookings.*, services.name AS service_name, services.category AS service_category,
           services.price, services.duration_minutes, services.image_url,
           specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
    WHERE bookings.booking_token = ? AND bookings.customer_device_id = ?
  `).get(token, deviceId);
}

function dashboardSpecialists() {
  return db.prepare(`
    SELECT specialists.*,
      COALESCE(GROUP_CONCAT(specialist_services.service_id), '') AS service_ids_csv
    FROM specialists
    LEFT JOIN specialist_services ON specialist_services.specialist_id = specialists.id
    GROUP BY specialists.id
    ORDER BY specialists.name ASC
  `).all().map((row) => ({
    ...row,
    service_ids: row.service_ids_csv ? row.service_ids_csv.split(',').map(Number) : []
  }));
}

function getClientSpecialists() {
  return db.prepare(`
    SELECT id, name, role, bio, photo_url
    FROM specialists
    WHERE active = 1
    ORDER BY name ASC
  `).all();
}

function getAdminBookings(date) {
  let query = `
    SELECT bookings.*, services.name AS service_name, specialists.name AS specialist_name
    FROM bookings
    JOIN services ON services.id = bookings.service_id
    JOIN specialists ON specialists.id = bookings.specialist_id
  `;
  const params = [];
  if (date) {
    query += ' WHERE bookings.booking_date = ?';
    params.push(date);
  }
  query += ' ORDER BY bookings.booking_date ASC, bookings.booking_time ASC';
  return db.prepare(query).all(...params).map(mapBookingRow);
}

function getAvailabilityPayload(specialistId) {
  return {
    rules: db.prepare(`
      SELECT * FROM availability_rules
      WHERE specialist_id = ?
      ORDER BY weekday ASC, start_time ASC
    `).all(specialistId),
    exceptions: db.prepare(`
      SELECT * FROM availability_exceptions
      WHERE specialist_id = ?
      ORDER BY date_from ASC, start_time ASC
    `).all(specialistId)
  };
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/client/bootstrap', (req, res) => {
  res.json({
    settings: getShopSettings(),
    services: getServiceCards(),
    specialists: getClientSpecialists()
  });
});

app.get('/api/client/services', (req, res) => {
  res.json({ services: getServiceCards() });
});

app.get('/api/client/specialists', (req, res) => {
  res.json({ specialists: getClientSpecialists() });
});

app.get('/api/client/services/:id', (req, res) => {
  const serviceId = Number(req.params.id);
  if (!serviceId) return respondError(res, 400, 'Servizio non valido');
  const service = getServiceDetails(serviceId);
  if (!service || !service.active) return respondError(res, 404, 'Servizio non trovato');
  res.json({
    service,
    specialists: getSpecialistsForService(serviceId)
  });
});

app.get('/api/client/availability', (req, res) => {
  const serviceId = Number(req.query.serviceId);
  const requestedSpecialistId = Number(req.query.specialistId || 0);
  const referenceDate = `${req.query.referenceDate || ''}`.trim() || undefined;
  if (!serviceId) return respondError(res, 400, 'serviceId richiesto');

  const specialist = requestedSpecialistId
    ? getSpecialistById(requestedSpecialistId)
    : getDefaultSpecialistForService(serviceId);

  if (!specialist) return respondError(res, 404, 'Nessuna operatrice disponibile per questo servizio');
  if (!ensureServiceSpecialistLink(serviceId, specialist.id)) {
    return respondError(res, 400, 'Combinazione servizio/operatrice non valida');
  }

  res.json({
    specialist: { id: specialist.id, name: specialist.name, role: specialist.role },
    days: buildAvailableDays(specialist.id, serviceId, referenceDate)
  });
});

app.get('/api/client/bookings', (req, res) => {
  const deviceId = `${req.query.deviceId || ''}`.trim();
  if (!deviceId) return respondError(res, 400, 'deviceId richiesto');
  res.json({ bookings: getBookingsForDevice(deviceId) });
});

app.post('/api/client/bookings', (req, res) => {
  const serviceId = Number(req.body.service_id);
  const requestedSpecialistId = Number(req.body.specialist_id || 0);
  const bookingDate = `${req.body.booking_date || ''}`.trim();
  const bookingTime = `${req.body.booking_time || ''}`.trim();
  const customerName = `${req.body.customer_name || ''}`.trim();
  const customerPhone = `${req.body.customer_phone || ''}`.trim();
  const customerEmail = `${req.body.customer_email || ''}`.trim();
  const customerNote = `${req.body.customer_note || ''}`.trim();
  const privacyConsent = Boolean(req.body.privacy_consent);
  const customerDeviceId = `${req.body.customer_device_id || ''}`.trim();

  const fieldError = requireFields(res, [
    ['service_id', serviceId],
    ['booking_date', bookingDate],
    ['booking_time', bookingTime],
    ['customer_name', customerName],
    ['customer_phone', customerPhone],
    ['privacy_consent', privacyConsent],
    ['customer_device_id', customerDeviceId]
  ]);
  if (fieldError) return fieldError;

  const service = getServiceById(serviceId);
  if (!service || !service.active) return respondError(res, 404, 'Servizio non disponibile');

  const specialist = requestedSpecialistId
    ? getSpecialistById(requestedSpecialistId)
    : getDefaultSpecialistForService(serviceId);

  if (!specialist || !specialist.active) return respondError(res, 404, 'Operatrice non disponibile');
  if (!ensureServiceSpecialistLink(serviceId, specialist.id)) {
    return respondError(res, 400, 'Combinazione servizio/operatrice non valida');
  }

  const availableSlots = getAvailableStartSlots(specialist.id, bookingDate, service.duration_minutes);
  if (!availableSlots.includes(bookingTime)) {
    return respondError(res, 409, 'Lo slot selezionato non è più disponibile');
  }

  const bookingToken = createBookingToken();
  const endTime = createEndTime(bookingTime, service.duration_minutes);
  db.prepare(`
    INSERT INTO bookings (
      booking_token, service_id, specialist_id, booking_date, booking_time, end_time,
      customer_name, customer_phone, customer_email, customer_note, privacy_consent,
      customer_device_id, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'app')
  `).run(
    bookingToken,
    serviceId,
    specialist.id,
    bookingDate,
    bookingTime,
    endTime,
    customerName,
    customerPhone,
    customerEmail,
    customerNote,
    privacyConsent ? 1 : 0,
    customerDeviceId
  );

  const booking = getBookingByToken(bookingToken);
  res.status(201).json({ booking: mapBookingRow(booking) });
});

app.patch('/api/client/bookings/:token/cancel', (req, res) => {
  const token = `${req.params.token || ''}`.trim();
  const deviceId = `${req.body.customer_device_id || ''}`.trim();
  if (!token || !deviceId) return respondError(res, 400, 'Prenotazione non valida');

  const booking = getBookingForDevice(token, deviceId);
  if (!booking) return respondError(res, 404, 'Prenotazione non trovata');
  if (booking.status === 'cancelled') return respondError(res, 400, 'Prenotazione gia annullata');

  db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE booking_token = ?`).run(token);
  res.json({ booking: mapBookingRow(getBookingByToken(token)) });
});

app.patch('/api/client/bookings/:token/reschedule', (req, res) => {
  const token = `${req.params.token || ''}`.trim();
  const deviceId = `${req.body.customer_device_id || ''}`.trim();
  const bookingDate = `${req.body.booking_date || ''}`.trim();
  const bookingTime = `${req.body.booking_time || ''}`.trim();
  if (!token || !deviceId || !bookingDate || !bookingTime) {
    return respondError(res, 400, 'Dati modifica mancanti');
  }

  const booking = getBookingForDevice(token, deviceId);
  if (!booking) return respondError(res, 404, 'Prenotazione non trovata');
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return respondError(res, 400, 'Prenotazione non modificabile');
  }

  const service = getServiceById(booking.service_id);
  const specialist = getSpecialistById(booking.specialist_id);
  if (!service || !service.active || !specialist || !specialist.active) {
    return respondError(res, 400, 'Servizio o specialista non disponibile');
  }

  const availableSlots = getAvailableStartSlots(specialist.id, bookingDate, service.duration_minutes);
  if (!availableSlots.includes(bookingTime)) {
    return respondError(res, 409, 'Lo slot selezionato non e piu disponibile');
  }

  const endTime = createEndTime(bookingTime, service.duration_minutes);
  db.prepare(`
    UPDATE bookings
    SET booking_date = ?, booking_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
    WHERE booking_token = ?
  `).run(bookingDate, bookingTime, endTime, token);

  res.json({ booking: mapBookingRow(getBookingByToken(token)) });
});

app.post('/api/admin/login', (req, res) => {
  const username = `${req.body.username || ''}`.trim();
  const password = `${req.body.password || ''}`;
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return respondError(res, 401, 'Credenziali non valide');
  }

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.prepare('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)').run(token, admin.id, expiresAt);
  res.json({ token, admin: { username: admin.username, display_name: admin.display_name } });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  deleteAdminSession(authTokenFromRequest(req));
  res.json({ ok: true });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const currentPassword = `${req.body.currentPassword || ''}`;
  const newPassword = `${req.body.newPassword || ''}`;
  if (!currentPassword || !newPassword) return respondError(res, 400, 'Compila i campi password');
  if (newPassword.length < 6) return respondError(res, 400, 'La nuova password deve avere almeno 6 caratteri');

  const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.admin_id);
  if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
    return respondError(res, 400, 'Password attuale non corretta');
  }

  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), admin.id);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND token != ?').run(admin.id, req.admin.token);
  res.json({ message: 'Password aggiornata con successo' });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const date = `${req.query.date || ''}`.trim();
  res.json({
    settings: getShopSettings(),
    services: db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all(),
    specialists: dashboardSpecialists(),
    bookings: getAdminBookings(date || null)
  });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const date = `${req.query.date || ''}`.trim();
  res.json({ bookings: getAdminBookings(date || null) });
});

app.patch('/api/admin/bookings/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = `${req.body.status || ''}`.trim();
  if (!id || !['confirmed', 'pending', 'cancelled', 'completed'].includes(status)) {
    return respondError(res, 400, 'Dati non validi');
  }
  db.prepare('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  res.json({ ok: true });
});

app.get('/api/admin/availability', requireAdmin, (req, res) => {
  const specialistId = Number(req.query.specialistId);
  if (!specialistId) return respondError(res, 400, 'specialistId richiesto');
  res.json(getAvailabilityPayload(specialistId));
});

app.put('/api/admin/availability/:specialistId', requireAdmin, (req, res) => {
  const specialistId = Number(req.params.specialistId);
  if (!specialistId) return respondError(res, 400, 'specialistId richiesto');

  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
  const exceptions = Array.isArray(req.body.exceptions) ? req.body.exceptions : [];

  db.transaction(() => {
    db.prepare('DELETE FROM availability_rules WHERE specialist_id = ?').run(specialistId);
    db.prepare('DELETE FROM availability_exceptions WHERE specialist_id = ?').run(specialistId);

    const insertRule = db.prepare(`
      INSERT INTO availability_rules (specialist_id, weekday, label, start_time, end_time, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    rules.forEach((rule) => {
      if (!rule.weekday || !rule.start_time || !rule.end_time) return;
      insertRule.run(specialistId, Number(rule.weekday), `${rule.label || 'Fascia oraria'}`.trim(), rule.start_time, rule.end_time, rule.active ? 1 : 1);
    });

    const insertException = db.prepare(`
      INSERT INTO availability_exceptions (specialist_id, date_from, date_to, start_time, end_time, scope, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    exceptions.forEach((exception) => {
      if (!exception.date_from) return;
      insertException.run(
        specialistId,
        exception.date_from,
        exception.date_to || exception.date_from,
        exception.start_time || null,
        exception.end_time || null,
        `${exception.scope || 'closed_day'}`,
        `${exception.note || ''}`
      );
    });
  })();

  res.json({ ok: true });
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  const payload = servicePayload(req.body);
  const fieldError = requireFields(res, [
    ['name', payload.name],
    ['category', payload.category],
    ['description', payload.description],
    ['duration_minutes', payload.duration_minutes],
    ['price', payload.price],
    ['image_url', payload.image_url]
  ]);
  if (fieldError) return fieldError;

  const result = db.prepare(`
    INSERT INTO services (name, category, description, benefits, duration_minutes, price, image_url, icon, active, featured_home, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.category,
    payload.description,
    payload.benefits,
    payload.duration_minutes,
    payload.price,
    payload.image_url,
    payload.icon,
    payload.active,
    payload.featured_home,
    payload.sort_order
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return respondError(res, 400, 'Servizio non valido');
  const payload = servicePayload(req.body);
  db.prepare(`
    UPDATE services
    SET name = ?, category = ?, description = ?, benefits = ?, duration_minutes = ?, price = ?,
        image_url = ?, icon = ?, active = ?, featured_home = ?, sort_order = ?
    WHERE id = ?
  `).run(
    payload.name,
    payload.category,
    payload.description,
    payload.benefits,
    payload.duration_minutes,
    payload.price,
    payload.image_url,
    payload.icon,
    payload.active,
    payload.featured_home,
    payload.sort_order,
    id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return respondError(res, 400, 'Servizio non valido');
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/admin/specialists', requireAdmin, (req, res) => {
  const payload = specialistPayload(req.body);
  const serviceIds = Array.isArray(req.body.service_ids) ? req.body.service_ids.map(Number).filter(Boolean) : [];
  const fieldError = requireFields(res, [
    ['name', payload.name],
    ['role', payload.role],
    ['bio', payload.bio],
    ['photo_url', payload.photo_url]
  ]);
  if (fieldError) return fieldError;

  const result = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO specialists (name, role, bio, photo_url, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(payload.name, payload.role, payload.bio, payload.photo_url, payload.active);
    const specialistId = Number(insert.lastInsertRowid);
    const link = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');
    serviceIds.forEach((serviceId) => link.run(specialistId, serviceId));
    return specialistId;
  })();

  res.status(201).json({ id: result });
});

app.put('/api/admin/specialists/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return respondError(res, 400, 'Specialista non valido');
  const payload = specialistPayload(req.body);
  const serviceIds = Array.isArray(req.body.service_ids) ? req.body.service_ids.map(Number).filter(Boolean) : [];

  db.transaction(() => {
    db.prepare(`
      UPDATE specialists SET name = ?, role = ?, bio = ?, photo_url = ?, active = ?
      WHERE id = ?
    `).run(payload.name, payload.role, payload.bio, payload.photo_url, payload.active, id);
    db.prepare('DELETE FROM specialist_services WHERE specialist_id = ?').run(id);
    const link = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');
    serviceIds.forEach((serviceId) => link.run(id, serviceId));
  })();

  res.json({ ok: true });
});

app.delete('/api/admin/specialists/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return respondError(res, 400, 'Specialista non valido');
  db.prepare('DELETE FROM specialists WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

app.get('/admin/services', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'services.html'));
});

app.get('/admin/specialists', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'specialists.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Aurea Beauty Spa server in ascolto su http://${HOST}:${PORT}`);
});
