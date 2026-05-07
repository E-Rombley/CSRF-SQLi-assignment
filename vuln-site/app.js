const express = require('express')
const session = require('express-session')
const db = require('./database')

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.static('public'))
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  // No sameSite restriction — makes CSRF possible
  cookie: { sameSite: false, httpOnly: false }
}))

// ─── Pages ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.redirect('/login'))

app.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color:red">Invalid credentials</p>' : ''
  res.send(`<!DOCTYPE html>
<html>
<head><title>VulnBank – Login</title><style>
  body { font-family: sans-serif; max-width: 400px; margin: 80px auto; }
  input { display:block; width:100%; margin:8px 0; padding:8px; box-sizing:border-box; }
  button { padding:10px 20px; background:#1a73e8; color:#fff; border:none; cursor:pointer; width:100%; }
  .hint { font-size:0.8em; color:#888; margin-top:16px; }
</style></head>
<body>
  <h2>VulnBank Login</h2>
  ${error}
  <form method="POST" action="/login">
    <input name="username" placeholder="Username" />
    <input name="password" type="password" placeholder="Password" />
    <button type="submit">Log In</button>
  </form>
  <p class="hint">Try: alice / password123<br>
  SQLi hint: username = <code>' OR '1'='1' --</code></p>
</body>
</html>`)
})

// VULNERABLE: SQLi — input concatenated directly into query, no parameterization
app.post('/login', (req, res) => {
  const { username, password } = req.body
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`

  console.log('[SQLi query]', query)

  db.get(query, (err, user) => {
    if (err) {
      console.error('[SQL error]', err.message)
      return res.send(`<pre>SQL Error: ${err.message}</pre>`)
    }
    if (!user) return res.redirect('/login?error=1')
    req.session.userId = user.id
    req.session.username = user.username
    res.redirect('/dashboard')
  })
})

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login')

  db.get(`SELECT * FROM users WHERE id = ?`, [req.session.userId], (_err, user) => {
    db.all(`SELECT username FROM users WHERE id != ?`, [req.session.userId], (_err, others) => {
      db.all(`SELECT * FROM posts ORDER BY created_at DESC`, [], (_err, posts) => {
        const otherOptions = others.map(u => `<option value="${u.username}">${u.username}</option>`).join('')
        const postItems = posts.map(p =>
          `<div class="post"><strong>${p.username}</strong> <span class="ts">${p.created_at}</span><p>${p.content}</p></div>`
        ).join('') || '<p style="color:#aaa">No posts yet.</p>'

        res.send(`<!DOCTYPE html>
<html>
<head><title>VulnBank – Dashboard</title><style>
  body { font-family: sans-serif; max-width: 540px; margin: 60px auto; }
  .card { border:1px solid #ddd; padding:20px; border-radius:8px; margin:16px 0; }
  input, select, textarea { display:block; width:100%; margin:8px 0; padding:8px; box-sizing:border-box; }
  textarea { resize:vertical; height:80px; }
  button { padding:10px 20px; background:#1a73e8; color:#fff; border:none; cursor:pointer; }
  .balance { font-size:2em; font-weight:bold; color:#1a73e8; }
  .post { border-bottom:1px solid #eee; padding:10px 0; }
  .ts { font-size:0.8em; color:#aaa; margin-left:8px; }
  a { color:#888; font-size:0.9em; }
</style></head>
<body>
  <h2>Welcome, ${user.username}</h2>
  <div class="card">
    <p>Balance</p>
    <div class="balance">$${user.balance}</div>
  </div>

  <div class="card">
    <h3>Transfer Funds</h3>
    <!-- VULNERABLE: no CSRF token -->
    <form method="POST" action="/transfer">
      <label>To:</label>
      <select name="to">${otherOptions}</select>
      <label>Amount:</label>
      <input name="amount" type="number" min="1" value="100" />
      <button type="submit">Send</button>
    </form>
  </div>

  <div class="card">
    <h3>Post Something</h3>
    <form method="POST" action="/post">
      <textarea name="content" placeholder="What's on your mind?"></textarea>
      <button type="submit">Post</button>
    </form>
  </div>

  <div class="card">
    <h3>Feed</h3>
    ${postItems}
  </div>

  <a href="/logout">Log out</a>
</body>
</html>`)
      })
    })
  })
})

// VULNERABLE: CSRF — checks session cookie but never validates a CSRF token
app.post('/transfer', (req, res) => {
  if (!req.session.userId) return res.status(401).send('Not logged in')

  const { to, amount } = req.body
  const amt = parseInt(amount)

  console.log(`[transfer] ${req.session.username} -> ${to} : $${amt}`)

  db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amt, req.session.userId], () => {
    db.run(`UPDATE users SET balance = balance + ? WHERE username = ?`, [amt, to], () => {
      res.redirect('/dashboard')
    })
  })
})

app.post('/post', (req, res) => {
  if (!req.session.userId) return res.redirect('/login')
  const { content } = req.body
  db.run(
    `INSERT INTO posts (user_id, username, content) VALUES (?, ?, ?)`,
    [req.session.userId, req.session.username, content],
    () => res.redirect('/dashboard')
  )
})

app.get('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/login')
})

app.listen(3000, () => console.log('VulnBank running → http://localhost:3000'))
