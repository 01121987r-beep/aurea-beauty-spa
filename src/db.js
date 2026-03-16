import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateToken, hashPassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.join(__dirname, '..', 'beauty-spa.sqlite');
const dbPath = process.env.DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      website_url TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      opening_note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      benefits TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL,
      price REAL NOT NULL,
      image_url TEXT NOT NULL,
      icon TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      featured_home INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS specialists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      bio TEXT NOT NULL,
      photo_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS specialist_services (
      specialist_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      PRIMARY KEY (specialist_id, service_id),
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      scope TEXT NOT NULL DEFAULT 'closed_day',
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS manual_slot_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specialist_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'blocked_by_admin',
      FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_token TEXT UNIQUE NOT NULL,
      service_id INTEGER NOT NULL,
      specialist_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_note TEXT NOT NULL DEFAULT '',
      privacy_consent INTEGER NOT NULL DEFAULT 0,
      customer_device_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'app',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (specialist_id) REFERENCES specialists(id)
    );
  `);

  migrateSchema();
  seedAdmin();
  seedSettings();
  seedServices();
  seedSpecialists();
  seedRelations();
  seedAvailability();
  seedBookings();
}

function migrateSchema() {
  const settingsColumns = db.prepare(`PRAGMA table_info(shop_settings)`).all().map((column) => column.name);
  if (!settingsColumns.includes('website_url')) db.exec(`ALTER TABLE shop_settings ADD COLUMN website_url TEXT NOT NULL DEFAULT ''`);

  const serviceColumns = db.prepare(`PRAGMA table_info(services)`).all().map((column) => column.name);
  if (!serviceColumns.includes('category')) db.exec(`ALTER TABLE services ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
  if (!serviceColumns.includes('benefits')) db.exec(`ALTER TABLE services ADD COLUMN benefits TEXT NOT NULL DEFAULT ''`);

  const bookingColumns = db.prepare(`PRAGMA table_info(bookings)`).all().map((column) => column.name);
  if (!bookingColumns.includes('customer_email')) db.exec(`ALTER TABLE bookings ADD COLUMN customer_email TEXT NOT NULL DEFAULT ''`);
  if (!bookingColumns.includes('customer_note')) db.exec(`ALTER TABLE bookings ADD COLUMN customer_note TEXT NOT NULL DEFAULT ''`);
  if (!bookingColumns.includes('privacy_consent')) db.exec(`ALTER TABLE bookings ADD COLUMN privacy_consent INTEGER NOT NULL DEFAULT 0`);
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count;
  if (count > 0) return;
  db.prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run('admin', hashPassword('beauty123'), 'Owner Beauty Spa');
}

function seedSettings() {
  const row = db.prepare('SELECT id FROM shop_settings WHERE id = 1').get();
  if (row) return;
  db.prepare(`
    INSERT INTO shop_settings (id, shop_name, tagline, logo_url, website_url, phone, email, address, city, opening_note)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Aurea Beauty Spa',
    'Rituali di bellezza, relax e cura su misura',
    '/client/assets/logo-spa.svg',
    'https://01121987r-beep.github.io/centro-spa-premium/',
    '+39 045 4402211',
    'ciao@aureabeauty.it',
    'Via delle Camelie 18',
    'Verona',
    'Lun-Sab 09:30 - 19:30'
  );

  db.prepare(`
    UPDATE shop_settings
    SET website_url = COALESCE(NULLIF(website_url, ''), ?),
        address = CASE WHEN address = 'Via San Tomaso 14' OR address = '' THEN ? ELSE address END,
        city = CASE WHEN city = '' THEN ? ELSE city END
    WHERE id = 1
  `).run(
    'https://01121987r-beep.github.io/centro-spa-premium/',
    'Via delle Camelie 18',
    'Verona'
  );
}

function seedServices() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM services').get().count;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO services (name, category, description, benefits, duration_minutes, price, image_url, icon, active, featured_home, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const items = [
    ['Trattamenti viso', 'Viso', 'Rituale viso illuminante con detersione profonda, massaggio e maschera finale.', 'Pelle più luminosa\nTexture uniforme\nSensazione di relax immediato', 60, 78, 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=80', 'spark', 1, 1, 1],
    ['Trattamenti corpo', 'Corpo', 'Trattamento drenante e levigante per ridare comfort, leggerezza e morbidezza.', 'Pelle setosa\nSensazione di leggerezza\nRituale rimodellante', 75, 92, 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80', 'lotus', 1, 1, 2],
    ['Nails Atelier', 'Nails', 'Manicure premium con dry care, rinforzo e finish brillante o lattiginoso.', 'Unghie curate\nLook elegante\nRisultato long lasting', 50, 42, 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80', 'nail', 1, 1, 3],
    ['Massaggi relax', 'Massaggi', 'Massaggio aromatico rilassante con manualità distensive e oli caldi.', 'Riduce tensioni\nMigliora il benessere\nPausa rigenerante', 60, 85, 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80', 'hands', 1, 1, 4],
    ['Epilazione silk', 'Epilazione', 'Servizio delicato e preciso per una pelle liscia e confortevole.', 'Pelle morbida\nComfort elevato\nFinitura precisa', 35, 30, 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80', 'silk', 1, 1, 5],
    ['Percorsi benessere', 'Benessere', 'Esperienza multisensoriale con rituale combinato viso-corpo e pausa tisana.', 'Relax profondo\nPercorso completo\nBenessere olistico', 90, 120, 'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=1200&q=80', 'zen', 1, 1, 6]
  ];
  db.transaction(() => items.forEach((item) => stmt.run(...item)))();
}

function seedSpecialists() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM specialists').get().count;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO specialists (name, role, bio, photo_url, active)
    VALUES (?, ?, ?, ?, ?)
  `);
  const items = [
    ['Giulia Rinaldi', 'Beauty Therapist', 'Specialista in rituali viso e percorsi relax personalizzati.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80', 1],
    ['Marta Leone', 'Nail & Body Expert', 'Cura nails, body treatment e rituali leviganti premium.', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=900&q=80', 1],
    ['Sofia Conti', 'Spa Specialist', 'Massaggi, benessere olistico e trattamenti distensivi.', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80', 1]
  ];
  db.transaction(() => items.forEach((item) => stmt.run(...item)))();
}

function seedRelations() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM specialist_services').get().count;
  if (count > 0) return;
  const services = db.prepare('SELECT id, category FROM services').all();
  const specialists = db.prepare('SELECT id, name FROM specialists').all();
  const stmt = db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?, ?)');

  db.transaction(() => {
    for (const specialist of specialists) {
      for (const service of services) {
        if (specialist.name === 'Giulia Rinaldi' && ['Viso', 'Benessere'].includes(service.category)) stmt.run(specialist.id, service.id);
        if (specialist.name === 'Marta Leone' && ['Nails', 'Corpo', 'Epilazione'].includes(service.category)) stmt.run(specialist.id, service.id);
        if (specialist.name === 'Sofia Conti' && ['Massaggi', 'Benessere', 'Corpo'].includes(service.category)) stmt.run(specialist.id, service.id);
      }
    }
  })();
}

function seedAvailability() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM availability_rules').get().count;
  if (count > 0) return;
  const specialists = db.prepare('SELECT id FROM specialists').all();
  const stmt = db.prepare(`
    INSERT INTO availability_rules (specialist_id, weekday, label, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  db.transaction(() => {
    for (const specialist of specialists) {
      for (const weekday of [1, 2, 3, 4, 5, 6]) {
        stmt.run(specialist.id, weekday, 'Fascia mattina', '09:30', '13:00');
        stmt.run(specialist.id, weekday, 'Fascia pomeriggio', '14:00', '19:30');
      }
    }
  })();
}

function seedBookings() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count;
  if (count > 0) return;
  const service = db.prepare('SELECT * FROM services ORDER BY sort_order LIMIT 1').get();
  const specialist = db.prepare('SELECT * FROM specialists ORDER BY id LIMIT 1').get();
  if (!service || !specialist) return;
  const date = nextWeekday(new Date(), 2).toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO bookings (
      booking_token, service_id, specialist_id, booking_date, booking_time, end_time,
      customer_name, customer_phone, customer_email, customer_note, privacy_consent, customer_device_id, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'seed')
  `).run(
    createBookingToken(),
    service.id,
    specialist.id,
    date,
    '10:00',
    '11:00',
    'Chiara Demo',
    '+39 333 1112233',
    'chiara@example.com',
    'Vorrei un ambiente molto rilassante.',
    1,
    'seed-device'
  );
}

function nextWeekday(date, targetWeekday) {
  const copy = new Date(date);
  const diff = (targetWeekday + 7 - copy.getDay()) % 7 || 7;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function createBookingToken() {
  let token = generateToken(16);
  while (db.prepare('SELECT 1 FROM bookings WHERE booking_token = ?').get(token)) {
    token = generateToken(16);
  }
  return token;
}

export function toMinutes(timeString) {
  const [hours, minutes] = `${timeString}`.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function buildSlotsForRange(startTime, endTime, interval = 30) {
  const slots = [];
  for (let minute = toMinutes(startTime); minute + interval <= toMinutes(endTime); minute += interval) {
    slots.push(toTime(minute));
  }
  return slots;
}

export function getServiceById(serviceId) {
  return db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
}

export function getSpecialistById(specialistId) {
  return db.prepare('SELECT * FROM specialists WHERE id = ?').get(specialistId);
}

export function getWeekdayIndex(dateString) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

export function getAvailabilityWindowsForDate(specialistId, dateString) {
  const weekday = getWeekdayIndex(dateString);
  const rules = db.prepare(`
    SELECT start_time, end_time, label
    FROM availability_rules
    WHERE specialist_id = ? AND weekday = ? AND active = 1
    ORDER BY start_time
  `).all(specialistId, weekday);

  const exceptions = db.prepare(`
    SELECT *
    FROM availability_exceptions
    WHERE specialist_id = ?
      AND date(?) BETWEEN date(date_from) AND date(date_to)
  `).all(specialistId, dateString);

  const fullClosure = exceptions.some((exception) => !exception.start_time && !exception.end_time);
  if (fullClosure) return [];

  if (exceptions.length > 0) {
    return exceptions
      .filter((exception) => exception.start_time && exception.end_time)
      .map((exception) => ({
        start_time: exception.start_time,
        end_time: exception.end_time,
        label: exception.scope
      }));
  }

  return rules;
}

export function getBusyRangesForDate(specialistId, dateString, ignoreBookingId = null) {
  const bookings = db.prepare(`
    SELECT id, booking_time, end_time
    FROM bookings
    WHERE specialist_id = ? AND booking_date = ? AND status = 'confirmed'
  `).all(specialistId, dateString).filter((row) => row.id !== ignoreBookingId);

  const blocks = db.prepare(`
    SELECT slot_time
    FROM manual_slot_blocks
    WHERE specialist_id = ? AND booking_date = ?
  `).all(specialistId, dateString);

  return {
    bookings,
    blocks: new Set(blocks.map((row) => row.slot_time))
  };
}

export function getAvailableStartSlots(specialistId, dateString, durationMinutes, ignoreBookingId = null) {
  const windows = getAvailabilityWindowsForDate(specialistId, dateString);
  const { bookings, blocks } = getBusyRangesForDate(specialistId, dateString, ignoreBookingId);
  const interval = 30;

  return windows
    .flatMap((window) => buildSlotsForRange(window.start_time, window.end_time, interval))
    .filter((slot) => {
      if (blocks.has(slot)) return false;
      const start = toMinutes(slot);
      const end = start + durationMinutes;
      const fitsWindow = windows.some((window) => start >= toMinutes(window.start_time) && end <= toMinutes(window.end_time));
      if (!fitsWindow) return false;
      return !bookings.some((booking) => {
        const bookingStart = toMinutes(booking.booking_time);
        const bookingEnd = toMinutes(booking.end_time);
        return start < bookingEnd && end > bookingStart;
      });
    });
}

export function getVisibleWeekDates(referenceDateString = null, totalDays = 14) {
  const today = referenceDateString ? new Date(`${referenceDateString}T12:00:00`) : new Date();
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function getShopSettings() {
  return db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
}
