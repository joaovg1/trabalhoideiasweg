const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'weg-secret-key',
    resave: false,
    saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'weg_suggestions.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        createTables();
    }
});

function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        department TEXT,
        category TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
}

// Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/suggestions');
    } else {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

app.get('/suggestions', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../frontend/suggestions.html'));
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    try {
        db.get('SELECT COUNT(*) AS count FROM users', [], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erro interno do servidor.' });
            }

            const isFirstUser = row.count === 0;
            const role = isFirstUser ? 'admin' : 'employee';
            const hashedPassword = await bcrypt.hash(password, 10);

            db.run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                [username, email, hashedPassword, role],
                function(insertErr) {
                    if (insertErr) {
                        if (insertErr.message.includes('UNIQUE constraint failed')) {
                            return res.status(400).json({ error: 'Usuário ou e-mail já existe.' });
                        }
                        return res.status(500).json({ error: 'Erro interno do servidor.' });
                    }
                    req.session.userId = this.lastID;
                    req.session.userRole = role;
                    req.session.username = username;
                    res.json({ success: true, role });
                });
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.username = user.username;
        res.json({ success: true, role: user.role });
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout.' });
        }
        res.json({ success: true });
    });
});

app.get('/current-user', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    res.json({ success: true, username: req.session.username, role: req.session.userRole });
});

app.post('/promote-admin', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ error: 'Apenas administradores podem promover outros admins.' });
    }

    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }

    db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'Usuário com este e-mail não encontrado.' });
        }

        db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: 'Erro ao atualizar permissão.' });
            }
            res.json({ success: true, message: 'Usuário promovido a administrador.' });
        });
    });
});

app.get('/suggestions-data', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    db.all(`SELECT s.id, s.name, s.email, s.department, s.category, s.suggestion, s.created_at,
                   u.username AS registered_by
            FROM suggestions s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao carregar sugestões.' });
        }
        res.json({ success: true, suggestions: rows });
    });
});

app.post('/submit-suggestion', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { name, email, department, category, suggestion } = req.body;

    if (!name || !email || !category || !suggestion) {
        return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
    }

    db.run('INSERT INTO suggestions (user_id, name, email, department, category, suggestion) VALUES (?, ?, ?, ?, ?, ?)',
        [req.session.userId, name, email, department, category, suggestion],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao salvar sugestão.' });
            }
            res.json({ success: true });
        });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});