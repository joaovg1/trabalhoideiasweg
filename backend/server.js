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
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Usuário ou e-mail já existe.' });
                    }
                    return res.status(500).json({ error: 'Erro interno do servidor.' });
                }
                req.session.userId = this.lastID;
                res.json({ success: true });
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
        res.json({ success: true });
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