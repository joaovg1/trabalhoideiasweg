const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { execFileSync } = require('child_process');

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

const CATEGORY_KEYWORDS = {
    "Desenvolvimento de software": [
        "aplicativo", "app", "mobile", "web", "software", "sistema", "site", "plataforma"
    ],
    "Eletrônica e hardware": [
        "arduino", "raspberry", "sensor", "eletrônico", "eletronico", "hardware", "robô", "robo", "iot"
    ],
    "Design e identidade visual": [
        "design", "logo", "marca", "branding", "ux", "ui", "identidade"
    ],
    "Móveis e carpintaria": [
        "armário", "armario", "marcenaria", "carpintaria", "móvel", "movel", "prateleira", "estante", "mobiliário", "mobiliario", "madeira", "pinus", "mdf", "compensado"
    ],
    "Manufatura e fabricação": [
        "fábrica", "fabrica", "manufatura", "manufaturado", "indústria", "industria", "linha de montagem", "assemblagem", "montagem", "massa", "produção em massa", "producao em massa", "forja"
    ],
    "Construção e reforma": [
        "construção", "construcao", "obra", "reforma", "casa", "quarto", "jardim", "piso"
    ],
    "Marketing e divulgação": [
        "marketing", "campanha", "anúncio", "anuncio", "promoção", "promocao", "social", "redes sociais"
    ],
    "Educação e treinamento": [
        "curso", "aula", "educação", "educacao", "treinamento", "tutorial", "conteúdo"
    ],
    "Melhoria de processo industrial": [
        "processo", "eficiência", "eficiencia", "produção", "producao", "fluxo", "linha de produção", "linha de producao", "layout", "operacional", "capacidade", "fábrica", "fabrica"
    ],
    "Automação industrial": [
        "automação", "automacao", "plc", "clp", "robô", "robo", "sensores", "controlador", "movimentação", "movimentacao", "esteira"
    ],
    "Manutenção e equipamentos": [
        "manutenção", "manutencao", "equipamento", "máquina", "maquina", "peça", "peca", "ferramenta", "calibração", "calibracao", "inspeção", "inspecao"
    ],
    "Qualidade e segurança": [
        "segurança", "seguranca", "qualidade", "iso", "norma", "compliance", "ehs", "safety"
    ],
    "Logística e produção": [
        "logística", "logistica", "estoque", "armazenagem", "produção", "producao", "transporte", "inventário", "inventario", "expedição", "expedicao", "recebimento"
    ],
};

const CATEGORY_MATERIALS = {
    "Desenvolvimento de software": [
        { item: "Horas de desenvolvimento", category: "Desenvolvimento de software", quantity: 80, unit: "horas", unit_cost: 120.0 },
        { item: "Serviço de hospedagem", category: "Desenvolvimento de software", quantity: 12, unit: "meses", unit_cost: 40.0 },
    ],
    "Eletrônica e hardware": [
        { item: "Placa de desenvolvimento", category: "Eletrônica e hardware", quantity: 1, unit: "unidade", unit_cost: 120.0 },
        { item: "Sensores e módulos", category: "Eletrônica e hardware", quantity: 3, unit: "unidades", unit_cost: 35.0 },
        { item: "Protoboard e fios", category: "Eletrônica e hardware", quantity: 1, unit: "kit", unit_cost: 35.0 },
    ],
    "Design e identidade visual": [
        { item: "Projeto visual UX/UI", category: "Design e identidade visual", quantity: 1, unit: "pacote", unit_cost: 420.0 },
        { item: "Imagens e banco de ativos", category: "Design e identidade visual", quantity: 1, unit: "pacote", unit_cost: 120.0 },
    ],
    "Móveis e carpintaria": [
        { item: "Pranchas de madeira MDF/compensado", category: "Móveis e carpintaria", quantity: 8, unit: "unidades", unit_cost: 95.0 },
        { item: "Prego e parafuso", category: "Móveis e carpintaria", quantity: 100, unit: "unidades", unit_cost: 0.55 },
        { item: "Dobradiças metálicas", category: "Móveis e carpintaria", quantity: 4, unit: "unidades", unit_cost: 18.0 },
        { item: "Cola para madeira", category: "Móveis e carpintaria", quantity: 1, unit: "frasco", unit_cost: 40.0 },
        { item: "Tinta/verniz e lixa", category: "Móveis e carpintaria", quantity: 1, unit: "kit", unit_cost: 90.0 },
    ],
    "Manufatura e fabricação": [
        { item: "Folhas metálicas e chapas", category: "Manufatura e fabricação", quantity: 10, unit: "unidades", unit_cost: 220.0 },
        { item: "Componentes de montagem e fixação", category: "Manufatura e fabricação", quantity: 150, unit: "unidades", unit_cost: 2.5 },
        { item: "Tubos e conexões industriais", category: "Manufatura e fabricação", quantity: 12, unit: "unidades", unit_cost: 65.0 },
        { item: "Serviço de usinagem / corte industrial", category: "Manufatura e fabricação", quantity: 1, unit: "pacote", unit_cost: 1800.0 },
        { item: "EPI e segurança operacional", category: "Manufatura e fabricação", quantity: 1, unit: "kit", unit_cost: 650.0 },
    ],
    "Construção e reforma": [
        { item: "Materiais de construção", category: "Construção e reforma", quantity: 1, unit: "pacote", unit_cost: 1500.0 },
        { item: "Mão de obra especializada", category: "Construção e reforma", quantity: 1, unit: "serviço", unit_cost: 2500.0 },
    ],
    "Marketing e divulgação": [
        { item: "Campanha digital", category: "Marketing e divulgação", quantity: 1, unit: "pacote", unit_cost: 900.0 },
        { item: "Investimento em anúncios online", category: "Marketing e divulgação", quantity: 1, unit: "pacote", unit_cost: 600.0 },
    ],
    "Educação e treinamento": [
        { item: "Produção de conteúdo do curso", category: "Educação e treinamento", quantity: 1, unit: "pacote", unit_cost: 1100.0 },
        { item: "Plataforma de educação", category: "Educação e treinamento", quantity: 6, unit: "meses", unit_cost: 85.0 },
    ],
    "Melhoria de processo industrial": [
        { item: "Mapeamento e otimização de processos", category: "Melhoria de processo industrial", quantity: 1, unit: "pacote", unit_cost: 1800.0 },
        { item: "Consultoria de eficiência industrial", category: "Melhoria de processo industrial", quantity: 1, unit: "pacote", unit_cost: 1600.0 },
    ],
    "Automação industrial": [
        { item: "Controlador lógico programável (PLC)", category: "Automação industrial", quantity: 1, unit: "unidade", unit_cost: 2200.0 },
        { item: "Sensores industriais e cabos", category: "Automação industrial", quantity: 5, unit: "unidades", unit_cost: 85.0 },
        { item: "Programação e integração de sistemas", category: "Automação industrial", quantity: 1, unit: "pacote", unit_cost: 1900.0 },
    ],
    "Manutenção e equipamentos": [
        { item: "Peças de reposição e componentes", category: "Manutenção e equipamentos", quantity: 1, unit: "kit", unit_cost: 900.0 },
        { item: "Ferramentas e calibração", category: "Manutenção e equipamentos", quantity: 1, unit: "pacote", unit_cost: 1300.0 },
        { item: "Inspeção técnica preventiva", category: "Manutenção e equipamentos", quantity: 1, unit: "serviço", unit_cost: 1100.0 },
    ],
    "Qualidade e segurança": [
        { item: "Auditoria de qualidade e normas", category: "Qualidade e segurança", quantity: 1, unit: "pacote", unit_cost: 1400.0 },
        { item: "EPI e treinamentos de segurança", category: "Qualidade e segurança", quantity: 1, unit: "pacote", unit_cost: 1200.0 },
    ],
};

const COMPLEX_PROJECT_KEYWORDS = [
    "complexo", "complexidade", "grande risco", "alto risco", "risco", "crítico", "critico", "implementação", "implementacao", "integração", "integracao", "expansão", "expansao", "redefinição", "redefinicao", "inovação", "inovacao", "transformação", "transformacao"
];

const BASIC_PLANNING_TASK = {
    item: "Análise rápida de viabilidade",
    category: "Planejamento",
    quantity: 1,
    unit: "pacote",
    unit_cost: 250.0,
};

const ADVANCED_PLANNING_TASKS = [
    {
        item: "Gerenciamento de projeto",
        category: "Planejamento",
        quantity: 1,
        unit: "pacote",
        unit_cost: 650.0,
    },
];

function _normalizeText(text) {
    return text.toLowerCase().replace(/[^ -\w\s]/g, ' ').normalize('NFD').replace(/\p{Diacritic}/gu, ' ');
}

function _detectCategories(idea) {
    const cleaned = _normalizeText(idea);
    const categories = [];
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            if (cleaned.includes(keyword)) {
                categories.push(category);
                break;
            }
        }
    }
    return categories.length ? categories : ['Melhoria de processo industrial'];
}

function _generateProjectTitle(idea) {
    const words = idea.trim().split(/\s+/);
    if (words.length > 6) {
        return `${words[0].charAt(0).toUpperCase() + words[0].slice(1)} ${words[1].charAt(0).toUpperCase() + words[1].slice(1)} ${words[2].charAt(0).toUpperCase() + words[2].slice(1)}...`;
    }
    return idea.charAt(0).toUpperCase() + idea.slice(1);
}

function _isComplexProject(idea) {
    const cleaned = _normalizeText(idea);
    return COMPLEX_PROJECT_KEYWORDS.some(keyword => cleaned.includes(keyword));
}

function _estimateDuration(categories) {
    const baseDays = 10;
    const multiplier = 1 + 0.5 * (categories.length - 1);
    return `${Math.round(baseDays * multiplier)} dias úteis`;
}

function _buildMaterials(idea, categories) {
    const complexProject = _isComplexProject(idea);
    const materials = [BASIC_PLANNING_TASK, ...(complexProject ? ADVANCED_PLANNING_TASKS : [])];

    for (const category of categories) {
        if (category === 'Melhoria de processo industrial' && !complexProject) {
            continue;
        }
        const entries = CATEGORY_MATERIALS[category];
        if (entries) {
            materials.push(...entries);
        }
    }

    const uniqueMaterials = {};
    for (const item of materials) {
        const key = `${item.item}|${item.category}`;
        if (uniqueMaterials[key]) {
            uniqueMaterials[key].quantity += item.quantity;
        } else {
            uniqueMaterials[key] = { ...item };
        }
    }

    return Object.values(uniqueMaterials).map(item => ({
        ...item,
        total_cost: Number((item.quantity * item.unit_cost).toFixed(2)),
    }));
}

function generateProjectPlan(idea) {
    const categories = _detectCategories(idea);
    const materials = _buildMaterials(idea, categories);
    const budget = materials.reduce((sum, item) => sum + item.total_cost, 0);
    const planning_cost_total = materials.filter(item => item.category === 'Planejamento').reduce((sum, item) => sum + item.total_cost, 0);
    const materials_cost_total = Number((budget - planning_cost_total).toFixed(2));

    return {
        idea,
        project_name: _generateProjectTitle(idea),
        description: `Resumo da ideia: ${idea}. Projeto sugerido com foco em ${categories.join(', ')}.`,
        categories,
        budget: Number(budget.toFixed(2)),
        planning_cost_total: Number(planning_cost_total.toFixed(2)),
        materials_cost_total,
        estimated_duration: _estimateDuration(categories),
    };
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

        if (req.session.userRole === 'admin') {
            rows = rows.map(item => {
                const plan = getAdminSuggestionPlan(item.suggestion);
                return {
                    ...item,
                    admin_summary: plan ? plan.description : null,
                    estimated_cost: plan ? plan.budget : null,
                    estimated_duration: plan ? plan.estimated_duration : null,
                    plan_categories: plan ? plan.categories : null,
                };
            });
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