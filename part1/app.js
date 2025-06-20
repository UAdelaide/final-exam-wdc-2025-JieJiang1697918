const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mysql = require('mysql2/promise');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

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

    console.log('All tables created and data inserted.');

  } catch (err) {
    console.error('Error setting up database. Make sure MySQL is running!\n👉 Run: sudo service mysql start\n', err);
  }
})();

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

app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [requests] = await db.execute(`
      SELECT WalkRequests.request_id, Dogs.name AS dog_name, requested_time, duration_minutes, location, status
      FROM WalkRequests
      JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id
      WHERE WalkRequests.status = 'open'
    `);
    res.json(requests);
  } catch (err) {
    console.error('Failed to fetch walk requests:', err);
    res.status(500).json({ error: 'Failed to fetch walk requests' });
  }
});

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [summary] = await db.execute(`
      SELECT
        u.user_id AS walker_id,
        u.username AS walker_name,
        COUNT(DISTINCT a.application_id) AS total_applications,
        SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) AS accepted_applications,
        ROUND(AVG(r.rating), 2) AS average_rating
      FROM Users u
      LEFT JOIN WalkApplications a ON u.user_id = a.walker_id
      LEFT JOIN WalkRatings r ON u.user_id = r.walker_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
    `);

    res.json(summary);
  } catch (err) {
    console.error('Failed to fetch walkers summary:', err);
    res.status(500).json({ error: 'Failed to fetch walkers summary' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
