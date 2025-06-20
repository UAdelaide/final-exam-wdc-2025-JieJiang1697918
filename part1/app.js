const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'DogWalkService',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json());

async function insertData() {
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM WalkRatings');
    await conn.query('DELETE FROM WalkApplications');
    await conn.query('DELETE FROM WalkRequests');
    await conn.query('DELETE FROM Dogs');
    await conn.query('DELETE FROM Users');

    await conn.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('stevewalker', 'steve@example.com', 'hashed147', 'walker'),
        ('jimmy123', 'jimmy@example.com', 'hashed369', 'owner')
    `);

    await conn.query(`
      INSERT INTO Dogs (owner_id, name, size)
      VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'jimmy123'), 'Apple', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Banana', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cake', 'medium')
    `);

    await conn.query(`
      INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Apple'), '2025-06-11 08:00:00', 60, 'Lakeside Trail', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Banana'), '2025-06-12 10:00:00', 40, 'Botanic Garden', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Cake'), '2025-06-13 17:30:00', 30, 'City Park', 'cancelled')
    `);

    console.log('Sample data inserted.');
  } catch (err) {
    console.error('Error inserting data:', err);
  } finally {
    conn.release();
  }
}

app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.dog_id, d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      WHERE wr.status = 'open'
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.user_id,
        u.username,
        COUNT(DISTINCT wa.request_id) AS applications,
        COUNT(DISTINCT wr.request_id) AS accepted_walks
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id
      LEFT JOIN WalkRequests wr
        ON wa.request_id = wr.request_id AND wa.status = 'accepted'
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, async () => {
  console.log(` Server running at http://localhost:${PORT}`);
  await insertData();
});