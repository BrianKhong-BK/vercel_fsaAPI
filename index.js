let express = require("express");
let path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { Pool } = require("pg");
const { DATABASE_URL, SECRET_KEY } = process.env;

let app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function getPostgresVersion() {
  const client = await pool.connect();
  try {
    const response = await client.query("SELECT version()");
    console.log(response.rows[0]);
  } finally {
    client.release();
  }
}

getPostgresVersion();

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
    console.error("Error: ", error.message);
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
    console.error("Error: ", error.message);
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

    if (movie.rows.length < 1) {
      return res.status(400).json({ message: "No show found" });
    }

    const date = await client.query(
      "SELECT DISTINCT date FROM shows  WHERE movie_id = $1 ORDER BY date",
      [movieId]
    );

    const timeDate = await client.query(
      "SELECT s.date, t.time_slot FROM shows s JOIN times t ON s.time_id = t.id WHERE movie_id = $1 ORDER BY time_id",
      [movieId]
    );

    res.json({ movie: movie.rows, dates: date.rows, times: timeDate.rows });
  } catch (error) {
    console.error("Error: ", error.message);
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

    if (!user) {
      return res
        .status(400)
        .json({ message: "Username or password incorrect" });
    }

    if (password !== user.password) {
      return res
        .status(400)
        .json({ message: "Username or password incorrect" });
    }

    var token = jwt.sign(
      { id: user.id, username: user.user_name, email: user.email },
      SECRET_KEY
    );

    res
      .status(200)
      .json({ message: "Login successful", success: true, token: token });
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ message: error.message });
  } finally {
    client.release;
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

    if (userResult.rows.length > 0) {
      return res.status(409).json({ message: "Email already used" });
    }

    const phoneResult = await client.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [phonenumber]
    );

    if (phoneResult.rows.length > 0) {
      return res.status(409).json({ message: "Phone number already used" });
    }

    const signUp = await client.query(
      "INSERT INTO users (email, password, user_name, phone_number) VALUES ($1, $2, $3, $4)",
      [email, password, username, phonenumber]
    );
    res.status(200).json({ message: "Sign up successful", success: true });
  } catch (error) {
    console.error("Error: ", error.message);
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
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/bookings/:bookingId", async (req, res) => {
  const client = await pool.connect();
  const { bookingId } = req.params;
  try {
    const bookings = await client.query(
      "SELECT * FROM bookings WHERE id = $1",
      [bookingId]
    );
    res.json(bookings.rows);
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/bookings/user/:userId", async (req, res) => {
  const client = await pool.connect();
  const { userId } = req.params;
  try {
    const bookings = await client.query(
      "SELECT * FROM bookings WHERE user_id = $1 ORDER by date",
      [userId]
    );

    const movies = await client.query(
      "SELECT DISTINCT movies.id, movies.image, bookings.movie_name FROM bookings JOIN movies ON bookings.movie_name = movies.name WHERE bookings.user_id = $1",
      [userId]
    );

    res.json({
      bookings: bookings.rows,
      movies: movies.rows,
    });
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put("/bookings/:bookingId", async (req, res) => {
  const client = await pool.connect();
  const { bookingId } = req.params;
  try {
    const { email, seat, movieName, date, time, userId } = req.body;

    await client.query(
      "UPDATE bookings SET email = $1, seat = $2, movie_name = $3, date = $4, time = $5, user_id = $6 WHERE id = $7 RETURNING *",
      [email, seat, movieName, date, time, userId, bookingId]
    );
    res.json({ message: "Booking updated successfully" });
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete("/bookings/:bookingId", async (req, res) => {
  const client = await pool.connect();
  const { bookingId } = req.params;
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
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.listen(3000, () => {
  console.log("App is listening to port 3000");
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
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
