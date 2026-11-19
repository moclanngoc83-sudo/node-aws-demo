const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Đảm bảo thư mục lưu ảnh upload tồn tại
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình Multer upload ảnh bìa
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'cover-' + Date.now() + ext);
  }
});
const upload = multer({ storage });

// Cấu hình View Engine & Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
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
  // Bảng Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )`);

  // Bảng Stories
  db.run(`CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    category TEXT DEFAULT 'Khác',
    status TEXT DEFAULT 'Đang cập nhật',
    cover_image TEXT,
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Bổ sung các cột mới nếu bảng stories đã tồn tại từ trước
  db.run(`ALTER TABLE stories ADD COLUMN category TEXT DEFAULT 'Khác'`, () => {});
  db.run(`ALTER TABLE stories ADD COLUMN status TEXT DEFAULT 'Đang cập nhật'`, () => {});
  db.run(`ALTER TABLE stories ADD COLUMN cover_image TEXT`, () => {});

  // Bảng Chapters
  db.run(`CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER,
    chapter_number INTEGER,
    title TEXT,
    content TEXT
  )`);

  // Bảng Danh mục / Thể loại
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`, () => {
    const defaultCategories = ['Tiên Hiệp', 'Kiếm Hiệp', 'Ngôn Tình', 'Đô Thị', 'Kinh Dị', 'Khoa Học Viễn Tưởng', 'Hành Động'];
    defaultCategories.forEach(cat => {
      db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [cat]);
    });
  });

  // Tài khoản Admin mặc định (admin / admin123)
  const defaultAdminPass = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'admin')`, [defaultAdminPass]);
});

// Middleware truyền thông tin người dùng vào giao diện
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ==========================================
// 1. ROUTE TRANG CHỦ & ĐỌC TRUYỆN
// ==========================================

app.get('/', (req, res) => {
  const selectedCategory = req.query.category;
  const searchQuery = req.query.search ? req.query.search.trim() : '';

  let sql = `SELECT stories.*, users.username AS author_name
             FROM stories
             JOIN users ON stories.author_id = users.id
             WHERE 1=1`;
  let params = [];

  if (selectedCategory && selectedCategory !== 'All') {
    sql += ` AND stories.category = ?`;
    params.push(selectedCategory);
  }

  if (searchQuery !== '') {
    sql += ` AND stories.title LIKE ?`;
    params.push(`%${searchQuery}%`);
  }

  sql += ` ORDER BY stories.id DESC`;

  db.all(sql, params, (err, stories) => {
    db.all(`SELECT * FROM categories`, [], (err, categories) => {
      res.render('index', {
        stories: stories || [],
        categories: categories || [],
        selectedCategory: selectedCategory || 'All',
        searchQuery
      });
    });
  });
});

// Chi tiết truyện & Danh sách chương
app.get('/story/:id', (req, res) => {
  const storyId = req.params.id;
  db.get(
    `SELECT stories.*, users.username AS author_name
     FROM stories
     JOIN users ON stories.author_id = users.id
     WHERE stories.id = ?`,
    [storyId],
    (err, story) => {
      if (!story) return res.send('Không tìm thấy truyện!');
      db.all(`SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC, id ASC`, [storyId], (err, chapters) => {
        res.render('story', { story, chapters: chapters || [] });
      });
    }
  );
});

// Trang đọc chương truyện
// Trang đọc chương truyện (kèm danh sách toàn bộ chương cho Popup Mục Lục)
app.get('/chapter/:id', (req, res) => {
  const currentChapterId = parseInt(req.params.id);
  db.get(`SELECT * FROM chapters WHERE id = ?`, [currentChapterId], (err, chapter) => {
    if (!chapter) return res.send('Không tìm thấy chương!');

    // Lấy toàn bộ chương của bộ truyện để hiển thị trong Popup Mục Lục
    db.all(
      `SELECT id, chapter_number, title FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC, id ASC`,
      [chapter.story_id],
      (err, allChapters) => {
        const chaptersList = allChapters || [];
        const currentIndex = chaptersList.findIndex(c => c.id === currentChapterId);

        const prevChapterId = currentIndex > 0 ? chaptersList[currentIndex - 1].id : null;
        const nextChapterId = (currentIndex !== -1 && currentIndex < chaptersList.length - 1)
          ? chaptersList[currentIndex + 1].id
          : null;

        res.render('read', {
          chapter,
          chapters: chaptersList,
          prevChapterId,
          nextChapterId
        });
      }
    );
  });
});

// ==========================================
// 2. ROUTE ĐĂNG KÝ / ĐĂNG NHẬP / ĐĂNG XUẤT
// ==========================================

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

app.post('/user/delete-own-account', (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Bạn cần đăng nhập để thực hiện thao tác này!');
  }
  const userId = req.session.user.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (err) return res.send('Lỗi khi xóa tài khoản!');
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

// ==========================================
// 3. ROUTE TÁC GIẢ (AUTHOR & ADMIN)
// ==========================================

// Trang chính Khu vực Tác giả
app.get('/author', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  db.all(`SELECT * FROM stories WHERE author_id = ? ORDER BY id DESC`, [req.session.user.id], (err, stories) => {
    db.all(`SELECT * FROM categories`, [], (err, categories) => {
      res.render('author', {
        stories: stories || [],
        categories: categories || []
      });
    });
  });
});

// Đăng truyện mới (Hỗ trợ cả Upload ảnh & Link URL)
app.post('/author/create-story', upload.single('cover_file'), (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const { title, description, category, cover_url } = req.body;
  const cover_image = req.file ? `/uploads/${req.file.filename}` : (cover_url ? cover_url.trim() : null);

  db.run(
    `INSERT INTO stories (title, description, category, author_id, cover_image) VALUES (?, ?, ?, ?, ?)`,
    [title, description, category || 'Khác', req.session.user.id, cover_image],
    function (err) {
      if (err) return res.send('Lỗi khi thêm truyện mới: ' + err.message);
      res.redirect('/author');
    }
  );
});

// Mở trang Quản lý chương của 1 bộ truyện (Khi ấn nút "Quản lý chương")
app.get('/author/story/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const storyId = req.params.id;
  db.get(`SELECT * FROM stories WHERE id = ?`, [storyId], (err, story) => {
    if (!story) return res.send('Không tìm thấy truyện!');
    if (req.session.user.role !== 'admin' && story.author_id !== req.session.user.id) {
      return res.status(403).send('Bạn không có quyền quản lý truyện này!');
    }

    db.all(`SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC, id ASC`, [storyId], (err, chapters) => {
      res.render('manage_chapters', {
        story,
        chapters: chapters || []
      });
    });
  });
});

// Đăng chương mới ngay trong trang Quản lý chương
app.post('/author/story/:id/add-chapter', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const storyId = req.params.id;
  const { title, content } = req.body;

  // Tự động lấy số thứ tự chương tiếp theo
  db.get(`SELECT COUNT(*) AS count FROM chapters WHERE story_id = ?`, [storyId], (err, row) => {
    const nextNumber = (row ? row.count : 0) + 1;
    db.run(
      `INSERT INTO chapters (story_id, chapter_number, title, content) VALUES (?, ?, ?, ?)`,
      [storyId, nextNumber, title, content],
      (err) => {
        if (err) return res.send('Lỗi khi thêm chương mới!');
        res.redirect(`/author/story/${storyId}`);
      }
    );
  });
});

// Sửa chương từ Popup Modal trong trang Quản lý chương
app.post('/author/edit-chapter/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const chapterId = req.params.id;
  const { title, content, story_id } = req.body;

  db.run(
    `UPDATE chapters SET title = ?, content = ? WHERE id = ?`,
    [title, content, chapterId],
    (err) => {
      if (err) return res.send('Lỗi khi cập nhật chương!');
      if (story_id) {
        res.redirect(`/author/story/${story_id}`);
      } else {
        res.redirect('/chapter/' + chapterId);
      }
    }
  );
});

// Xóa chương ngay trong trang Quản lý chương
app.post('/author/delete-chapter/:id', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'author' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }

  const chapterId = req.params.id;
  const { story_id } = req.body;

  db.run(`DELETE FROM chapters WHERE id = ?`, [chapterId], (err) => {
    if (err) return res.send('Lỗi khi xóa chương!');
    res.redirect(`/author/story/${story_id}`);
  });
});

// ==========================================
// 4. ROUTE ADMIN
// ==========================================

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

app.get('/admin/categories', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Chỉ Admin mới có quyền quản lý thể loại!');
  }
  db.all(`SELECT * FROM categories`, [], (err, categories) => {
    res.render('admin-categories', { categories: categories || [] });
  });
});

app.post('/admin/add-category', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }
  const { category_name } = req.body;
  if (!category_name || category_name.trim() === '') {
    return res.send('Tên thể loại không được để trống!');
  }
  db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [category_name.trim()], (err) => {
    if (err) return res.send('Lỗi khi thêm thể loại!');
    res.redirect('/admin/categories');
  });
});
// Admin đổi vai trò người dùng (User <-> Author)
app.post('/admin/change-role/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }
  const targetUserId = parseInt(req.params.id);
  const { role } = req.body;
  if (targetUserId === 1) return res.send('Không thể thay đổi quyền của Admin gốc!');

  db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, targetUserId], (err) => {
    if (err) return res.send('Lỗi cập nhật vai trò!');
    res.redirect('/admin');
  });
});

// Admin xóa tài khoản người dùng
app.post('/admin/delete-user/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }
  const targetUserId = parseInt(req.params.id);
  if (targetUserId === 1 || targetUserId === req.session.user.id) {
    return res.send('Không thể xóa tài khoản Admin gốc hoặc tài khoản đang đăng nhập!');
  }

  db.run(`DELETE FROM users WHERE id = ?`, [targetUserId], (err) => {
    if (err) return res.send('Lỗi khi xóa người dùng!');
    res.redirect('/admin');
  });
});

// Admin xóa bộ truyện (kèm toàn bộ chương của truyện đó)
app.post('/admin/delete-story/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Quyền truy cập bị từ chối!');
  }
  const storyId = req.params.id;
  db.run(`DELETE FROM chapters WHERE story_id = ?`, [storyId], () => {
    db.run(`DELETE FROM stories WHERE id = ?`, [storyId], (err) => {
      if (err) return res.send('Lỗi khi xóa truyện!');
      res.redirect('/admin');
    });
  });
});

// Khởi động Server
app.listen(PORT, () => {
  console.log(`Server web đọc truyện đang chạy tại port ${PORT}`);
});