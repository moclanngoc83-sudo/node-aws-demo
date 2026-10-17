const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

// Cấu hình View Engine & Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'mật_khẩu_bí_mật_web_truyện',
  resave: false,
  saveUninitialized: true
}));

// Khởi tạo CSDL SQLite
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error(err.message);
  console.log('Đã kết nối CSDL SQLite thành công.');
});

// Tạo các Bảng dữ liệu tự động
db.serialize(() => {
  // Bảng Users (vai trò: 'user', 'author', 'admin')
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )`);

  // Bảng Stories (Truyện)
  db.run(`CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    category TEXT DEFAULT 'Khác',
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE stories ADD COLUMN category TEXT DEFAULT 'Khác'`, (err) => {
  });

  // Bảng Chapters (Chương)
  db.run(`CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER,
    chapter_number INTEGER,
    title TEXT,
    content TEXT
  )`);

  // Tạo tài khoản Admin mặc định (admin / admin123)
  const defaultAdminPass = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'admin')`, [defaultAdminPass]);
});

// Middleware truyền thông tin người dùng vào giao diện
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// --- ROUTE TRANG CHỦ & ĐỌC TRUYỆN ---

// Trang chủ danh sách truyện
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
  const currentChapterId = parseInt(req.params.id);
  db.get(`SELECT * FROM chapters WHERE id = ?`, [currentChapterId], (err, chapter) => {
    if (!chapter) return res.send('Không tìm thấy chương!');
    db.get(
          `SELECT id FROM chapters WHERE story_id = ? AND chapter_number < ? ORDER BY chapter_number DESC LIMIT 1`,
          [chapter.story_id, chapter.chapter_number],
          (err, prevChapter) => {
            db.get(
                      `SELECT id FROM chapters WHERE story_id = ? AND chapter_number > ? ORDER BY chapter_number ASC LIMIT 1`,
                      [chapter.story_id, chapter.chapter_number],
                      (err, nextChapter) => {
                        res.render('read', {
                            chapter,
                                          prevChapterId: prevChapter ? prevChapter.id : null,
                                          nextChapterId: nextChapter ? nextChapter.id : null
                            });
                        }
                      );
            }
          );
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
// ==========================================
// THƯ MỤC ROUTE TÁC GIẢ (AUTHOR & ADMIN)
// ==========================================

// 1. Trang quản lý tác giả (Xem danh sách truyện đã đăng)
app.get('/author', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối! Bạn cần tài khoản Tác giả.');
  }

  db.all(`SELECT * FROM stories WHERE author_id = ?`, [req.session.user.id], (err, stories) => {
    res.render('author', { stories: stories || [] });
  });
});

// 2. Đăng bài truyện mới (Đã bao gồm Thể loại)
app.post('/author/add-story', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const { title, description, category } = req.body;
  db.run(
    `INSERT INTO stories (title, description, category, author_id) VALUES (?, ?, ?, ?)`,
    [title, description, category || 'Khác', req.session.user.id],
    function (err) {
      if (err) return res.send('Lỗi khi thêm truyện mới!');
      res.redirect('/author');
    }
  );
});

// 3. Thêm chương truyện mới
app.post('/author/add-chapter', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const { story_id, chapter_number, title, content } = req.body;
  db.run(
    `INSERT INTO chapters (story_id, chapter_number, title, content) VALUES (?, ?, ?, ?)`,
    [story_id, chapter_number, title, content],
    (err) => {
      if (err) return res.send('Lỗi khi thêm chương mới!');
      res.redirect('/story/' + story_id);
    }
  );
});

// 4. Trang hiển thị Form sửa chương
app.get('/author/edit-chapter/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const chapterId = req.params.id;
  db.get(`SELECT * FROM chapters WHERE id = ?`, [chapterId], (err, chapter) => {
    if (!chapter) return res.send('Không tìm thấy chương!');
    res.render('edit-chapter', { chapter });
  });
});

// 5. Lưu thông tin chương sau khi sửa
app.post('/author/edit-chapter/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const chapterId = req.params.id;
  const { chapter_number, title, content } = req.body;

  db.run(
    `UPDATE chapters SET chapter_number = ?, title = ?, content = ? WHERE id = ?`,
    [chapter_number, title, content, chapterId],
    (err) => {
      if (err) return res.send('Lỗi khi cập nhật chương!');
      res.redirect('/chapter/' + chapterId);
    }
  );
});

// 6. Trang hiển thị Form sửa tên/mô tả/thể loại bộ truyện
app.get('/author/edit-story/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const storyId = req.params.id;
  db.get(`SELECT * FROM stories WHERE id = ?`, [storyId], (err, story) => {
    if (!story) return res.send('Không tìm thấy truyện!');
    res.render('edit-story', { story });
  });
});

// 7. Lưu thông tin bộ truyện sau khi sửa
app.post('/author/edit-story/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const storyId = req.params.id;
  const { title, category, description } = req.body;

  db.run(
    `UPDATE stories SET title = ?, category = ?, description = ? WHERE id = ?`,
    [title, category, description, storyId],
    (err) => {
      if (err) return res.send('Lỗi khi cập nhật thông tin truyện!');
      res.redirect('/story/' + storyId);
    }
  );
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

// Route cho phép người dùng đang đăng nhập (User, Author, Admin) tự xóa tài khoản của mình
app.post('/user/delete-own-account', (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Bạn cần đăng nhập để thực hiện thao tác này!');
  }

  const userId = req.session.user.id;

  // Xóa tài khoản khỏi CSDL
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (err) return res.send('Lỗi khi xóa tài khoản!');

    // Xóa session đăng nhập và quay về trang chủ
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});