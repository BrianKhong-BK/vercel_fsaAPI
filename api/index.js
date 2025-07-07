// api/index.js
const express = require("express");
const serverless = require("serverless-http");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { Pool } = require("pg");
const app = express();
app.use(cors());
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL;
const SECRET_KEY = process.env.SECRET_KEY;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.get("/test", async (req, res) => {
  const client = await pool.connect();
  try {
    const response = await client.query("SELECT version()");
    res.status(200).json({ message: "Connected successfully" });
  } finally {
    client.release();
  }
});

app.get("/movies", async (req, res) => {
  const client = await pool.connect();
  try {
    const movies = await client.query("SELECT * FROM movies");
    res.json(movies.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/movie", async (req, res) => {
  const { movieId } = req.body;
  const client = await pool.connect();
  try {
    const movies = await client.query("SELECT * FROM movies WHERE id = $1", [
      movieId,
    ]);
    res.json(movies.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/shows/:movieId", async (req, res) => {
  const { movieId } = req.params;
  const client = await pool.connect();
  try {
    const movie = await client.query(
      "SELECT DISTINCT m.name, m.image FROM movies m JOIN shows s ON m.id = s.movie_id WHERE movie_id = $1",
      [movieId]
    );
    if (movie.rows.length < 1)
      return res.status(400).json({ message: "No show found" });

    const date = await client.query(
      "SELECT DISTINCT date FROM shows WHERE movie_id = $1 ORDER BY date",
      [movieId]
    );
    const timeDate = await client.query(
      "SELECT s.date, t.time_slot FROM shows s JOIN times t ON s.time_id = t.id WHERE movie_id = $1 ORDER BY time_id",
      [movieId]
    );

    res.json({ movie: movie.rows, dates: date.rows, times: timeDate.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user || password !== user.password) {
      return res
        .status(400)
        .json({ message: "Username or password incorrect" });
    }
    const token = jwt.sign(
      { id: user.id, username: user.user_name, email: user.email },
      SECRET_KEY
    );
    res.status(200).json({ message: "Login successful", success: true, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

app.post("/signup", async (req, res) => {
  const { email, password, username, phonenumber } = req.body;
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (userResult.rows.length > 0)
      return res.status(409).json({ message: "Email already used" });

    const phoneResult = await client.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [phonenumber]
    );
    if (phoneResult.rows.length > 0)
      return res.status(409).json({ message: "Phone number already used" });

    await client.query(
      "INSERT INTO users (email, password, user_name, phone_number) VALUES ($1, $2, $3, $4)",
      [email, password, username, phonenumber]
    );
    res.status(200).json({ message: "Sign up successful", success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/bookings", async (req, res) => {
  const { email, seat, movieName, date, time, userId } = req.body;
  const client = await pool.connect();
  try {
    const post = await client.query(
      "INSERT INTO bookings (email, seat, movie_name, date, time, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [email, seat, movieName, date, time, userId]
    );
    res.json(post.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/bookings/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const client = await pool.connect();
  try {
    const bookings = await client.query(
      "SELECT * FROM bookings WHERE id = $1",
      [bookingId]
    );
    res.json(bookings.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/bookings/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const client = await pool.connect();
  try {
    const bookings = await client.query(
      "SELECT * FROM bookings WHERE user_id = $1 ORDER BY date",
      [userId]
    );
    const movies = await client.query(
      "SELECT DISTINCT movies.id, movies.image, bookings.movie_name FROM bookings JOIN movies ON bookings.movie_name = movies.name WHERE bookings.user_id = $1",
      [userId]
    );
    res.json({ bookings: bookings.rows, movies: movies.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put("/bookings/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const { email, seat, movieName, date, time, userId } = req.body;
  const client = await pool.connect();
  try {
    await client.query(
      "UPDATE bookings SET email = $1, seat = $2, movie_name = $3, date = $4, time = $5, user_id = $6 WHERE id = $7",
      [email, seat, movieName, date, time, userId, bookingId]
    );
    res.json({ message: "Booking updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete("/bookings/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const client = await pool.connect();
  try {
    const getBooking = await client.query(
      "SELECT FROM bookings WHERE id = $1",
      [bookingId]
    );
    if (getBooking.rowCount > 0) {
      await client.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
      res.json({ message: "Booking deleted successfully" });
    } else {
      res.status(404).json({ error: "No booking found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/bookseats", async (req, res) => {
  const { movieName, date, time } = req.body;
  const client = await pool.connect();
  try {
    const bookSeats = await client.query(
      "SELECT seat, date, time FROM bookings WHERE movie_name = $1 AND date = $2 AND time = $3",
      [movieName, date, time]
    );
    res.json(bookSeats.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = app;
module.exports.handler = serverless(app);
