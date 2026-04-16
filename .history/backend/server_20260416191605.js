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
        ensureJoaoIsAdmin();
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
        response TEXT,
        response_by INTEGER,
        response_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.all(`PRAGMA table_info(users)`, [], (err, columns) => {
        if (!err && Array.isArray(columns)) {
            const hasRole = columns.some(column => column.name === 'role');
            if (!hasRole) {
                db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'`);
            }
        }
    });

    db.all(`PRAGMA table_info(suggestions)`, [], (err, columns) => {
        if (!err && Array.isArray(columns)) {
            const hasResponse = columns.some(column => column.name === 'response');
            const hasResponseBy = columns.some(column => column.name === 'response_by');
            const hasResponseAt = columns.some(column => column.name === 'response_at');
            if (!hasResponse) {
                db.run(`ALTER TABLE suggestions ADD COLUMN response TEXT`);
            }
            if (!hasResponseBy) {
                db.run(`ALTER TABLE suggestions ADD COLUMN response_by INTEGER`);
            }
            if (!hasResponseAt) {
                db.run(`ALTER TABLE suggestions ADD COLUMN response_at DATETIME`);
            }
        }
    });
}

function ensureJoaoIsAdmin() {
    db.run(`UPDATE users SET role = 'admin' WHERE username = ?`, ['joao'], function(err) {
        if (err) {
            console.error('Erro ao definir joao como admin:', err.message);
        } else if (this.changes > 0) {
            console.log('Usuário joao atualizado para admin.');
        }
    });
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
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Usuário, senha e tipo de conta são obrigatórios.' });
    }

    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        }

        if (role === 'admin' && user.role !== 'admin') {
            return res.status(401).json({ error: 'Você não tem permissão de administrador.' });
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.accessRole = role;
        req.session.username = user.username;
        res.json({ success: true, role: user.role, accessRole: role });
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

    res.json({
        success: true,
        username: req.session.username,
        role: req.session.userRole,
        accessRole: req.session.accessRole || req.session.userRole
    });
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

app.post('/respond-suggestion', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ error: 'Apenas administradores podem responder sugestões.' });
    }

    const { id, response } = req.body;
    if (!id || !response) {
        return res.status(400).json({ error: 'ID da sugestão e resposta são obrigatórios.' });
    }

    db.run('UPDATE suggestions SET response = ?, response_by = ?, response_at = CURRENT_TIMESTAMP WHERE id = ?',
        [response, req.session.userId, id], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao salvar resposta.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Sugestão não encontrada.' });
            }
            res.json({ success: true, message: 'Resposta registrada com sucesso.' });
        });
});

app.get('/suggestions-data', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    let query = `SELECT s.id, s.name, s.email, s.department, s.category, s.suggestion, s.response, s.response_at,
                   u.username AS registered_by, a.username AS responded_by
            FROM suggestions s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN users a ON s.response_by = a.id`;
    const params = [];

    if (req.session.userRole !== 'admin') {
        query += ' WHERE s.user_id = ?';
        params.push(req.session.userId);
    }

    query += ' ORDER BY s.created_at DESC';

    db.all(query, params, (err, rows) => {
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