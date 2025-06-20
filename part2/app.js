const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('morgan');
const session = require('express-session');

const app = express();

// Middleware
app.use(express.json());
app.use(logger('dev'));
app.use(cookieParser());

app.use(session({
  secret: 'dogwalk-2025-exam',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, '/public')));

let db;

(async () => {
  try {
    console.log('Connecting to MySQL server...');
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'root',
      password: ''
    });

    console.log('Connected to MySQL.');

    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    console.log('Database "DogWalkService" ready.');

    await connection.end();

    db = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    console.log('Connected to database "DogWalkService".');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        CONSTRAINT unique_application UNIQUE (request_id, walker_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
      )
    `);

    await db.execute('SET FOREIGN_KEY_CHECKS = 0');
    await db.execute('TRUNCATE TABLE WalkRatings');
    await db.execute('TRUNCATE TABLE WalkApplications');
    await db.execute('TRUNCATE TABLE WalkRequests');
    await db.execute('TRUNCATE TABLE Dogs');
    await db.execute('TRUNCATE TABLE Users');
    await db.execute('SET FOREIGN_KEY_CHECKS = 1');

    await db.execute(`
      INSERT IGNORE INTO Users (username, email, password_hash, role)
      VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('stevewalker', 'steve@example.com', 'hashed147', 'walker'),
      ('jimmy123', 'jimmy@example.com', 'hashed369', 'owner')
    `);

    await db.execute(`
      INSERT IGNORE INTO Dogs (owner_id, name, size)
      VALUES
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
      ((SELECT user_id FROM Users WHERE username = 'jimmy123'), 'Apple', 'large'),
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Banana', 'small'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cake', 'medium')
    `);

    await db.execute(`
      INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
      ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Apple'), '2025-06-11 08:00:00', 60, 'Lakeside Trail', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Banana'), '2025-06-12 10:00:00', 40, 'Botanic Garden', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Cake'), '2025-06-13 17:30:00', 30, 'City Park', 'cancelled')
    `);

  } catch (err) {
    console.error('Error setting up database.', err);
  }
})();

// Routes

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT user_id, role FROM Users WHERE username = ? AND password_hash = ?',
      [username, password]
    );

    if (rows.length === 1) {
      req.session.user = {
        user_id: rows[0].user_id,
        role: rows[0].role,
        username: username
      };

      res.json({ message: 'Login successful', role: rows[0].role });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(`err` => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/users/mydogs', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'owner') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT dog_id, name, size FROM Dogs WHERE owner_id = ?',
      [req.session.user.user_id]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error loading dogs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/walks', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'owner') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const [rows] = await db.execute(`
      SELECT wr.request_id, d.name AS dog_name, d.size, wr.requested_time, wr.duration_minutes, wr.location, wr.status
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      WHERE d.owner_id = ?
      ORDER BY wr.requested_time DESC
    `, [req.session.user.user_id]);

    res.json(rows);
  } catch (err) {
    console.error('Error loading walks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/me', (req, res) => {
  if (!req.session.user) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json({
    user_id: req.session.user.user_id,
    role: req.session.user.role,
    username: req.session.user.username
  });
});

app.get('/api/walks/open', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'walker') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const [rows] = await db.execute(`
      SELECT wr.request_id, d.name AS dog_name, d.size, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_name
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
      ORDER BY wr.requested_time ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error loading open walks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dogs', async (req, res) => {
  try {
    const [dogs] = await db.execute(`
      SELECT Dogs.dog_id, Dogs.name, Dogs.size, Users.username AS owner
      FROM Dogs
      JOIN Users ON Dogs.owner_id = Users.user_id
    `);
    res.json(dogs);
  } catch (err) {
    console.error('Failed to fetch dogs:', err);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Export the app instead of listening here
module.exports = app;
