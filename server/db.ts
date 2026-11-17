import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'movecam.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'driver', 'assistant', 'admin')),
      city TEXT NOT NULL DEFAULT 'Douala',
      approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
      bio TEXT NOT NULL DEFAULT '',
      license_number TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Pickup Truck', 'Cargo Van', 'Box Truck', 'Heavy Lorry')),
      plate_number TEXT NOT NULL,
      capacity_label TEXT NOT NULL,
      max_weight_kg INTEGER NOT NULL DEFAULT 1500,
      base_fare_xaf INTEGER NOT NULL,
      per_km_xaf INTEGER NOT NULL,
      city TEXT NOT NULL DEFAULT 'Douala',
      photo_url TEXT NOT NULL DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      is_approved INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assistant_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assistant_id INTEGER NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      city TEXT NOT NULL DEFAULT 'Douala',
      hourly_rate_xaf INTEGER NOT NULL DEFAULT 3500,
      FOREIGN KEY (assistant_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(assistant_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_code TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      driver_id INTEGER,
      vehicle_id INTEGER,
      pickup_address TEXT NOT NULL,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      destination_address TEXT NOT NULL,
      destination_lat REAL NOT NULL,
      destination_lng REAL NOT NULL,
      distance_km REAL NOT NULL DEFAULT 1,
      duration_mins INTEGER NOT NULL DEFAULT 15,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      items_description TEXT NOT NULL,
      estimated_rooms TEXT NOT NULL DEFAULT '1-2 Rooms',
      belongings_photos TEXT NOT NULL DEFAULT '[]',
      assistants_needed INTEGER NOT NULL DEFAULT 0,
      assistant_fee_xaf INTEGER NOT NULL DEFAULT 0,
      vehicle_fee_xaf INTEGER NOT NULL DEFAULT 0,
      total_price_xaf INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Accepted', 'Confirmed', 'Driver Assigned', 'In Transit', 'Completed', 'Cancelled')),
      driver_lat REAL,
      driver_lng REAL,
      driver_location_updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS booking_assistants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      assistant_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned', 'accepted', 'declined', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (assistant_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(booking_id, assistant_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      amount_xaf INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('mtn_momo', 'orange_money', 'cash')),
      phone_number TEXT NOT NULL DEFAULT '',
      transaction_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'authorized', 'failed')),
      authorized_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (authorized_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'booking' CHECK(type IN ('booking', 'assignment', 'payment', 'system')),
      booking_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'investigating', 'resolved')),
      admin_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, city, approval_status, bio, license_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const adminPass = bcrypt.hashSync('MoveCam2026!', 10);
  const custPass = bcrypt.hashSync('Customer123!', 10);
  const drvPass = bcrypt.hashSync('Driver123!', 10);
  const astPass = bcrypt.hashSync('Assistant123!', 10);

  const adminId = Number(
    insertUser.run(
      'Nadine Eyenga',
      'admin@movecam.cm',
      '+237 677 001 100',
      adminPass,
      'admin',
      'Douala',
      'approved',
      'Operations & Compliance Administrator at MoveCam Cameroon.',
      'MC-ADMIN-01'
    ).lastInsertRowid
  );

  const customerId = Number(
    insertUser.run(
      'Clarisse Mbarga',
      'clarisse.mbarga@movecam.cm',
      '+237 675 412 890',
      custPass,
      'customer',
      'Douala',
      'approved',
      'Relocating household items across Douala and Yaoundé.',
      ''
    ).lastInsertRowid
  );

  const driver1Id = Number(
    insertUser.run(
      'Jean-Paul Tchoumi',
      'jean.tchoumi@movecam.cm',
      '+237 699 204 511',
      drvPass,
      'driver',
      'Douala',
      'approved',
      '10 years commercial moving & furniture logistics experience in Littoral & Centre regions.',
      'CM-DL-88412'
    ).lastInsertRowid
  );

  const driver2Id = Number(
    insertUser.run(
      'Samuel Ndongo',
      'samuel.ndongo@movecam.cm',
      '+237 681 930 144',
      drvPass,
      'driver',
      'Yaoundé',
      'approved',
      'Intercity heavy-duty relocation specialist serving Yaoundé, Douala, and Bafoussam.',
      'CM-CE-55309'
    ).lastInsertRowid
  );

  insertUser.run(
    'Eric Foning',
    'eric.foning@movecam.cm',
    '+237 672 558 310',
    drvPass,
    'driver',
    'Bafoussam',
    'pending',
    'Fleet owner applying to serve West Region residential relocations.',
    'CM-OU-19204'
  );

  const assistant1Id = Number(
    insertUser.run(
      'Pierre Kamtchueng',
      'pierre.kamtchueng@movecam.cm',
      '+237 674 881 220',
      astPass,
      'assistant',
      'Douala',
      'approved',
      'Lead packing and heavy appliance handling specialist. Straps, blankets, and dollies equipped.',
      'MC-AST-104'
    ).lastInsertRowid
  );

  const assistant2Id = Number(
    insertUser.run(
      'Aline Nkeng',
      'aline.nkeng@movecam.cm',
      '+237 693 114 708',
      astPass,
      'assistant',
      'Yaoundé',
      'approved',
      'Fragile glassware wrapping, wardrobe boxing, and multi-floor apartment loading.',
      'MC-AST-209'
    ).lastInsertRowid
  );

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (owner_id, title, vehicle_type, plate_number, capacity_label, max_weight_kg, base_fare_xaf, per_km_xaf, city, photo_url, is_available, is_approved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const vanId = Number(
    insertVehicle.run(
      driver1Id,
      'Toyota Hiace Cargo Van',
      'Cargo Van',
      'LT 482 KP',
      'Studio / 1-Bedroom · Up to 1,200 kg',
      1200,
      18000,
      1100,
      'Douala',
      '/src/assets/images/vehicle_pickup_van_1794844161070.jpg',
      1,
      1
    ).lastInsertRowid
  );

  const boxTruckId = Number(
    insertVehicle.run(
      driver1Id,
      'Isuzu NPR Moving Box Truck',
      'Box Truck',
      'LT 914 MV',
      '2–3 Bedroom Home · Up to 3,500 kg',
      3500,
      32000,
      1600,
      'Douala',
      '/src/assets/images/vehicle_box_truck_1794844159667.jpg',
      1,
      1
    ).lastInsertRowid
  );

  const pickupId = Number(
    insertVehicle.run(
      driver2Id,
      'Ford Ranger Utility Pickup',
      'Pickup Truck',
      'CE 319 TR',
      'Single Items / Quick Move · Up to 1,000 kg',
      1000,
      15000,
      950,
      'Yaoundé',
      '/src/assets/images/vehicle_pickup_van_1794844161070.jpg',
      1,
      1
    ).lastInsertRowid
  );

  const heavyTruckId = Number(
    insertVehicle.run(
      driver2Id,
      'Volvo FH Intercity Relocation Lorry',
      'Heavy Lorry',
      'CE 772 HG',
      '4+ Bedroom Villa / Intercity · Up to 8,000 kg',
      8000,
      65000,
      2400,
      'Yaoundé',
      '/src/assets/images/vehicle_heavy_mover_1794844161059.jpg',
      1,
      1
    ).lastInsertRowid
  );

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const insertSched = db.prepare(`
    INSERT INTO assistant_schedules (assistant_id, day_of_week, start_time, end_time, is_available, city, hourly_rate_xaf)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const day of days) {
    insertSched.run(assistant1Id, day, '07:00', '18:00', day === 'Sunday' ? 0 : 1, 'Douala', 3500);
    insertSched.run(assistant2Id, day, '07:30', '17:30', day === 'Sunday' ? 0 : 1, 'Yaoundé', 3500);
  }

  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      reference_code, customer_id, driver_id, vehicle_id,
      pickup_address, pickup_lat, pickup_lng,
      destination_address, destination_lat, destination_lng,
      distance_km, duration_mins, scheduled_date, scheduled_time,
      items_description, estimated_rooms, belongings_photos,
      assistants_needed, assistant_fee_xaf, vehicle_fee_xaf, total_price_xaf,
      status, driver_lat, driver_lng, driver_location_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const activeBookingId = Number(
    insertBooking.run(
      'MC-2601',
      customerId,
      driver1Id,
      boxTruckId,
      'Rue Toyota, Bonapriso, Douala, Cameroon',
      4.0273,
      9.6989,
      'Carrefour Makepe, Douala, Cameroon',
      4.0725,
      9.7448,
      9.4,
      28,
      '2026-11-16',
      '09:00',
      '3-seater leather sofa, Samsung double-door fridge, queen bed frame, dining table with 6 chairs, 18 moving cartons.',
      '2-3 Bedroom Apartment',
      JSON.stringify(['/src/assets/images/team_moving_crew_1794844161698.jpg']),
      2,
      24000,
      47040,
      71040,
      'In Transit',
      4.0485,
      9.7212,
      new Date().toISOString()
    ).lastInsertRowid
  );

  const pendingBookingId = Number(
    insertBooking.run(
      'MC-2602',
      customerId,
      null,
      pickupId,
      'Quartier Bastos, Yaoundé, Cameroon',
      3.8907,
      11.5143,
      'Biyem-Assi Acacia, Yaoundé, Cameroon',
      3.8384,
      11.4863,
      8.1,
      24,
      '2026-11-18',
      '10:30',
      'Home office desk, ergonomic chair, bookshelf, 10 medium storage boxes, flat-screen TV.',
      '1-Bedroom Studio',
      JSON.stringify([]),
      1,
      12000,
      22695,
      34695,
      'Pending',
      null,
      null,
      null
    ).lastInsertRowid
  );

  const completedBookingId = Number(
    insertBooking.run(
      'MC-2594',
      customerId,
      driver1Id,
      vanId,
      'Akwa Boulevard de la Liberté, Douala, Cameroon',
      4.0472,
      9.6967,
      'Logpom Bassong, Douala, Cameroon',
      4.0842,
      9.7661,
      11.8,
      34,
      '2026-11-08',
      '08:00',
      'Queen mattress, wardrobe, washing machine, 12 labeled kitchen boxes.',
      '1-2 Bedroom Apartment',
      JSON.stringify([]),
      1,
      12000,
      30980,
      42980,
      'Completed',
      4.0842,
      9.7661,
      '2026-11-08T11:20:00.000Z'
    ).lastInsertRowid
  );

  db.prepare(`INSERT INTO booking_assistants (booking_id, assistant_id, status) VALUES (?, ?, ?)`).run(
    activeBookingId,
    assistant1Id,
    'accepted'
  );
  db.prepare(`INSERT INTO booking_assistants (booking_id, assistant_id, status) VALUES (?, ?, ?)`).run(
    completedBookingId,
    assistant1Id,
    'completed'
  );

  const insertPayment = db.prepare(`
    INSERT INTO payments (booking_id, customer_id, amount_xaf, method, phone_number, transaction_ref, status, authorized_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPayment.run(activeBookingId, customerId, 71040, 'mtn_momo', '+237 675 412 890', 'MOMO-CM-882410', 'paid', null);
  insertPayment.run(pendingBookingId, customerId, 34695, 'orange_money', '+237 695 210 334', 'OM-PENDING-2602', 'pending', null);
  insertPayment.run(completedBookingId, customerId, 42980, 'cash', '+237 675 412 890', 'CASH-AUTH-2594', 'authorized', driver1Id);

  const insertMessage = db.prepare(`INSERT INTO messages (booking_id, sender_id, content) VALUES (?, ?, ?)`);
  insertMessage.run(activeBookingId, driver1Id, 'Bonjour Clarisse, we have loaded the sofa and fridge securely and are heading up Boulevard de la République toward Makepe.');
  insertMessage.run(activeBookingId, customerId, 'Thank you Jean-Paul! Please take the turn right after TotalEnergies Makepe, the gate is green.');

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, body, type, booking_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNotif.run(customerId, 'Move MC-2601 is In Transit', 'Driver Jean-Paul Tchoumi is sharing live GPS location toward Carrefour Makepe.', 'booking', activeBookingId);
  insertNotif.run(customerId, 'MTN Mobile Money Confirmed', 'Payment of 71,040 XAF (Ref: MOMO-CM-882410) was confirmed.', 'payment', activeBookingId);
  insertNotif.run(driver1Id, 'Active Route: MC-2601', 'Customer Clarisse Mbarga sent delivery gate directions for Carrefour Makepe.', 'booking', activeBookingId);
  insertNotif.run(adminId, 'New Provider Awaiting Approval', 'Driver Eric Foning (Bafoussam) submitted registration for fleet verification.', 'system', null);

  db.prepare(`INSERT INTO ratings (booking_id, customer_id, driver_id, score, comment) VALUES (?, ?, ?, ?, ?)`).run(
    completedBookingId,
    customerId,
    driver1Id,
    5,
    'Very punctual crew, careful with the washing machine up two flights of stairs.'
  );

  db.prepare(`
    INSERT INTO complaints (booking_id, user_id, subject, description, status, admin_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    completedBookingId,
    customerId,
    'Receipt PDF reference clarification',
    'Wanted confirmation that the cash authorization code CASH-AUTH-2594 covers both driver and assistant fees.',
    'resolved',
    'Verified full settlement of 42,980 XAF including 12,000 XAF assistant allocation.'
  );

  // Also ensure unused vehicle variable lint warning doesn't happen
  void heavyTruckId;
}
