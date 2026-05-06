-- Schema para o banco de dados do Sistema de Sugestões WEG
-- Arquivo SQL para inicializar as tabelas

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de sugestões
CREATE TABLE IF NOT EXISTS suggestions (
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
);

-- Tabela de orçamentos/projetos
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea TEXT NOT NULL,
    project_name TEXT NOT NULL,
    description TEXT,
    categories TEXT, -- JSON array
    materials TEXT, -- JSON array
    budget REAL,
    planning_cost_total REAL,
    materials_cost_total REAL,
    estimated_duration TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);