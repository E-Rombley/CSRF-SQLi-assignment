const sqlite3 = require('sqlite3').verbose()
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const dbPath = path.join(__dirname, 'database.db')
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

const db = new sqlite3.Database(dbPath)

function md5(s) { return crypto.createHash('md5').update(s).digest('hex') }

db.serialize(() => {
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    balance INTEGER DEFAULT 500
  )`)

  db.run(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE guestbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // 5 DVWA-style users (IDs 1-5) — passwords stored as MD5 hashes
  const users = [
    ['admin',  'Admin',   'admin',   md5('password'),    2000],
    ['Gordon', 'Brown',   'gordonb', md5('abc123'),       500],
    ['Hack',   '1337',    '1337',    md5('charley'),      500],
    ['Pablo',  'Picasso', 'pablo',   md5('letmein'),      500],
    ['Bob',    'Smith',   'smithy',  md5('password'),     750],
    // Extra accounts used by CSRF demo (IDs 6 & 7)
    ['Alice',  'Liddell', 'alice',   md5('password123'), 1000],
    ['Eve',    'Hacker',  'attacker',md5('hacked'),         0],
  ]

  const stmt = db.prepare(`INSERT INTO users (first_name, last_name, username, password, balance) VALUES (?,?,?,?,?)`)
  users.forEach(u => stmt.run(u))
  stmt.finalize()
})

module.exports = db
