// Toggle between login and register forms
if (document.getElementById('showRegister')) {
    document.getElementById('showRegister').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
        document.getElementById('message').textContent = '';
    });
}

if (document.getElementById('showLogin')) {
    document.getElementById('showLogin').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('message').textContent = '';
    });
}

// Login functionality
if (document.getElementById('login')) {
    document.getElementById('login').addEventListener('submit', async function(event) {
        event.preventDefault();

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                window.location.href = '/suggestions';
            } else {
                document.getElementById('message').textContent = result.error;
                document.getElementById('message').style.color = 'red';
            }
        } catch (error) {
            document.getElementById('message').textContent = 'Erro de conexão.';
            document.getElementById('message').style.color = 'red';
        }
    });
}

// Register functionality
if (document.getElementById('register')) {
    document.getElementById('register').addEventListener('submit', async function(event) {
        event.preventDefault();

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                document.getElementById('message').textContent = 'Conta criada com sucesso! Faça login.';
                document.getElementById('message').style.color = 'green';
                document.getElementById('registerForm').classList.add('hidden');
                document.getElementById('loginForm').classList.remove('hidden');
            } else {
                document.getElementById('message').textContent = result.error;
                document.getElementById('message').style.color = 'red';
            }
        } catch (error) {
            document.getElementById('message').textContent = 'Erro de conexão.';
            document.getElementById('message').style.color = 'red';
        }
    });
}

// Logout functionality
if (document.getElementById('logout')) {
    document.getElementById('logout').addEventListener('click', async function() {
        try {
            const response = await fetch('/logout', {
                method: 'POST',
            });

            if (response.ok) {
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    });
}

// Suggestion form functionality
if (document.getElementById('suggestionForm')) {
    document.getElementById('suggestionForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/submit-suggestion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                alert('Sugestão enviada com sucesso! Obrigado pela sua contribuição.');
                this.reset();
            } else {
                alert(result.error);
            }
        } catch (error) {
            alert('Erro de conexão.');
        }
    });

    loadUserContext();
    loadSuggestions();
}

if (document.getElementById('adminForm')) {
    document.getElementById('adminForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);
        const messageEl = document.getElementById('adminMessage');

        try {
            const response = await fetch('/promote-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (response.ok) {
                messageEl.textContent = result.message || 'Usuário promovido a administrador.';
                messageEl.style.color = 'green';
                this.reset();
            } else {
                messageEl.textContent = result.error;
                messageEl.style.color = 'red';
            }
        } catch (error) {
            messageEl.textContent = 'Erro de conexão.';
            messageEl.style.color = 'red';
        }
    });
}

async function loadUserContext() {
    try {
        const response = await fetch('/current-user');
        const result = await response.json();

        if (!response.ok) {
            return;
        }

        if (result.accessRole === 'admin') {
            const adminPanel = document.getElementById('adminPanel');
            if (adminPanel) {
                adminPanel.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
    }
}

async function loadSuggestions() {
    const suggestionCards = document.getElementById('suggestionCards');
    if (!suggestionCards) return;

    try {
        const response = await fetch('/suggestions-data');
        const result = await response.json();

        if (!response.ok) {
            suggestionCards.innerHTML = `<p class="empty-state">${result.error || 'Não foi possível carregar sugestões.'}</p>`;
            return;
        }

        if (!result.suggestions || result.suggestions.length === 0) {
            suggestionCards.innerHTML = '<p class="empty-state">Nenhuma sugestão registrada ainda.</p>';
            return;
        }

        suggestionCards.innerHTML = result.suggestions.map(item => `
            <article class="suggestion-card">
                <div class="suggestion-meta">
                    <div class="suggestion-name">${item.name}</div>
                    <div class="suggestion-category">${item.category}</div>
                </div>
                <p class="suggestion-text">${item.suggestion}</p>
                <div class="suggestion-footer">
                    <span>${item.email}</span>
                    <span>${item.department || 'Departamento não informado'}</span>
                    <span>Enviado por: ${item.registered_by || 'Anônimo'}</span>
                </div>
            </article>
        `).join('');
    } catch (error) {
        suggestionCards.innerHTML = '<p class="empty-state">Erro ao carregar sugestões.</p>';
    }
}