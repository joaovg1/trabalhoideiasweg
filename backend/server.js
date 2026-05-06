const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 8081;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
let server = null;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'weg-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'lax',
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// CORS middleware for remote access
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', ip: req.ip, timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'weg_suggestions.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        createTables();
        ensureDefaultAdmin();
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

    db.run(`CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea TEXT NOT NULL,
        project_name TEXT NOT NULL,
        description TEXT,
        categories TEXT,
        materials TEXT,
        budget REAL,
        planning_cost_total REAL,
        materials_cost_total REAL,
        estimated_duration TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

function ensureDefaultAdmin() {
    const adminUsername = 'admin';
    const adminEmail = 'admin@admin.local';
    const adminPassword = 'admin';

    db.get('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['admin'], async (err, row) => {
        if (err) {
            console.error('Erro ao verificar existência de admin:', err.message);
            return;
        }

        if (row && row.count > 0) {
            console.log('Já existe um usuário admin no banco de dados.');
            return;
        }

        db.get('SELECT * FROM users WHERE username = ?', [adminUsername], async (selectErr, existingUser) => {
            if (selectErr) {
                console.error('Erro ao buscar usuário admin existente:', selectErr.message);
                return;
            }

            if (existingUser) {
                db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', existingUser.id], function(updateErr) {
                    if (updateErr) {
                        console.error('Erro ao atualizar usuário admin existente:', updateErr.message);
                    } else {
                        console.log('Usuário existente "admin" atualizado para role admin.');
                    }
                });
                return;
            }

            try {
                const hashedPassword = await bcrypt.hash(adminPassword, 10);
                db.run(
                    'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                    [adminUsername, adminEmail, hashedPassword, 'admin'],
                    function(insertErr) {
                        if (insertErr) {
                            console.error('Erro ao criar usuário admin padrão:', insertErr.message);
                        } else {
                            console.log('Usuário admin padrão criado com sucesso.');
                        }
                    }
                );
            } catch (hashErr) {
                console.error('Erro ao gerar hash para admin padrão:', hashErr.message);
            }
        });
    });
}

function _parseOpenAIJson(content) {
    let jsonText = content.trim();
    const match = jsonText.match(/(\{[\s\S]*\})/);
    if (match) {
        jsonText = match[1];
    }

    return JSON.parse(jsonText);
}

async function getChatGPTProjectPlan(suggestion) {
    if (!openai) {
        console.warn('OPENAI_API_KEY ausente: usando fallback local para plano de projeto.');
        const fallbackPlan = generateProjectPlan(suggestion);
        return {
            description: fallbackPlan.description,
            project_name: fallbackPlan.project_name,
            categories: fallbackPlan.categories,
            budget: fallbackPlan.budget,
            estimated_duration: fallbackPlan.estimated_duration,
            materials: fallbackPlan.materials,
            planning_cost_total: fallbackPlan.planning_cost_total,
            materials_cost_total: fallbackPlan.materials_cost_total,
        };
    }

    const messages = [
        {
            role: 'system',
            content: 'Você é um assistente que transforma uma sugestão em um plano de projeto detalhado com orçamento e materiais. Retorne apenas JSON válido sem explicações adicionais.'
        },
        {
            role: 'user',
            content: `Sugestão: ${suggestion}

Gere um plano de projeto detalhado incluindo:
- description: Descrição do projeto
- project_name: Nome do projeto
- categories: Lista de categorias
- budget: Orçamento total estimado
- estimated_duration: Duração estimada
- materials: Lista detalhada de materiais com item, category, quantity, unit, unit_cost, total_cost

Responda apenas com JSON válido.`
        }
    ];

    const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.0,
        max_tokens: 1000,
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('Resposta vazia do OpenAI.');
    }

    const plan = _parseOpenAIJson(text);

    if (typeof plan.budget === 'string') {
        plan.budget = Number(plan.budget.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '')) || 0;
    }

    if (typeof plan.categories === 'string') {
        plan.categories = [plan.categories];
    }

    // Ensure materials is array
    if (!Array.isArray(plan.materials)) {
        plan.materials = [];
    }

    return plan;
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
    console.log('[REGISTER] request body:', req.body);
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    try {
        db.get('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['admin'], async (err, row) => {
            if (err) {
                console.error('[REGISTER] db.get error:', err);
                return res.status(500).json({ error: 'Erro interno do servidor.' });
            }

            const noAdminExists = !row || row.count === 0;
            const role = noAdminExists ? 'admin' : 'employee';
            const hashedPassword = await bcrypt.hash(password, 10);

            db.run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                [username, email, hashedPassword, role],
                function(insertErr) {
                    if (insertErr) {
                        console.error('[REGISTER] insert error:', insertErr);
                        if (insertErr.message.includes('UNIQUE constraint failed')) {
                            return res.status(400).json({ error: 'Usuário ou e-mail já existe.' });
                        }
                        return res.status(500).json({ error: 'Erro interno do servidor.' });
                    }
                    console.log('[REGISTER] success user id', this.lastID);
                    req.session.userId = this.lastID;
                    req.session.userRole = role;
                    req.session.username = username;
                    res.json({ success: true, role });
                });
        });
    } catch (error) {
        console.error('[REGISTER] exception:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.post('/login', (req, res) => {
    console.log('[LOGIN] request body:', req.body);
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Usuário, senha e tipo de conta são obrigatórios.' });
    }

    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err) {
            console.error('[LOGIN] db.get error:', err);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.warn('[LOGIN] invalid credentials for', username);
            return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        }

        if (role === 'admin' && user.role !== 'admin') {
            console.warn('[LOGIN] admin access denied for', username);
            return res.status(401).json({ error: 'Você não tem permissão de administrador.' });
        }

        console.log('[LOGIN] success for user', username);
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

app.get('/suggestions-data', async (req, res) => {
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

    db.all(query, params, async (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao carregar sugestões.' });
        }

        if (req.session.userRole === 'admin') {
            rows = await Promise.all(rows.map(async item => {
                const plan = await getChatGPTProjectPlan(item.suggestion).catch(error => {
                    console.error('Erro ao gerar plano ChatGPT:', error?.message || error);
                    return null;
                });
                return {
                    ...item,
                    admin_summary: plan && plan.description ? plan.description : 'Não foi possível gerar o resumo.',
                    estimated_cost: plan && typeof plan.budget === 'number' ? plan.budget : null,
                    estimated_duration: plan && plan.estimated_duration ? plan.estimated_duration : 'Não disponível',
                    plan_categories: plan && Array.isArray(plan.categories) ? plan.categories : [],
                };
            }));
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

    // First, insert the suggestion
    db.run('INSERT INTO suggestions (user_id, name, email, department, category, suggestion) VALUES (?, ?, ?, ?, ?, ?)',
        [req.session.userId, name, email, department, category, suggestion],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao salvar sugestão.' });
            }

            // After saving suggestion, generate detailed budget using AI
            try {
                const plan = generateProjectPlan(suggestion);
                db.run(`INSERT INTO budgets (idea, project_name, description, categories, materials, budget, planning_cost_total, materials_cost_total, estimated_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [plan.idea, plan.project_name, plan.description, JSON.stringify(plan.categories), JSON.stringify(plan.materials), plan.budget, plan.planning_cost_total, plan.materials_cost_total, plan.estimated_duration],
                    function(budgetErr) {
                        if (budgetErr) {
                            console.error('Erro ao salvar orçamento:', budgetErr);
                            // Still return success for suggestion
                        }
                        res.json({ success: true, budget_generated: !budgetErr });
                    });
            } catch (error) {
                console.error('Erro ao gerar orçamento:', error);
                res.json({ success: true, budget_generated: false });
            }
        });
});

// Routes for budgets
app.get('/budgets', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    db.all('SELECT * FROM budgets ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao carregar orçamentos.' });
        }
        res.json({ success: true, budgets: rows });
    });
});

app.post('/generate-budget', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { idea } = req.body;
    if (!idea) {
        return res.status(400).json({ error: 'Ideia é obrigatória.' });
    }

    try {
        const plan = generateProjectPlan(idea);
        db.run(`INSERT INTO budgets (idea, project_name, description, categories, materials, budget, planning_cost_total, materials_cost_total, estimated_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [plan.idea, plan.project_name, plan.description, JSON.stringify(plan.categories), JSON.stringify(plan.materials), plan.budget, plan.planning_cost_total, plan.materials_cost_total, plan.estimated_duration],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erro ao salvar orçamento.' });
                }
                res.json({ success: true, budget: { id: this.lastID, ...plan } });
            });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar orçamento.' });
    }
});

function startServer(port) {
    if (server) {
        server.close(() => {
            console.log(`Servidor anterior encerrado antes de tentar iniciar na porta ${port}.`);
            startServer(port);
        });
        return;
    }

    server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${port}`);
        console.log(`Acesse o site a partir de outro computador usando o IP da máquina: http://10.129.224.41:${port}`);
    });

    server.on('close', () => {
        console.log(`Servidor desligado e porta ${port} liberada.`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`Porta ${port} já está em uso. Tentando porta ${port + 1}...`);
            server = null;
            startServer(port + 1);
        } else {
            console.error('Erro ao iniciar o servidor:', err);
            process.exit(1);
        }
    });
}

function shutdown() {
    if (server) {
        console.log('Encerrando servidor...');
        server.close(() => {
            console.log('Servidor encerrado. Porta liberada.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
    shutdown();
});

startServer(PORT);