const express  = require('express')
const session  = require('express-session')
const db       = require('./database')
const fs       = require('fs')
const path     = require('path')
const { exec } = require('child_process')
const http     = require('http')
const https    = require('https')

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.static('public'))
app.use(session({
  secret: 'relay_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: false, httpOnly: false }
}))

// ── shared layout ─────────────────────────────────────────────────────────────

function page(title, body, req) {
  const u = req.session.username
  const nav = u
    ? `<a href="/feed">Feed</a><a href="/users">Users</a><a href="/tools">Tools</a><a href="/docs">Docs</a><a href="/account">${u}</a><a href="/logout">Log out</a>`
    : `<a href="/feed">Feed</a><a href="/users">Users</a><a href="/login">Log in</a>`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} · Relay</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:15px/1.6 system-ui,sans-serif;background:#f1f5f9;color:#1e293b}
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 28px;display:flex;align-items:center;height:54px;gap:20px}
.logo{font-weight:700;color:#2563eb;font-size:1.05em;margin-right:auto;text-decoration:none}
nav a{color:#64748b;text-decoration:none;font-size:.9em}
nav a:hover{color:#2563eb}
.wrap{max-width:760px;margin:36px auto;padding:0 20px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:22px;margin-bottom:16px}
h1{font-size:1.15em;font-weight:600;margin-bottom:16px}
h2{font-size:.95em;font-weight:600;margin-bottom:12px;color:#475569}
label{font-size:.85em;color:#64748b}
input,textarea,select{display:block;width:100%;padding:8px 11px;border:1px solid #cbd5e1;border-radius:6px;font:14px system-ui;margin:4px 0 12px;background:#f8fafc;color:#1e293b}
input:focus,textarea:focus{outline:none;border-color:#2563eb;background:#fff}
textarea{resize:vertical;height:72px}
button{background:#2563eb;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font:14px system-ui}
button:hover{background:#1d4ed8}
.btn-sm{padding:5px 12px;font-size:.82em}
pre{font-family:monospace;white-space:pre-wrap;word-break:break-all;background:#f8fafc;padding:13px;border-radius:6px;border:1px solid #e2e8f0;font-size:.83em;margin-top:10px;color:#334155}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:.78em;color:#94a3b8;padding:7px 8px;border-bottom:1px solid #e2e8f0}
td{padding:8px;border-bottom:1px solid #f1f5f9;font-size:.88em;font-family:monospace}
.muted{color:#94a3b8;font-size:.82em}
.badge{display:inline-block;padding:2px 9px;border-radius:12px;font-size:.75em;background:#eff6ff;color:#2563eb}
.ok{color:#16a34a}.err{color:#dc2626}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
.row{display:flex;gap:16px;flex-wrap:wrap}
.row .card{flex:1;min-width:220px}
.amount{font-size:2em;font-weight:700;color:#2563eb}
.entry{padding:12px 0;border-bottom:1px solid #f1f5f9}
.entry:last-child{border-bottom:none}
.dbg{margin-top:8px;color:#94a3b8;font-size:.78em;font-family:monospace}
</style></head>
<body>
<nav><a class="logo" href="/">Relay</a>${nav}</nav>
<div class="wrap">${body}</div>
</body></html>`
}

// ── / ────────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.redirect(req.session.userId ? '/feed' : '/login'))

// ── login ─────────────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/feed')
  const err = req.query.error ? '<p class="err" style="margin-bottom:12px">Invalid credentials.</p>' : ''
  res.send(page('Log in', `
<div class="card" style="max-width:380px;margin:0 auto">
  <h1>Log in to Relay</h1>
  ${err}
  <form method="POST">
    <label>Username</label><input name="username" autocomplete="username" />
    <label>Password</label><input name="password" type="password" autocomplete="current-password" />
    <button style="width:100%">Log in</button>
  </form>
</div>`, req))
})

app.post('/login', (req, res) => {
  const { username, password } = req.body
  const q = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`
  db.get(q, (err, user) => {
    if (err || !user) return res.redirect('/login?error=1')
    req.session.userId   = user.id
    req.session.username = user.username
    res.redirect('/feed')
  })
})

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login') })

// ── feed (stored XSS) ─────────────────────────────────────────────────────────

app.get('/feed', (req, res) => {
  db.all(`SELECT * FROM posts ORDER BY created_at DESC LIMIT 30`, [], (_e, rows) => {
    const posts = (rows || []).map(r => `
<div class="entry">
  <span style="font-weight:600">${r.username}</span>
  <span class="muted" style="margin-left:8px">${r.created_at}</span>
  <p style="margin-top:4px">${r.content}</p>
</div>`).join('') || '<p class="muted">Nothing here yet.</p>'

    const form = req.session.userId ? `
<div class="card">
  <form method="POST">
    <textarea name="content" placeholder="What's on your mind?"></textarea>
    <button class="btn-sm">Post</button>
  </form>
</div>` : `<p class="muted" style="margin-bottom:16px"><a href="/login">Log in</a> to post.</p>`

    res.send(page('Feed', `${form}<div class="card"><h1>Feed</h1>${posts}</div>`, req))
  })
})

app.post('/feed', (req, res) => {
  if (!req.session.userId) return res.redirect('/login')
  db.run(`INSERT INTO posts (username, content) VALUES (?,?)`,
    [req.session.username, req.body.content], () => res.redirect('/feed'))
})

// ── search (reflected XSS) ────────────────────────────────────────────────────

app.get('/search', (req, res) => {
  const q = req.query.q !== undefined ? req.query.q : ''
  const result = q !== ''
    ? `<div class="card"><p>Showing results for: <strong>${q}</strong></p></div>`
    : ''
  res.send(page('Search', `
<div class="card">
  <h1>Search</h1>
  <form method="GET">
    <input name="q" value="${q}" placeholder="Search users, posts…" style="width:calc(100% - 120px);display:inline-block;margin-bottom:0" />
    <button style="margin-left:8px">Search</button>
  </form>
</div>
${result}`, req))
})

// ── users (SQLi + blind SQLi) ─────────────────────────────────────────────────

app.get('/users', (req, res) => {
  const id = req.query.id !== undefined ? req.query.id : null

  if (id === null) return res.send(page('Users', usersPage(null, null, null), req))

  const q = `SELECT id, first_name, last_name, username, password FROM users WHERE id = '${id}'`
  db.all(q, (err, rows) => {
    res.send(page('Users', usersPage(id, q, err ? { error: err.message } : rows), req))
  })
})

// username availability — blind: only returns yes/no
app.get('/users/check', (req, res) => {
  const username = req.query.username || ''
  const q = `SELECT id FROM users WHERE username = '${username}'`
  db.get(q, (err, row) => {
    const available = !err && !row
    res.json({ available, message: available ? 'Username is available.' : 'Username is taken.' })
  })
})

function usersPage(id, q, result) {
  let resultHtml = ''
  if (result) {
    if (result.error) {
      resultHtml = `<pre class="err">${esc(result.error)}</pre>`
    } else if (!result.length) {
      resultHtml = `<p class="muted" style="margin-top:10px">No user found.</p>`
    } else {
      const rows = result.map(r =>
        `<tr><td>${r.id}</td><td>${r.first_name} ${r.last_name}</td><td>${r.username}</td><td>${r.password}</td></tr>`
      ).join('')
      resultHtml = `<table style="margin-top:12px">
        <tr><th>ID</th><th>Name</th><th>Username</th><th>Password</th></tr>${rows}</table>`
    }
    resultHtml += `<p class="dbg">query: ${esc(q)}</p>`
  }

  return `
<div class="card">
  <h1>Users</h1>
  <h2>Look up by ID</h2>
  <form method="GET" style="display:flex;gap:8px;align-items:flex-end">
    <div style="flex:1"><input name="id" value="${esc(id||'')}" placeholder="e.g. 1" style="margin:0" /></div>
    <button class="btn-sm" style="margin-bottom:0">Go</button>
  </form>
  ${resultHtml}
</div>
<div class="card">
  <h2>Check username availability</h2>
  <div style="display:flex;gap:8px;align-items:center">
    <input id="un" placeholder="Username" style="margin:0;flex:1" />
    <button class="btn-sm" onclick="checkUser()">Check</button>
  </div>
  <p id="un-result" class="muted" style="margin-top:8px"></p>
</div>
<script>
async function checkUser() {
  const u = document.getElementById('un').value
  const r = await fetch('/users/check?username=' + encodeURIComponent(u))
  const d = await r.json()
  const el = document.getElementById('un-result')
  el.textContent = d.message
  el.className = d.available ? 'ok' : 'err'
}
</script>`
}

// ── tools (command injection) ─────────────────────────────────────────────────

app.get('/tools', (req, res) => {
  res.send(page('Tools', `
<div class="card">
  <h1>Network Tools</h1>
  <h2>Ping</h2>
  <form method="POST" action="/tools/ping" style="display:flex;gap:8px;align-items:flex-end">
    <div style="flex:1"><input name="host" placeholder="Hostname or IP" style="margin:0" /></div>
    <button class="btn-sm">Run</button>
  </form>
</div>`, req))
})

app.post('/tools/ping', (req, res) => {
  const host = req.body.host || ''
  exec(`ping -c 2 ${host}`, { timeout: 6000 }, (err, stdout, stderr) => {
    const out = (stdout + stderr + (err && !stdout ? err.message : '')).trim()
    res.send(page('Tools', `
<div class="card">
  <h1>Network Tools</h1>
  <h2>Ping</h2>
  <form method="POST" action="/tools/ping" style="display:flex;gap:8px;align-items:flex-end">
    <div style="flex:1"><input name="host" value="${esc(host)}" style="margin:0" /></div>
    <button class="btn-sm">Run</button>
  </form>
  <pre>${esc(out)}</pre>
  <p class="dbg">exec: ping -c 2 ${esc(host)}</p>
</div>`, req))
  })
})

// ── docs (path traversal + LFI/RFI) ──────────────────────────────────────────

app.get('/docs', (req, res) => {
  const file = req.query.file
  const src  = req.query.src

  // LFI / RFI via ?src=
  if (src !== undefined) {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const mod = src.startsWith('https') ? https : http
      const r2  = mod.get(src, (r) => {
        let data = ''
        r.on('data', c => { data += c })
        r.on('end', () => res.send(page('Docs', docsPage('', src, data), req)))
      })
      r2.on('error', e => res.send(page('Docs', docsPage('', src, `Error: ${e.message}`), req)))
      r2.setTimeout(5000, () => { r2.destroy() })
      return
    }
    const fp = path.join(__dirname, 'pages', src)
    return fs.readFile(fp, 'utf8', (err, data) =>
      res.send(page('Docs', docsPage('', src, err ? `Cannot read: ${err.message}` : data), req)))
  }

  // Path traversal via ?file=
  if (file !== undefined) {
    const fp = path.join(__dirname, 'files', file)
    return fs.readFile(fp, 'utf8', (err, data) =>
      res.send(page('Docs', docsPage(file, '', err ? `Cannot read: ${err.message}` : data), req)))
  }

  res.send(page('Docs', docsPage('', '', null), req))
})

function docsPage(file, src, content) {
  const out = content !== null
    ? `<pre>${esc(content)}</pre><p class="dbg">path: ${esc(file || src)}</p>`
    : ''
  return `
<div class="card">
  <h1>Docs</h1>
  <h2>View file</h2>
  <p class="muted" style="margin-bottom:10px">
    Shared files: <a href="/docs?file=welcome.txt">welcome.txt</a> &nbsp; <a href="/docs?file=report.txt">report.txt</a>
  </p>
  <form method="GET" style="display:flex;gap:8px;align-items:flex-end">
    <div style="flex:1"><input name="file" value="${esc(file)}" placeholder="filename" style="margin:0" /></div>
    <button class="btn-sm">Open</button>
  </form>
</div>
<div class="card">
  <h2>Include page or URL</h2>
  <p class="muted" style="margin-bottom:10px">
    Templates: <a href="/docs?src=home.html">home.html</a> &nbsp; <a href="/docs?src=about.html">about.html</a>
  </p>
  <form method="GET" style="display:flex;gap:8px;align-items:flex-end">
    <div style="flex:1"><input name="src" value="${esc(src)}" placeholder="template or http://…" style="margin:0" /></div>
    <button class="btn-sm">Load</button>
  </form>
  ${out}
</div>`
}

// ── account + transfer (CSRF) ─────────────────────────────────────────────────

app.get('/account', (req, res) => {
  if (!req.session.userId) return res.redirect('/login')
  db.get(`SELECT * FROM users WHERE id = ?`, [req.session.userId], (_e, user) => {
    db.all(`SELECT username FROM users WHERE id != ?`, [req.session.userId], (_e, others) => {
      const opts = (others || []).map(u => `<option value="${u.username}">${u.username}</option>`).join('')
      res.send(page('Account', `
<div class="row">
  <div class="card">
    <h2>Balance</h2>
    <div class="amount">$${user.balance}</div>
  </div>
  <div class="card">
    <h2>Send money</h2>
    <form method="POST" action="/transfer">
      <label>To</label><select name="to">${opts}</select>
      <label>Amount</label><input name="amount" type="number" value="100" min="1" />
      <button class="btn-sm">Send</button>
    </form>
  </div>
</div>`, req))
    })
  })
})

app.post('/transfer', (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized')
  const { to, amount } = req.body
  const amt = parseInt(amount) || 0
  db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`,   [amt, req.session.userId], () => {
  db.run(`UPDATE users SET balance = balance + ? WHERE username = ?`, [amt, to], () => {
    res.redirect('/account')
  })})
})

// ── helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

app.listen(3000, () => console.log('Relay -> http://localhost:3000'))
