const express = require('express');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// Create SQLite database
const db = new Database('DogWalkService.db');
console.log('SQLite database ready.');

function insertData() {
  // Create tables
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS Dogs (
      dog_id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES Users(user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS WalkRequests (
      request_id INTEGER PRIMARY KEY AUTOINCREMENT,
      dog_id INTEGER NOT NULL,
      requested_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      location TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS WalkApplications (
      application_id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      walker_id INTEGER NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
      FOREIGN KEY (walker_id) REFERENCES Users(user_id),
      UNIQUE (request_id, walker_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS WalkRatings (
      rating_id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      walker_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      comments TEXT,
      rated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
      FOREIGN KEY (walker_id) REFERENCES Users(user_id),
      FOREIGN KEY (owner_id) REFERENCES Users(user_id),
      UNIQUE (request_id)
    )
  `).run();

  db.prepare('DELETE FROM WalkRatings').run();
  db.prepare('DELETE FROM WalkApplications').run();
  db.prepare('DELETE FROM WalkRequests').run();
  db.prepare('DELETE FROM Dogs').run();
  db.prepare('DELETE FROM Users').run();

  const insertUser = db.prepare(`
    INSERT INTO Users (username, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);
  insertUser.run('alice123', 'alice@example.com', 'hashed123', 'owner');
  insertUser.run('bobwalker', 'bob@example.com', 'hashed456', 'walker');
  insertUser.run('carol123', 'carol@example.com', 'hashed789', 'owner');
  insertUser.run('stevewalker', 'steve@example.com', 'hashed147', 'walker');
  insertUser.run('jimmy123', 'jimmy@example.com', 'hashed369', 'owner');

  const getUserId = db.prepare('SELECT user_id FROM Users WHERE username = ?');

  const insertDog = db.prepare(`
    INSERT INTO Dogs (owner_id, name, size)
    VALUES (?, ?, ?)
  `);
  insertDog.run(getUserId.get('alice123').user_id, 'Max', 'medium');
  insertDog.run(getUserId.get('carol123').user_id, 'Bella', 'small');
  insertDog.run(getUserId.get('jimmy123').user_id, 'Apple', 'large');
  insertDog.run(getUserId.get('alice123').user_id, 'Banana', 'small');
  insertDog.run(getUserId.get('carol123').user_id, 'Cake', 'medium');

  const getDogId = db.prepare('SELECT dog_id FROM Dogs WHERE name = ?');

  const insertWalk = db.prepare(`
    INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertWalk.run(getDogId.get('Max').dog_id, '2025-06-10 08:00:00', 30, 'Parklands', 'open');
  insertWalk.run(getDogId.get('Bella').dog_id, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted');
  insertWalk.run(getDogId.get('Apple').dog_id, '2025-06-11 08:00:00', 60, 'Lakeside Trail', 'open');
  insertWalk.run(getDogId.get('Banana').dog_id, '2025-06-12 10:00:00', 40, 'Botanic Garden', 'open');
  insertWalk.run(getDogId.get('Cake').dog_id, '2025-06-13 17:30:00', 30, 'City Park', 'cancelled');

  console.log('✅ Tables and data ready (SQLite)');
}

app.get('/api/dogs', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT d.dog_id, d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d JOIN Users u ON d.owner_id = u.user_id
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('/api/dogs error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/walkrequests/open', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location
      FROM WalkRequests wr JOIN Dogs d ON wr.dog_id = d.dog_id
      WHERE wr.status = 'open'
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('/api/walkrequests/open error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/walkers/summary', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT u.user_id, u.username,
        COUNT(DISTINCT wa.request_id) AS applications,
        COUNT(DISTINCT wr.request_id) AS accepted_walks
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id
      LEFT JOIN WalkRequests wr
        ON wa.request_id = wr.request_id AND wa.status = 'accepted'
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('/api/walkers/summary error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('✅ DogWalkService API running (SQLite)');
});

module.exports = { app, insertData };
