const express = require('express');
const  session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bycryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine','ejs');
app.set('view',path.join(__dirname, 'view'));
app.use(express.urlencode({ extended: true}));
app.use(session({
secret: 'mật_khẩu_bí_mật_web_truyện',
resave: false,
saveUninitialized: true
}));

const db = new sqlite3.Database('./database.db', (err) => {
if (err) console.error(err.message);
console.log('Đã kết nối CSDL SQLite thành công.');
});

db.serialize(() => {
db.run('CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE,
password TEXT,
role TEXT DEFAULT 'user
)');
db.run('CREAT TABLE IF NOT EXISTS stories (
id INTEGER PRIMARY KEY AUTOINCREMENT,
title TEXT,
description TEXT,
author_id INTEGER,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)');

db.run('CREAT TABLE IF NOT EXISTS chapters (
id INTEGER PRIMARY KEY AUTOINCREMENT,
story_id INTEGER,
chapter_number INTEGER,
title TEXT,
content TEXT
)');

const defaultAdminPass = bcrypt.hashSync('admin123', 10);
db.run('INSERT OR IGNORE INTO users (id, username, password, role) VALUE (1, 'admin', ?, 'admin')', [defaultAdminPass]);
});

app.use((req, res, next) => {
res.locals.user = req.session.user || null;
next();
});

app.get('/', (req, res) => {
  db.all(`SELECT stories.*, users.username as author_name FROM stories JOIN users ON stories.author_id = users.id`, [], (err, stories) => {
    res.render('index', { stories: stories || [] });
  });
});

// Chi tiết truyện & Danh sách chương
app.get('/story/:id', (req, res) => {
  const storyId = req.params.id;
  db.get(`SELECT stories.*, users.username as author_name FROM stories JOIN users ON stories.author_id = users.id WHERE stories.id = ?`, [storyId], (err, story) => {
    if (!story) return res.send('Không tìm thấy truyện!');
    db.all(`SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC`, [storyId], (err, chapters) => {
      res.render('story', { story, chapters: chapters || [] });
    });
  });
});

// Trang đọc chương truyện
app.get('/chapter/:id', (req, res) => {
  db.get(`SELECT * FROM chapters WHERE id = ?`, [req.params.id], (err, chapter) => {
    if (!chapter) return res.send('Không tìm thấy chương!');
    res.render('read', { chapter });
  });
});

// --- ROUTE ĐĂNG KÝ / ĐĂNG NHẬP / ĐĂNG XUẤT ---

app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  const hashPass = bcrypt.hashSync(password, 10);
  const userRole = (role === 'author') ? 'author' : 'user';

  db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, hashPass, userRole], (err) => {
    if (err) return res.send('Tên đăng nhập đã tồn tại!');
    res.redirect('/login');
  });
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.redirect('/');
    } else {
      res.send('Sai tài khoản hoặc mật khẩu!');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// --- ROUTE TÁC GIẢ (AUTHOR) ---

app.get('/author', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối! Bạn cần tài khoản Tác giả.');
  }
  db.all(`SELECT * FROM stories WHERE author_id = ?`, [req.session.user.id], (err, stories) => {
    res.render('author', { stories: stories || [] });
  });
});

app.post('/author/add-story', (req, res) => {
  const { title, description } = req.body;
  db.run(`INSERT INTO stories (title, description, author_id) VALUES (?, ?, ?)`, [title, description, req.session.user.id], function(err) {
    res.redirect('/author');
  });
});

app.post('/author/add-chapter', (req, res) => {
  const { story_id, chapter_number, title, content } = req.body;
  db.run(`INSERT INTO chapters (story_id, chapter_number, title, content) VALUES (?, ?, ?, ?)`, [story_id, chapter_number, title, content], (err) => {
    res.redirect('/story/' + story_id);
  });
});

// --- ROUTE ADMIN ---

app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Chỉ Quản trị viên (Admin) mới có quyền truy cập!');
  }
  db.all(`SELECT * FROM users`, [], (err, users) => {
    db.all(`SELECT stories.*, users.username as author_name FROM stories JOIN users ON stories.author_id = users.id`, [], (err, stories) => {
      res.render('admin', { users: users || [], stories: stories || [] });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server web đọc truyện đang chạy tại port ${PORT}`);
});