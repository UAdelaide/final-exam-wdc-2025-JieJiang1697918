const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

// 第一步：创建数据库（如果不存在）
async function createDatabase() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',      // 修改成你的用户名
    password: ''       // 修改成你的密码
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS DogWalkService`);
  console.log('✅ Database DogWalkService ensured.');
  await connection.end();
}

// 第二步：创建连接池
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'DogWalkService',
  waitForConnections: true,
  connectionLimit: 10
});

// 第三步：插入测试数据
async function insertData() {
  const conn = await pool.getConnection();
  try {
    // 创建表（如果不存在）—— 你也可以提前用 schema.sql 手动执行
    await conn.query(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `);

    await conn.query(`
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

    await conn.query(`
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

    await conn.query(`
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

    // 清空数据
    await conn.query('DELETE FROM WalkRatings');
    await conn.query('DELETE FROM WalkApplications');
    await conn.query('DELETE FROM WalkRequests');
    await conn.query('DELETE FROM Dogs');
    await conn.query('DELETE FROM Users');

    // 插入数据
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

    console.log('✅ Tables created and sample data inserted.');
  } catch (err) {
    console.error('❌ Error inserting data:', err.message);
  } finally {
    conn.release();
  }
}

// API 路由
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.dog_id, d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('✅ DogWalkService API running.');
});

module.exports = { app, createDatabase, insertData };