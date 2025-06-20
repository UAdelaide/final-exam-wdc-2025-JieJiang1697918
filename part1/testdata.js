const pool = require('./db');

async function testdata() {
  const connection = await pool.getConnection();
  try {
    // Clear existing data for idempotency
    await connection.query('DELETE FROM WalkRatings');
    await connection.query('DELETE FROM WalkApplications');
    await connection.query('DELETE FROM WalkRequests');
    await connection.query('DELETE FROM Dogs');
    await connection.query('DELETE FROM Users');

    // Insert users
    await connection.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('davidwalker', 'david@example.com', 'hashdavid', 'walker'),
        ('emilyowner', 'emily@example.com', 'hashemily', 'owner')
    `);

    // Insert dogs
    await connection.query(`
      INSERT INTO Dogs (owner_id, name, size)
      VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Rocky', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'emilyowner'), 'Milo', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Daisy', 'medium')
    `);

    // Insert walk requests
    await connection.query(`
      INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'), '2025-06-11 07:15:00', 60, 'Lakeside Trail', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Milo'), '2025-06-12 10:00:00', 40, 'Botanic Garden', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Daisy'), '2025-06-13 17:30:00', 20, 'City Park', 'cancelled')
    `);
  } catch (err) {
    console.error('Error inserting sample data:', err);
  } finally {
    connection.release();
  }
}

module.exports = insertSampleData;