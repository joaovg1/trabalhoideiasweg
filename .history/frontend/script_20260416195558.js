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
    const roleButtons = document.querySelectorAll('.role-btn');
    const roleInput = document.getElementById('loginRole');
    const loginSubmit = document.getElementById('loginSubmit');

    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            roleButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            roleInput.value = button.dataset.role;
            const roleLabel = button.dataset.role === 'admin' ? 'Administrador' : 'Funcionário';
            loginSubmit.textContent = `Entrar como ${roleLabel}`;
        });
    });

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
        const confirmed = confirm('Tem certeza que deseja sair da sua conta?');
        if (!confirmed) {
            return;
        }

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

        window.canAdmin = result.accessRole === 'admin';

        if (window.canAdmin) {
            const adminButton = document.getElementById('adminMenuBtn');
            if (adminButton) {
                adminButton.classList.remove('hidden');
            }
        }

        setupSidebar();
        await loadSuggestions();
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
    }
}

function setupSidebar() {
    const buttons = document.querySelectorAll('.sidebar-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            showSidebarSection(button.dataset.target);
        });
    });
}

function showSidebarSection(targetId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        if (section.id === targetId) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    });
    closeSuggestionDetail();
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

        window.suggestionFilter = window.suggestionFilter || 'all';
        window.suggestionsData = Array.isArray(result.suggestions) ? result.suggestions : [];
        renderSuggestionCards();
        setupFilterButtons();
    } catch (error) {
        suggestionCards.innerHTML = '<p class="empty-state">Erro ao carregar sugestões.</p>';
    }
}

function setupFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            window.suggestionFilter = button.dataset.filter;
            renderSuggestionCards();
        });
    });
}

function renderSuggestionCards() {
    const suggestionCards = document.getElementById('suggestionCards');
    if (!suggestionCards || !Array.isArray(window.suggestionsData)) return;

    let suggestions = [...window.suggestionsData];
    if (window.suggestionFilter === 'answered') {
        suggestions = suggestions.filter(item => item.response);
    } else if (window.suggestionFilter === 'unanswered') {
        suggestions = suggestions.filter(item => !item.response);
    }

    if (!suggestions.length) {
        const emptyText = window.suggestionFilter === 'answered'
            ? 'Nenhuma sugestão respondida.'
            : window.suggestionFilter === 'unanswered'
                ? 'Nenhuma sugestão não respondida.'
                : 'Nenhuma sugestão registrada ainda.';
        suggestionCards.innerHTML = `<p class="empty-state">${emptyText}</p>`;
        return;
    }

    suggestionCards.innerHTML = suggestions.map(item => {
        const statusClass = item.response ? 'answered' : 'unanswered';
        const statusLabel = item.response ? 'Respondida' : 'Não respondida';

        return `
            <article class="suggestion-card" data-id="${item.id}">
                <div class="suggestion-meta">
                    <div class="suggestion-name">${escapeHTML(item.name)}</div>
                    <div class="suggestion-category">${escapeHTML(item.category)}</div>
                </div>
                <p class="suggestion-text">${escapeHTML(item.suggestion)}</p>
                <div class="suggestion-footer">
                    <span>${escapeHTML(item.email)}</span>
                    <span>${escapeHTML(item.department || 'Departamento não informado')}</span>
                    <span>Enviado por: ${escapeHTML(item.registered_by || 'Anônimo')}</span>
                    <span class="suggestion-status ${statusClass}">${statusLabel}</span>
                </div>
            </article>
        `;
    }).join('');

    attachCardListeners();
}

function attachCardListeners() {
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const suggestionId = parseInt(card.dataset.id, 10);
            const item = window.suggestionsData.find(s => s.id === suggestionId);
            if (item) {
                openSuggestionDetail(item);
            }
        });
    });
}

function openSuggestionDetail(item) {
    const panel = document.getElementById('suggestionDetailPanel');
    const detailContent = document.getElementById('detailContent');
    if (!panel || !detailContent) return;

    const responseBlock = item.response ? `
        <div class="detail-block">
            <h3>Resposta do administrador</h3>
            <p>${escapeHTML(item.response)}</p>
            ${item.responded_by ? `<small>Respondido por: ${escapeHTML(item.responded_by)}</small>` : ''}
        </div>
    ` : '';

    const summaryBlock = window.canAdmin && item.admin_summary ? `
        <div class="detail-block">
            <h3>Resumo melhorado</h3>
            <p>${escapeHTML(item.admin_summary)}</p>
            <small>Custo estimado: R$ ${typeof item.estimated_cost === 'number' ? item.estimated_cost.toFixed(2) : 'N/A'} • Duração: ${escapeHTML(item.estimated_duration || 'N/A')}</small>
        </div>
    ` : '';

    const responseForm = window.canAdmin ? `
        <div class="detail-block">
            <h3>${item.response ? 'Editar resposta' : 'Responder sugestão'}</h3>
            <form id="detailResponseForm" data-id="${item.id}" class="response-form">
                <div class="form-group">
                    <label for="detail-response-${item.id}">Resposta</label>
                    <textarea id="detail-response-${item.id}" name="response" rows="5" placeholder="Digite a resposta...">${escapeHTML(item.response || '')}</textarea>
                </div>
                <button type="submit">${item.response ? 'Atualizar resposta' : 'Enviar resposta'}</button>
            </form>
        </div>
    ` : '';

    detailContent.innerHTML = `
        <div class="detail-header">
            <div>
                <h2>${escapeHTML(item.name)}</h2>
                <p class="detail-info">${escapeHTML(item.category)} • ${escapeHTML(item.department || 'Departamento não informado')}</p>
            </div>
            <span class="suggestion-status ${item.response ? 'answered' : 'unanswered'}">${item.response ? 'Respondida' : 'Não respondida'}</span>
        </div>
        <div class="detail-block">
            <h3>Sugestão</h3>
            <p>${escapeHTML(item.suggestion)}</p>
            <small>E-mail: ${escapeHTML(item.email)}</small>
        </div>
        ${summaryBlock}
        ${responseBlock}
        ${responseForm}
    `;

    panel.classList.remove('hidden');
    document.getElementById('closeDetailBtn').addEventListener('click', closeSuggestionDetail);
    attachDetailResponseListener();
}

function closeSuggestionDetail() {
    const panel = document.getElementById('suggestionDetailPanel');
    if (panel) {
        panel.classList.add('hidden');
    }
}

function attachDetailResponseListener() {
    const form = document.getElementById('detailResponseForm');
    if (!form) return;

    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        const suggestionId = this.dataset.id;
        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/respond-suggestion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: suggestionId, response: data.response }),
            });

            const result = await response.json();
            if (response.ok) {
                alert(result.message || 'Resposta enviada com sucesso.');
                closeSuggestionDetail();
                loadSuggestions();
            } else {
                alert(result.error);
            }
        } catch (error) {
            alert('Erro ao enviar resposta.');
        }
    });
}
