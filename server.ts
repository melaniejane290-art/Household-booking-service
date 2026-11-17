import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { db, initDatabase } from './server/db.ts';
import type { BookingStatus, PaymentMethod, UserRole } from './src/types/movecam.ts';

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'movecam-cameroon-secret-2026-prod-key';
const ASSISTANT_FEE_PER_PERSON = 12000;

initDatabase();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `mc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are allowed.'));
    }
  },
});

interface AuthPayload {
  userId: number;
  role: UserRole;
  email: string;
}

interface AuthedRequest extends Request {
  auth?: AuthPayload;
}

function getSafeUserById(id: number) {
  return db
    .prepare(
      `SELECT id, name, email, phone, role, city, approval_status, bio, license_number, avatar_url, created_at
       FROM users WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const user = db.prepare('SELECT id, role, approval_status FROM users WHERE id = ?').get(decoded.userId) as
      | { id: number; role: UserRole; approval_status: string }
      | undefined;
    if (!user) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    if (user.approval_status === 'suspended') {
      res.status(403).json({ error: 'Account is suspended. Contact MoveCam support.' });
      return;
    }
    req.auth = { userId: user.id, role: user.role, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

// WebSocket Connection Registry by userId
const wsClients = new Map<number, Set<WebSocket>>();

function pushToUser(userId: number, event: string, data: unknown) {
  const sockets = wsClients.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify({ event, data });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function pushToRole(role: UserRole, event: string, data: unknown) {
  const rows = db.prepare('SELECT id FROM users WHERE role = ?').all(role) as { id: number }[];
  for (const row of rows) {
    pushToUser(row.id, event, data);
  }
}

function createNotification(
  userId: number,
  title: string,
  body: string,
  type: 'booking' | 'assignment' | 'payment' | 'system',
  bookingId: number | null = null
) {
  const result = db
    .prepare(
      `INSERT INTO notifications (user_id, title, body, type, booking_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, title, body, type, bookingId);
  const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  pushToUser(userId, 'notification:new', notif);
  return notif;
}

function hydrateBooking(row: Record<string, unknown>) {
  const bookingId = Number(row.id);
  const payment = db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(bookingId) || null;
  const assistants = db
    .prepare(
      `SELECT ba.*, u.name as assistant_name, u.phone as assistant_phone
       FROM booking_assistants ba
       JOIN users u ON ba.assistant_id = u.id
       WHERE ba.booking_id = ?`
    )
    .all(bookingId);
  const rating = db.prepare('SELECT * FROM ratings WHERE booking_id = ?').get(bookingId) || null;
  let photos: string[] = [];
  try {
    photos = JSON.parse(String(row.belongings_photos || '[]'));
  } catch {
    photos = [];
  }
  return {
    ...row,
    belongings_photos: photos,
    payment,
    assistants,
    rating,
  };
}

function getBookingRow(bookingId: number) {
  return db
    .prepare(
      `SELECT b.*,
        c.name as customer_name, c.phone as customer_phone,
        d.name as driver_name, d.phone as driver_phone,
        v.title as vehicle_title, v.vehicle_type as vehicle_type, v.plate_number as vehicle_plate, v.photo_url as vehicle_photo
       FROM bookings b
       JOIN users c ON b.customer_id = c.id
       LEFT JOIN users d ON b.driver_id = d.id
       LEFT JOIN vehicles v ON b.vehicle_id = v.id
       WHERE b.id = ?`
    )
    .get(bookingId) as Record<string, unknown> | undefined;
}

function broadcastBookingUpdate(bookingId: number) {
  const row = getBookingRow(bookingId);
  if (!row) return;
  const hydrated = hydrateBooking(row);
  pushToUser(Number(row.customer_id), 'booking:updated', hydrated);
  if (row.driver_id) {
    pushToUser(Number(row.driver_id), 'booking:updated', hydrated);
  }
  const assistants = db
    .prepare('SELECT assistant_id FROM booking_assistants WHERE booking_id = ?')
    .all(bookingId) as { assistant_id: number }[];
  for (const a of assistants) {
    pushToUser(a.assistant_id, 'booking:updated', hydrated);
  }
  pushToRole('admin', 'booking:updated', hydrated);
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Health check & Maps config
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'MoveCam API',
    envKeys: Object.keys(process.env).filter((k) => /MAP|GOOGLE/i.test(k)),
  });
});

app.get('/api/config/maps', (_req, res) => {
  const apiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GMP_API_KEY ||
    process.env.MAPS_API_KEY ||
    '';
  res.json({ apiKey });
});

// File upload
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided.' });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, role, city, bio, license_number } = req.body ?? {};
  if (!name || !email || !phone || !password) {
    res.status(400).json({ error: 'Name, email, phone, and password are required.' });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const allowedRoles: UserRole[] = ['customer', 'driver', 'assistant'];
  const assignedRole: UserRole = allowedRoles.includes(role) ? role : 'customer';
  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const approvalStatus = assignedRole === 'customer' ? 'approved' : 'pending';
  const hash = bcrypt.hashSync(String(password), 10);
  const result = db
    .prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, city, approval_status, bio, license_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(name).trim(),
      normalizedEmail,
      String(phone).trim(),
      hash,
      assignedRole,
      String(city || 'Douala').trim(),
      approvalStatus,
      String(bio || '').trim(),
      String(license_number || '').trim()
    );

  const userId = Number(result.lastInsertRowid);

  if (assignedRole === 'assistant') {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const insertSched = db.prepare(
      `INSERT INTO assistant_schedules (assistant_id, day_of_week, start_time, end_time, is_available, city, hourly_rate_xaf)
       VALUES (?, ?, '08:00', '18:00', ?, ?, 3500)`
    );
    for (const day of days) {
      insertSched.run(userId, day, day === 'Sunday' ? 0 : 1, String(city || 'Douala').trim());
    }
  }

  if (assignedRole !== 'customer') {
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as { id: number }[];
    for (const adm of admins) {
      createNotification(
        adm.id,
        `New ${assignedRole} awaiting approval`,
        `${String(name).trim()} (${String(city || 'Douala')}) registered and requires account verification.`,
        'system',
        null
      );
    }
  }

  const user = getSafeUserById(userId);
  const token = jwt.sign({ userId, role: assignedRole, email: normalizedEmail }, JWT_SECRET, {
    expiresIn: '7d',
  });
  res.status(201).json({ token, user });
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as
    | (Record<string, unknown> & { id: number; role: UserRole; password_hash: string; approval_status: string })
    | undefined;

  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (row.approval_status === 'suspended') {
    res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    return;
  }

  const token = jwt.sign({ userId: row.id, role: row.role, email: normalizedEmail }, JWT_SECRET, {
    expiresIn: '7d',
  });
  const user = getSafeUserById(row.id);
  res.json({ token, user });
});

// Auth: Me & Profile update
app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const user = getSafeUserById(req.auth!.userId);
  res.json({ user });
});

app.patch('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
  const { name, phone, city, bio, license_number, avatar_url } = req.body ?? {};
  const existing = getSafeUserById(req.auth!.userId);
  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  db.prepare(
    `UPDATE users SET name = ?, phone = ?, city = ?, bio = ?, license_number = ?, avatar_url = ?
     WHERE id = ?`
  ).run(
    String(name ?? existing.name).trim(),
    String(phone ?? existing.phone).trim(),
    String(city ?? existing.city).trim(),
    String(bio ?? existing.bio).trim(),
    String(license_number ?? existing.license_number).trim(),
    String(avatar_url ?? existing.avatar_url).trim(),
    req.auth!.userId
  );
  res.json({ user: getSafeUserById(req.auth!.userId) });
});

// Public / Fleet Vehicles
app.get('/api/vehicles', (req, res) => {
  const scope = String(req.query.scope || 'public');
  const authHeader = req.headers.authorization;
  let auth: AuthPayload | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      auth = jwt.verify(authHeader.slice(7), JWT_SECRET) as AuthPayload;
    } catch {
      auth = null;
    }
  }

  if (scope === 'mine' && auth) {
    const rows = db
      .prepare(
        `SELECT v.*, u.name as owner_name, u.phone as owner_phone
         FROM vehicles v JOIN users u ON v.owner_id = u.id
         WHERE v.owner_id = ? ORDER BY v.created_at DESC`
      )
      .all(auth.userId);
    res.json({ vehicles: rows });
    return;
  }

  if (scope === 'all' && auth?.role === 'admin') {
    const rows = db
      .prepare(
        `SELECT v.*, u.name as owner_name, u.phone as owner_phone
         FROM vehicles v JOIN users u ON v.owner_id = u.id
         ORDER BY v.created_at DESC`
      )
      .all();
    res.json({ vehicles: rows });
    return;
  }

  const rows = db
    .prepare(
      `SELECT v.*, u.name as owner_name, u.phone as owner_phone
       FROM vehicles v JOIN users u ON v.owner_id = u.id
       WHERE v.is_approved = 1 AND u.approval_status = 'approved'
       ORDER BY v.is_available DESC, v.base_fare_xaf ASC`
    )
    .all();
  res.json({ vehicles: rows });
});

app.post('/api/vehicles', requireAuth, requireRole('driver', 'admin'), (req: AuthedRequest, res) => {
  const { title, vehicle_type, plate_number, capacity_label, max_weight_kg, base_fare_xaf, per_km_xaf, city, photo_url } =
    req.body ?? {};
  if (!title || !vehicle_type || !plate_number || !base_fare_xaf || !per_km_xaf) {
    res.status(400).json({ error: 'Vehicle title, type, plate number, and rates are required.' });
    return;
  }
  const owner = db.prepare('SELECT approval_status FROM users WHERE id = ?').get(req.auth!.userId) as {
    approval_status: string;
  };
  const isApproved = req.auth!.role === 'admin' || owner.approval_status === 'approved' ? 1 : 0;

  const defaultPhoto =
    vehicle_type === 'Heavy Lorry'
      ? '/src/assets/images/vehicle_heavy_mover_1794844161059.jpg'
      : vehicle_type === 'Box Truck'
        ? '/src/assets/images/vehicle_box_truck_1794844159667.jpg'
        : '/src/assets/images/vehicle_pickup_van_1794844161070.jpg';

  const result = db
    .prepare(
      `INSERT INTO vehicles (owner_id, title, vehicle_type, plate_number, capacity_label, max_weight_kg, base_fare_xaf, per_km_xaf, city, photo_url, is_available, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      req.auth!.userId,
      String(title).trim(),
      String(vehicle_type),
      String(plate_number).trim().toUpperCase(),
      String(capacity_label || 'Household Move').trim(),
      Number(max_weight_kg) || 1500,
      Number(base_fare_xaf),
      Number(per_km_xaf),
      String(city || 'Douala').trim(),
      String(photo_url || defaultPhoto),
      isApproved
    );

  const vehicle = db
    .prepare(
      `SELECT v.*, u.name as owner_name, u.phone as owner_phone
       FROM vehicles v JOIN users u ON v.owner_id = u.id WHERE v.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json({ vehicle });
});

app.patch('/api/vehicles/:id', requireAuth, requireRole('driver', 'admin'), (req: AuthedRequest, res) => {
  const vehicleId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Vehicle not found.' });
    return;
  }
  if (req.auth!.role !== 'admin' && Number(existing.owner_id) !== req.auth!.userId) {
    res.status(403).json({ error: 'You can only update your own vehicles.' });
    return;
  }
  const { title, vehicle_type, plate_number, capacity_label, max_weight_kg, base_fare_xaf, per_km_xaf, city, photo_url, is_available, is_approved } =
    req.body ?? {};

  const nextApproved = req.auth!.role === 'admin' && is_approved !== undefined ? (is_approved ? 1 : 0) : Number(existing.is_approved);
  db.prepare(
    `UPDATE vehicles SET
       title = ?, vehicle_type = ?, plate_number = ?, capacity_label = ?, max_weight_kg = ?,
       base_fare_xaf = ?, per_km_xaf = ?, city = ?, photo_url = ?, is_available = ?, is_approved = ?
     WHERE id = ?`
  ).run(
    String(title ?? existing.title),
    String(vehicle_type ?? existing.vehicle_type),
    String(plate_number ?? existing.plate_number),
    String(capacity_label ?? existing.capacity_label),
    Number(max_weight_kg ?? existing.max_weight_kg),
    Number(base_fare_xaf ?? existing.base_fare_xaf),
    Number(per_km_xaf ?? existing.per_km_xaf),
    String(city ?? existing.city),
    String(photo_url ?? existing.photo_url),
    is_available !== undefined ? (is_available ? 1 : 0) : Number(existing.is_available),
    nextApproved,
    vehicleId
  );

  const updated = db
    .prepare(
      `SELECT v.*, u.name as owner_name, u.phone as owner_phone
       FROM vehicles v JOIN users u ON v.owner_id = u.id WHERE v.id = ?`
    )
    .get(vehicleId);
  res.json({ vehicle: updated });
});

app.delete('/api/vehicles/:id', requireAuth, requireRole('driver', 'admin'), (req: AuthedRequest, res) => {
  const vehicleId = Number(req.params.id);
  const existing = db.prepare('SELECT owner_id FROM vehicles WHERE id = ?').get(vehicleId) as { owner_id: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Vehicle not found.' });
    return;
  }
  if (req.auth!.role !== 'admin' && existing.owner_id !== req.auth!.userId) {
    res.status(403).json({ error: 'Not authorized.' });
    return;
  }
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicleId);
  res.json({ ok: true });
});

// Bookings: List (role-scoped)
app.get('/api/bookings', requireAuth, (req: AuthedRequest, res) => {
  const { userId, role } = req.auth!;
  let rows: Record<string, unknown>[] = [];

  const baseSelect = `
    SELECT b.*,
      c.name as customer_name, c.phone as customer_phone,
      d.name as driver_name, d.phone as driver_phone,
      v.title as vehicle_title, v.vehicle_type as vehicle_type, v.plate_number as vehicle_plate, v.photo_url as vehicle_photo
    FROM bookings b
    JOIN users c ON b.customer_id = c.id
    LEFT JOIN users d ON b.driver_id = d.id
    LEFT JOIN vehicles v ON b.vehicle_id = v.id
  `;

  if (role === 'admin') {
    rows = db.prepare(`${baseSelect} ORDER BY b.created_at DESC`).all() as Record<string, unknown>[];
  } else if (role === 'customer') {
    rows = db.prepare(`${baseSelect} WHERE b.customer_id = ? ORDER BY b.created_at DESC`).all(userId) as Record<
      string,
      unknown
    >[];
  } else if (role === 'driver') {
    rows = db
      .prepare(
        `${baseSelect}
         WHERE b.driver_id = ?
            OR (b.driver_id IS NULL AND b.status = 'Pending')
            OR (v.owner_id = ?)
         ORDER BY b.created_at DESC`
      )
      .all(userId, userId) as Record<string, unknown>[];
  } else if (role === 'assistant') {
    rows = db
      .prepare(
        `${baseSelect}
         WHERE b.assistants_needed > 0
           AND b.status IN ('Pending', 'Accepted', 'Confirmed', 'Driver Assigned', 'In Transit', 'Completed')
         ORDER BY b.created_at DESC`
      )
      .all() as Record<string, unknown>[];
  }

  res.json({ bookings: rows.map(hydrateBooking) });
});

// Bookings: Single detail
app.get('/api/bookings/:id', requireAuth, (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const { userId, role } = req.auth!;
  const isAssignedAssistant = db
    .prepare('SELECT id FROM booking_assistants WHERE booking_id = ? AND assistant_id = ?')
    .get(bookingId, userId);

  const canView =
    role === 'admin' ||
    Number(row.customer_id) === userId ||
    Number(row.driver_id) === userId ||
    (role === 'driver' && row.driver_id === null && row.status === 'Pending') ||
    (role === 'assistant' && Number(row.assistants_needed) > 0) ||
    Boolean(isAssignedAssistant);

  if (!canView) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  res.json({ booking: hydrateBooking(row) });
});

// Bookings: Create (Customer)
app.post('/api/bookings', requireAuth, requireRole('customer', 'admin'), (req: AuthedRequest, res) => {
  const {
    vehicle_id,
    pickup_address,
    pickup_lat,
    pickup_lng,
    destination_address,
    destination_lat,
    destination_lng,
    distance_km,
    duration_mins,
    scheduled_date,
    scheduled_time,
    items_description,
    estimated_rooms,
    belongings_photos,
    assistants_needed,
    payment_method,
    payment_phone,
  } = req.body ?? {};

  if (!vehicle_id || !pickup_address || !destination_address || !scheduled_date || !scheduled_time || !items_description) {
    res.status(400).json({ error: 'Please complete pickup, destination, vehicle, schedule, and item description.' });
    return;
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND is_approved = 1').get(Number(vehicle_id)) as
    | { id: number; owner_id: number; title: string; base_fare_xaf: number; per_km_xaf: number }
    | undefined;
  if (!vehicle) {
    res.status(404).json({ error: 'Selected vehicle is not available.' });
    return;
  }

  const distKm = Math.max(1, Number(distance_km) || 5);
  const durMins = Math.max(10, Math.round(Number(duration_mins) || distKm * 3));
  const numAssistants = Math.max(0, Math.min(4, Math.round(Number(assistants_needed) || 0)));

  const vehicleFee = Math.round(vehicle.base_fare_xaf + distKm * vehicle.per_km_xaf);
  const assistantFee = numAssistants * ASSISTANT_FEE_PER_PERSON;
  const totalPrice = vehicleFee + assistantFee;

  const refCode = `MC-${Math.floor(2700 + Math.random() * 7200)}`;
  const photosArr = Array.isArray(belongings_photos) ? belongings_photos.slice(0, 6) : [];
  const method: PaymentMethod = ['mtn_momo', 'orange_money', 'cash'].includes(payment_method)
    ? payment_method
    : 'mtn_momo';

  const insertTx = db.transaction(() => {
    const bookingRes = db
      .prepare(
        `INSERT INTO bookings (
          reference_code, customer_id, driver_id, vehicle_id,
          pickup_address, pickup_lat, pickup_lng,
          destination_address, destination_lat, destination_lng,
          distance_km, duration_mins, scheduled_date, scheduled_time,
          items_description, estimated_rooms, belongings_photos,
          assistants_needed, assistant_fee_xaf, vehicle_fee_xaf, total_price_xaf,
          status
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`
      )
      .run(
        refCode,
        req.auth!.userId,
        vehicle.id,
        String(pickup_address).trim(),
        Number(pickup_lat) || 4.0511,
        Number(pickup_lng) || 9.7679,
        String(destination_address).trim(),
        Number(destination_lat) || 4.0725,
        Number(destination_lng) || 9.7448,
        Number(distKm.toFixed(1)),
        durMins,
        String(scheduled_date),
        String(scheduled_time),
        String(items_description).trim(),
        String(estimated_rooms || '1-2 Rooms'),
        JSON.stringify(photosArr),
        numAssistants,
        assistantFee,
        vehicleFee,
        totalPrice
      );

    const bookingId = Number(bookingRes.lastInsertRowid);
    const txRef =
      method === 'mtn_momo'
        ? `MOMO-${refCode}`
        : method === 'orange_money'
          ? `OM-${refCode}`
          : `CASH-${refCode}`;

    db.prepare(
      `INSERT INTO payments (booking_id, customer_id, amount_xaf, method, phone_number, transaction_ref, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).run(bookingId, req.auth!.userId, totalPrice, method, String(payment_phone || '').trim(), txRef);

    return bookingId;
  });

  const bookingId = insertTx();
  const hydrated = hydrateBooking(getBookingRow(bookingId)!);

  createNotification(
    req.auth!.userId,
    `Booking ${refCode} Submitted`,
    `Your move from ${pickup_address} to ${destination_address} is pending driver acceptance.`,
    'booking',
    bookingId
  );

  // Notify vehicle owner / driver
  createNotification(
    vehicle.owner_id,
    `New Move Request ${refCode}`,
    `Pickup: ${pickup_address} · ${distKm.toFixed(1)} km · ${totalPrice.toLocaleString('en-US')} XAF`,
    'booking',
    bookingId
  );
  pushToUser(vehicle.owner_id, 'booking:created', hydrated);

  // Notify assistants if requested
  if (numAssistants > 0) {
    const assistants = db
      .prepare(`SELECT id FROM users WHERE role = 'assistant' AND approval_status = 'approved'`)
      .all() as { id: number }[];
    for (const ast of assistants) {
      createNotification(
        ast.id,
        `Loading Assistance Needed (${refCode})`,
        `${numAssistants} assistant(s) needed on ${scheduled_date} at ${scheduled_time} (${pickup_address}).`,
        'assignment',
        bookingId
      );
      pushToUser(ast.id, 'booking:created', hydrated);
    }
  }

  pushToRole('admin', 'booking:created', hydrated);
  res.status(201).json({ booking: hydrated });
});

// Bookings: Update Status (Accept, Reject, Confirm, Driver Assigned, In Transit, Completed, Cancelled)
app.patch('/api/bookings/:id/status', requireAuth, (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { status, action } = req.body ?? {};
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const { userId, role } = req.auth!;
  const currentStatus = String(row.status) as BookingStatus;

  if (currentStatus === 'Completed' || currentStatus === 'Cancelled') {
    if (role !== 'admin') {
      res.status(400).json({ error: `Booking is already ${currentStatus}.` });
      return;
    }
  }

  // Driver reject open request
  if (action === 'reject' && role === 'driver') {
    createNotification(
      Number(row.customer_id),
      `Driver Declined ${row.reference_code}`,
      `Another verified driver can still accept your request, or an admin can assign one.`,
      'booking',
      bookingId
    );
    res.json({ booking: hydrateBooking(row) });
    return;
  }

  let nextStatus: BookingStatus = status;
  let driverIdToSet = row.driver_id ? Number(row.driver_id) : null;

  if (role === 'customer') {
    if (Number(row.customer_id) !== userId) {
      res.status(403).json({ error: 'Not authorized.' });
      return;
    }
    if (nextStatus !== 'Cancelled' && nextStatus !== 'Confirmed') {
      res.status(403).json({ error: 'Customers can only confirm or cancel bookings.' });
      return;
    }
    if (nextStatus === 'Cancelled' && ['In Transit', 'Completed'].includes(currentStatus)) {
      res.status(400).json({ error: 'Cannot cancel a move that is already in transit or completed.' });
      return;
    }
  } else if (role === 'driver') {
    const userRow = db.prepare('SELECT approval_status FROM users WHERE id = ?').get(userId) as {
      approval_status: string;
    };
    if (userRow.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your driver account is awaiting administrator approval.' });
      return;
    }
    const allowedDriverStatuses: BookingStatus[] = ['Accepted', 'Confirmed', 'Driver Assigned', 'In Transit', 'Completed'];
    if (!allowedDriverStatuses.includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid status transition for driver.' });
      return;
    }
    if (row.driver_id !== null && Number(row.driver_id) !== userId) {
      res.status(403).json({ error: 'This booking is assigned to another driver.' });
      return;
    }
    driverIdToSet = userId;
  } else if (role !== 'admin') {
    res.status(403).json({ error: 'Not authorized to change booking status.' });
    return;
  }

  // If transitioning to In Transit without GPS yet, seed initial driver coordinates at pickup
  const driverLat =
    nextStatus === 'In Transit' && row.driver_lat === null ? Number(row.pickup_lat) : row.driver_lat;
  const driverLng =
    nextStatus === 'In Transit' && row.driver_lng === null ? Number(row.pickup_lng) : row.driver_lng;

  db.prepare(
    `UPDATE bookings
     SET status = ?, driver_id = ?, driver_lat = ?, driver_lng = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, driverIdToSet, driverLat, driverLng, bookingId);

  if (nextStatus === 'Completed') {
    db.prepare(`UPDATE booking_assistants SET status = 'completed' WHERE booking_id = ? AND status = 'accepted'`).run(
      bookingId
    );
  }

  createNotification(
    Number(row.customer_id),
    `Move ${row.reference_code}: ${nextStatus}`,
    nextStatus === 'Driver Assigned' || nextStatus === 'Accepted'
      ? `Your driver has accepted and is preparing for pickup.`
      : nextStatus === 'In Transit'
        ? `Your belongings are in transit! Open live map tracking to follow your driver.`
        : nextStatus === 'Completed'
          ? `Delivery completed! Please rate your MoveCam experience.`
          : `Booking status updated to ${nextStatus}.`,
    'booking',
    bookingId
  );

  if (driverIdToSet && driverIdToSet !== userId) {
    createNotification(
      driverIdToSet,
      `Booking ${row.reference_code} Updated`,
      `Status changed to ${nextStatus}.`,
      'booking',
      bookingId
    );
  }

  broadcastBookingUpdate(bookingId);
  res.json({ booking: hydrateBooking(getBookingRow(bookingId)!) });
});

// Driver Live GPS Location Update
app.post('/api/bookings/:id/location', requireAuth, requireRole('driver', 'admin'), (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { lat, lng } = req.body ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'Valid numeric lat and lng are required.' });
    return;
  }
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  if (req.auth!.role === 'driver' && Number(row.driver_id) !== req.auth!.userId) {
    res.status(403).json({ error: 'Only the assigned driver can update live trip coordinates.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE bookings SET driver_lat = ?, driver_lng = ?, driver_location_updated_at = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(lat, lng, nowIso, bookingId);

  const payload = { bookingId, lat, lng, updatedAt: nowIso };
  pushToUser(Number(row.customer_id), 'booking:location', payload);
  if (row.driver_id) pushToUser(Number(row.driver_id), 'booking:location', payload);
  pushToRole('admin', 'booking:location', payload);

  res.json(payload);
});

// Assistant Schedules & Job Acceptance
app.get('/api/assistant/schedules', requireAuth, requireRole('assistant', 'admin'), (req: AuthedRequest, res) => {
  const targetId = req.query.assistant_id && req.auth!.role === 'admin' ? Number(req.query.assistant_id) : req.auth!.userId;
  const schedules = db
    .prepare('SELECT * FROM assistant_schedules WHERE assistant_id = ? ORDER BY id ASC')
    .all(targetId);
  res.json({ schedules });
});

app.put('/api/assistant/schedules', requireAuth, requireRole('assistant'), (req: AuthedRequest, res) => {
  const { schedules } = req.body ?? {};
  if (!Array.isArray(schedules)) {
    res.status(400).json({ error: 'Schedules array is required.' });
    return;
  }
  const upsert = db.prepare(`
    INSERT INTO assistant_schedules (assistant_id, day_of_week, start_time, end_time, is_available, city, hourly_rate_xaf)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assistant_id, day_of_week) DO UPDATE SET
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      is_available = excluded.is_available,
      city = excluded.city,
      hourly_rate_xaf = excluded.hourly_rate_xaf
  `);

  const tx = db.transaction(() => {
    for (const item of schedules) {
      upsert.run(
        req.auth!.userId,
        String(item.day_of_week),
        String(item.start_time || '08:00'),
        String(item.end_time || '18:00'),
        item.is_available ? 1 : 0,
        String(item.city || 'Douala'),
        Number(item.hourly_rate_xaf) || 3500
      );
    }
  });
  tx();

  const updated = db.prepare('SELECT * FROM assistant_schedules WHERE assistant_id = ? ORDER BY id ASC').all(req.auth!.userId);
  res.json({ schedules: updated });
});

app.post('/api/bookings/:id/assistants/respond', requireAuth, requireRole('assistant'), (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { decision } = req.body ?? {};
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const userRow = db.prepare('SELECT name, approval_status FROM users WHERE id = ?').get(req.auth!.userId) as {
    name: string;
    approval_status: string;
  };
  if (userRow.approval_status !== 'approved') {
    res.status(403).json({ error: 'Your moving assistant account is awaiting administrator approval.' });
    return;
  }
  const nextDecision = decision === 'declined' ? 'declined' : 'accepted';

  if (nextDecision === 'accepted') {
    const acceptedCount = (
      db
        .prepare(`SELECT COUNT(*) as c FROM booking_assistants WHERE booking_id = ? AND status IN ('accepted', 'completed')`)
        .get(bookingId) as { c: number }
    ).c;
    if (acceptedCount >= Number(row.assistants_needed)) {
      const alreadyMe = db
        .prepare(`SELECT id FROM booking_assistants WHERE booking_id = ? AND assistant_id = ?`)
        .get(bookingId, req.auth!.userId);
      if (!alreadyMe) {
        res.status(409).json({ error: 'All assistant slots for this move are already filled.' });
        return;
      }
    }
  }

  db.prepare(
    `INSERT INTO booking_assistants (booking_id, assistant_id, status)
     VALUES (?, ?, ?)
     ON CONFLICT(booking_id, assistant_id) DO UPDATE SET status = excluded.status`
  ).run(bookingId, req.auth!.userId, nextDecision);

  if (nextDecision === 'accepted') {
    createNotification(
      Number(row.customer_id),
      `Moving Assistant Assigned (${row.reference_code})`,
      `${userRow.name} accepted your loading & unloading assignment.`,
      'assignment',
      bookingId
    );
    if (row.driver_id) {
      createNotification(
        Number(row.driver_id),
        `Assistant Joined (${row.reference_code})`,
        `${userRow.name} will assist with loading/unloading.`,
        'assignment',
        bookingId
      );
    }
  }

  broadcastBookingUpdate(bookingId);
  res.json({ booking: hydrateBooking(getBookingRow(bookingId)!) });
});

// Payments (MTN MoMo, Orange Money, Authorised Cash)
app.get('/api/payments', requireAuth, (req: AuthedRequest, res) => {
  const { userId, role } = req.auth!;
  let payments: unknown[] = [];
  if (role === 'admin') {
    payments = db
      .prepare(
        `SELECT p.*, b.reference_code as booking_ref, u.name as customer_name
         FROM payments p
         JOIN bookings b ON p.booking_id = b.id
         JOIN users u ON p.customer_id = u.id
         ORDER BY p.created_at DESC`
      )
      .all();
  } else if (role === 'customer') {
    payments = db
      .prepare(
        `SELECT p.*, b.reference_code as booking_ref, u.name as customer_name
         FROM payments p
         JOIN bookings b ON p.booking_id = b.id
         JOIN users u ON p.customer_id = u.id
         WHERE p.customer_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(userId);
  } else if (role === 'driver') {
    payments = db
      .prepare(
        `SELECT p.*, b.reference_code as booking_ref, u.name as customer_name
         FROM payments p
         JOIN bookings b ON p.booking_id = b.id
         JOIN users u ON p.customer_id = u.id
         WHERE b.driver_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(userId);
  }
  res.json({ payments });
});

app.post('/api/payments/:id/confirm', requireAuth, (req: AuthedRequest, res) => {
  const paymentId = Number(req.params.id);
  const { method, phone_number, transaction_ref } = req.body ?? {};
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
    | (Record<string, unknown> & { id: number; booking_id: number; customer_id: number; method: PaymentMethod; amount_xaf: number })
    | undefined;
  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }
  const booking = getBookingRow(payment.booking_id);
  if (!booking) {
    res.status(404).json({ error: 'Linked booking not found.' });
    return;
  }

  const { userId, role } = req.auth!;
  const isOwner = payment.customer_id === userId;
  const isAssignedDriver = role === 'driver' && Number(booking.driver_id) === userId;
  if (!isOwner && !isAssignedDriver && role !== 'admin') {
    res.status(403).json({ error: 'Not authorized to update this payment.' });
    return;
  }

  const nextMethod: PaymentMethod = ['mtn_momo', 'orange_money', 'cash'].includes(method) ? method : payment.method;
  let nextStatus = 'paid';
  let authorizedBy: number | null = null;

  if (nextMethod === 'cash') {
    if (role === 'driver' || role === 'admin') {
      nextStatus = 'authorized';
      authorizedBy = userId;
    } else {
      nextStatus = 'pending';
    }
  }

  const nextRef =
    String(transaction_ref || '').trim() ||
    (nextMethod === 'mtn_momo'
      ? `MOMO-CM-${Math.floor(100000 + Math.random() * 899999)}`
      : nextMethod === 'orange_money'
        ? `OM-CM-${Math.floor(100000 + Math.random() * 899999)}`
        : `CASH-AUTH-${booking.reference_code}`);

  db.prepare(
    `UPDATE payments
     SET method = ?, phone_number = ?, transaction_ref = ?, status = ?, authorized_by = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextMethod, String(phone_number ?? payment.phone_number), nextRef, nextStatus, authorizedBy, paymentId);

  if (nextStatus === 'paid' && booking.status === 'Accepted') {
    db.prepare(`UPDATE bookings SET status = 'Confirmed', updated_at = datetime('now') WHERE id = ?`).run(booking.id);
  }

  createNotification(
    payment.customer_id,
    `Payment ${nextStatus === 'authorized' ? 'Authorized' : nextStatus === 'paid' ? 'Confirmed' : 'Updated'}`,
    `${Number(payment.amount_xaf).toLocaleString('en-US')} XAF via ${
      nextMethod === 'mtn_momo' ? 'MTN Mobile Money' : nextMethod === 'orange_money' ? 'Orange Money' : 'Authorised Cash'
    } (Ref: ${nextRef}).`,
    'payment',
    booking.id as number
  );

  if (booking.driver_id) {
    createNotification(
      Number(booking.driver_id),
      `Payment Update (${booking.reference_code})`,
      `Payment status is now ${nextStatus.toUpperCase()} (${nextRef}).`,
      'payment',
      booking.id as number
    );
  }

  broadcastBookingUpdate(payment.booking_id);
  const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  res.json({ payment: updatedPayment });
});

// Messages (Customer <-> Driver <-> Admin)
app.get('/api/bookings/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const { userId, role } = req.auth!;
  if (role !== 'admin' && Number(row.customer_id) !== userId && Number(row.driver_id) !== userId) {
    res.status(403).json({ error: 'Access denied to booking chat.' });
    return;
  }
  const messages = db
    .prepare(
      `SELECT m.*, u.name as sender_name, u.role as sender_role
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.booking_id = ? ORDER BY m.created_at ASC`
    )
    .all(bookingId);
  res.json({ messages });
});

app.post('/api/bookings/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { content } = req.body ?? {};
  if (!content || !String(content).trim()) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const { userId, role } = req.auth!;
  if (role !== 'admin' && Number(row.customer_id) !== userId && Number(row.driver_id) !== userId) {
    res.status(403).json({ error: 'Only the customer, assigned driver, or admin can send messages on this move.' });
    return;
  }

  const result = db
    .prepare('INSERT INTO messages (booking_id, sender_id, content) VALUES (?, ?, ?)')
    .run(bookingId, userId, String(content).trim());
  const message = db
    .prepare(
      `SELECT m.*, u.name as sender_name, u.role as sender_role
       FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`
    )
    .get(result.lastInsertRowid);

  pushToUser(Number(row.customer_id), 'message:new', message);
  if (row.driver_id) pushToUser(Number(row.driver_id), 'message:new', message);
  pushToRole('admin', 'message:new', message);

  if (userId === Number(row.customer_id) && row.driver_id) {
    createNotification(
      Number(row.driver_id),
      `Message on ${row.reference_code}`,
      String(content).trim().slice(0, 90),
      'booking',
      bookingId
    );
  } else if (row.driver_id && userId === Number(row.driver_id)) {
    createNotification(
      Number(row.customer_id),
      `Driver Message (${row.reference_code})`,
      String(content).trim().slice(0, 90),
      'booking',
      bookingId
    );
  }

  res.status(201).json({ message });
});

// Notifications
app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(req.auth!.userId);
  res.json({ notifications });
});

app.patch('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.auth!.userId);
  res.json({ ok: true });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    Number(req.params.id),
    req.auth!.userId
  );
  res.json({ ok: true });
});

// Ratings
app.post('/api/bookings/:id/rate', requireAuth, requireRole('customer'), (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { score, comment } = req.body ?? {};
  const booking = getBookingRow(bookingId);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  if (Number(booking.customer_id) !== req.auth!.userId) {
    res.status(403).json({ error: 'Only the booking customer can leave a rating.' });
    return;
  }
  if (booking.status !== 'Completed') {
    res.status(400).json({ error: 'You can rate a move once it is Completed.' });
    return;
  }
  if (!booking.driver_id) {
    res.status(400).json({ error: 'No driver assigned to rate.' });
    return;
  }
  const numScore = Math.max(1, Math.min(5, Math.round(Number(score) || 5)));

  db.prepare(
    `INSERT INTO ratings (booking_id, customer_id, driver_id, score, comment)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(booking_id) DO UPDATE SET score = excluded.score, comment = excluded.comment`
  ).run(bookingId, req.auth!.userId, Number(booking.driver_id), numScore, String(comment || '').trim());

  createNotification(
    Number(booking.driver_id),
    `New ${numScore}-Star Review (${booking.reference_code})`,
    String(comment || 'Customer rated your completed relocation.'),
    'system',
    bookingId
  );

  broadcastBookingUpdate(bookingId);
  res.status(201).json({ booking: hydrateBooking(getBookingRow(bookingId)!) });
});

// Complaints
app.get('/api/complaints', requireAuth, (req: AuthedRequest, res) => {
  const { userId, role } = req.auth!;
  const query =
    role === 'admin'
      ? `SELECT c.*, u.name as user_name, u.role as user_role, b.reference_code as booking_ref
         FROM complaints c
         JOIN users u ON c.user_id = u.id
         LEFT JOIN bookings b ON c.booking_id = b.id
         ORDER BY c.created_at DESC`
      : `SELECT c.*, u.name as user_name, u.role as user_role, b.reference_code as booking_ref
         FROM complaints c
         JOIN users u ON c.user_id = u.id
         LEFT JOIN bookings b ON c.booking_id = b.id
         WHERE c.user_id = ?
         ORDER BY c.created_at DESC`;

  const complaints = role === 'admin' ? db.prepare(query).all() : db.prepare(query).all(userId);
  res.json({ complaints });
});

app.post('/api/complaints', requireAuth, (req: AuthedRequest, res) => {
  const { booking_id, subject, description } = req.body ?? {};
  if (!subject || !description) {
    res.status(400).json({ error: 'Subject and description are required.' });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO complaints (booking_id, user_id, subject, description, status)
       VALUES (?, ?, ?, ?, 'open')`
    )
    .run(booking_id ? Number(booking_id) : null, req.auth!.userId, String(subject).trim(), String(description).trim());

  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as { id: number }[];
  for (const adm of admins) {
    createNotification(adm.id, 'New Support Complaint', String(subject).trim(), 'system', booking_id ? Number(booking_id) : null);
  }
  const complaint = db
    .prepare(
      `SELECT c.*, u.name as user_name, u.role as user_role, b.reference_code as booking_ref
       FROM complaints c JOIN users u ON c.user_id = u.id LEFT JOIN bookings b ON c.booking_id = b.id
       WHERE c.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json({ complaint });
});

app.patch('/api/complaints/:id', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const complaintId = Number(req.params.id);
  const { status, admin_notes } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }
  const nextStatus = ['open', 'investigating', 'resolved'].includes(status) ? status : existing.status;
  db.prepare(
    `UPDATE complaints SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(nextStatus, String(admin_notes ?? existing.admin_notes), complaintId);

  createNotification(
    Number(existing.user_id),
    `Complaint Update: ${nextStatus}`,
    String(admin_notes || `Your complaint "${existing.subject}" is now marked as ${nextStatus}.`),
    'system',
    existing.booking_id ? Number(existing.booking_id) : null
  );

  const updated = db
    .prepare(
      `SELECT c.*, u.name as user_name, u.role as user_role, b.reference_code as booking_ref
       FROM complaints c JOIN users u ON c.user_id = u.id LEFT JOIN bookings b ON c.booking_id = b.id
       WHERE c.id = ?`
    )
    .get(complaintId);
  res.json({ complaint: updated });
});

// Admin Dashboard Routes
app.get('/api/admin/stats', requireAuth, requireRole('admin'), (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const customersCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'customer'`).get() as { c: number }).c;
  const driversCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'driver'`).get() as { c: number }).c;
  const assistantsCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'assistant'`).get() as { c: number }).c;
  const pendingProviders = (
    db.prepare(`SELECT COUNT(*) as c FROM users WHERE role IN ('driver', 'assistant') AND approval_status = 'pending'`).get() as {
      c: number;
    }
  ).c;
  const totalVehicles = (db.prepare('SELECT COUNT(*) as c FROM vehicles').get() as { c: number }).c;
  const totalBookings = (db.prepare('SELECT COUNT(*) as c FROM bookings').get() as { c: number }).c;
  const activeMoves = (
    db
      .prepare(`SELECT COUNT(*) as c FROM bookings WHERE status IN ('Accepted', 'Confirmed', 'Driver Assigned', 'In Transit')`)
      .get() as { c: number }
  ).c;
  const completedMoves = (db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'Completed'`).get() as { c: number }).c;
  const totalRevenueXaf =
    (
      db.prepare(`SELECT COALESCE(SUM(amount_xaf), 0) as total FROM payments WHERE status IN ('paid', 'authorized')`).get() as {
        total: number;
      }
    ).total || 0;
  const openComplaints = (
    db.prepare(`SELECT COUNT(*) as c FROM complaints WHERE status IN ('open', 'investigating')`).get() as { c: number }
  ).c;

  res.json({
    stats: {
      totalUsers,
      customersCount,
      driversCount,
      assistantsCount,
      pendingProviders,
      totalVehicles,
      totalBookings,
      activeMoves,
      completedMoves,
      totalRevenueXaf,
      openComplaints,
    },
  });
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
  const users = db
    .prepare(
      `SELECT id, name, email, phone, role, city, approval_status, bio, license_number, avatar_url, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all();
  res.json({ users });
});

app.patch('/api/admin/users/:id/approval', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { approval_status } = req.body ?? {};
  if (!['pending', 'approved', 'rejected', 'suspended'].includes(approval_status)) {
    res.status(400).json({ error: 'Invalid approval status.' });
    return;
  }
  const existing = getSafeUserById(targetId);
  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  db.prepare('UPDATE users SET approval_status = ? WHERE id = ?').run(approval_status, targetId);
  if (approval_status === 'approved') {
    db.prepare('UPDATE vehicles SET is_approved = 1 WHERE owner_id = ?').run(targetId);
  }
  createNotification(
    targetId,
    `Account Status: ${String(approval_status).toUpperCase()}`,
    approval_status === 'approved'
      ? 'Your MoveCam service provider account has been verified and approved.'
      : `Your account status was updated to ${approval_status}.`,
    'system',
    null
  );
  res.json({ user: getSafeUserById(targetId) });
});

app.post('/api/admin/bookings/:id/assign-driver', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const bookingId = Number(req.params.id);
  const { driver_id } = req.body ?? {};
  const row = getBookingRow(bookingId);
  if (!row) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const driver = getSafeUserById(Number(driver_id));
  if (!driver || driver.role !== 'driver') {
    res.status(404).json({ error: 'Valid driver not found.' });
    return;
  }
  db.prepare(
    `UPDATE bookings SET driver_id = ?, status = 'Driver Assigned', updated_at = datetime('now') WHERE id = ?`
  ).run(Number(driver_id), bookingId);

  createNotification(
    Number(driver_id),
    `Assigned to Move ${row.reference_code}`,
    `Admin assigned you to ${row.pickup_address} -> ${row.destination_address}.`,
    'assignment',
    bookingId
  );
  createNotification(
    Number(row.customer_id),
    `Driver Assigned (${row.reference_code})`,
    `${String(driver.name)} has been assigned to your relocation.`,
    'booking',
    bookingId
  );
  broadcastBookingUpdate(bookingId);
  res.json({ booking: hydrateBooking(getBookingRow(bookingId)!) });
});

// Create HTTP server & attach WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Missing auth token');
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const userId = decoded.userId;

    if (!wsClients.has(userId)) {
      wsClients.set(userId, new Set());
    }
    wsClients.get(userId)!.add(ws);

    ws.send(JSON.stringify({ event: 'ws:connected', data: { userId } }));

    ws.on('close', () => {
      const set = wsClients.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          wsClients.delete(userId);
        }
      }
    });
  } catch {
    ws.close(4002, 'Invalid token');
  }
});

// Mount Vite middleware in development OR serve dist/ in production
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MoveCam server listening on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MoveCam server:', err);
  process.exit(1);
});
