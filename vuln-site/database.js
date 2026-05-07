const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('database.db')

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance INTEGER DEFAULT 500
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Seed two accounts
  db.run(`INSERT OR IGNORE INTO users (username, password, balance) VALUES ('alice', 'password123', 1000)`)
  db.run(`INSERT OR IGNORE INTO users (username, password, balance) VALUES ('attacker', 'hacked', 0)`)
})

module.exports = db
