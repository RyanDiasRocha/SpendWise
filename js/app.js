/* ==========================================================================
   SPENDWISE - APP LOGIC & STATE MANAGEMENT (WITH PERIODS & EXCEL EXPORT)
   ========================================================================== */

// 1. Initial State & Storage Structure
let state = {
    periods: [],
    expenses: [],
    activePeriodId: "",
    paymentMethods: [],
    googleClientId: "582582608984-6gsefua4vb35381krniim7srnf2l53br.apps.googleusercontent.com"
};

// Helper for generating unique IDs
function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Get current date string formatted as YYYY-MM-DD
function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Dummy initial data to showcase the design on first run
const DUMMY_PERIODS = [
    { id: "p1", name: "Maio 2026", createdAt: getTodayString() },
    { id: "p2", name: "Viagem de Férias", createdAt: getTodayString() }
];

const DUMMY_EXPENSES = [
    {
        id: "d1",
        periodId: "p1",
        description: "Aluguel da Residência",
        value: 1500.00,
        date: "2026-05-05",
        paymentMethod: "Pix",
        reserved: true
    },
    {
        id: "d2",
        periodId: "p1",
        description: "Supermercado Mensal",
        value: 680.40,
        date: "2026-05-10",
        paymentMethod: "Cartão de Crédito",
        reserved: true
    },
    {
        id: "d3",
        periodId: "p1",
        description: "Fatura de Energia Elétrica",
        value: 185.30,
        date: "2026-05-12",
        paymentMethod: "Boleto",
        reserved: false
    },
    {
        id: "d4",
        periodId: "p1",
        description: "Combustível Semanal",
        value: 220.00,
        date: "2026-05-18",
        paymentMethod: "Cartão de Débito",
        reserved: false
    },
    {
        id: "d5",
        periodId: "p2",
        description: "Passagens Aéreas",
        value: 850.00,
        date: "2026-05-01",
        paymentMethod: "Cartão de Crédito",
        reserved: true
    },
    {
        id: "d6",
        periodId: "p2",
        description: "Hospedagem Hotel",
        value: 1200.00,
        date: "2026-05-15",
        paymentMethod: "Pix",
        reserved: false
    }
];

const DEFAULT_PAYMENTS = ["Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Boleto"];

// Load state from localStorage with migration check
function loadState() {
    const storedState = localStorage.getItem('spendwise_data');
    const legacyExpenses = localStorage.getItem('spendwise_expenses');

    if (storedState) {
        // Normal load
        try {
            state = JSON.parse(storedState);
            // Ensure array safety
            if (!state.periods) state.periods = [];
            if (!state.expenses) state.expenses = [];
            if (!state.paymentMethods || state.paymentMethods.length === 0) {
                state.paymentMethods = [...DEFAULT_PAYMENTS];
            }
            state.googleClientId = state.googleClientId || "582582608984-6gsefua4vb35381krniim7srnf2l53br.apps.googleusercontent.com";
        } catch (e) {
            console.error("Erro ao carregar dados do LocalStorage. Inicializando limpo.", e);
            initializeDemoData();
        }
    } else if (legacyExpenses) {
        // Migration from legacy expenses-only format to Periods format
        try {
            const parsedExpenses = JSON.parse(legacyExpenses);
            const defaultPeriod = {
                id: "p-migrated",
                name: "Período Inicial",
                createdAt: getTodayString()
            };

            state.periods = [defaultPeriod];
            state.activePeriodId = defaultPeriod.id;
            state.paymentMethods = [...DEFAULT_PAYMENTS];
            state.expenses = parsedExpenses.map(exp => ({
                ...exp,
                periodId: defaultPeriod.id
            }));

            saveState();
            localStorage.removeItem('spendwise_expenses'); // Clean legacy
            showToast("Dados migrados para o novo sistema de períodos!", "success");
        } catch (e) {
            console.error("Erro na migração de dados antigos.", e);
            initializeDemoData();
        }
    } else {
        // First run
        initializeDemoData();
        showToast("Seja bem-vindo! Inicializamos seu primeiro período de trabalho.", "info");
    }
}

// Helper to load clean initial data
function initializeDemoData() {
    const defaultPeriodId = "p-" + generateId();
    state.periods = [
        { id: defaultPeriodId, name: "Período Inicial", createdAt: getTodayString() }
    ];
    state.expenses = [];
    state.activePeriodId = defaultPeriodId;
    state.paymentMethods = [...DEFAULT_PAYMENTS];
    saveState();
}

// Save current state object to LocalStorage
function saveState() {
    localStorage.setItem('spendwise_data', JSON.stringify(state));
}

// Save state locally and sync to Supabase silently in the background
function saveAndSync() {
    saveState();
    if (supabaseClient && supabaseSession) {
        syncToSupabase();
    }
}

// 2. Toast Notification System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons();

    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// 3. UI Chart Management (Chart.js)
let paymentChartInstance = null;
let statusChartInstance = null;

function renderCharts(filteredExpenses) {
    const paymentCtx = document.getElementById('payment-chart').getContext('2d');
    const statusCtx = document.getElementById('status-chart').getContext('2d');

    // Aggregate Payment Methods
    const paymentCounts = {};
    const paymentMethods = [...state.paymentMethods];
    paymentMethods.forEach(method => paymentCounts[method] = 0);
    
    filteredExpenses.forEach(exp => {
        if (paymentCounts[exp.paymentMethod] !== undefined) {
            paymentCounts[exp.paymentMethod] += exp.value;
        } else {
            paymentCounts[exp.paymentMethod] = exp.value;
        }
    });

    const paymentLabels = Object.keys(paymentCounts).filter(k => paymentCounts[k] > 0);
    const paymentData = paymentLabels.map(k => paymentCounts[k]);

    // Aggregate Statuses (Reserved vs Not Reserved)
    let totalReservedVal = 0;
    let totalPendingVal = 0;
    filteredExpenses.forEach(exp => {
        if (exp.reserved) totalReservedVal += exp.value;
        else totalPendingVal += exp.value;
    });

    const statusLabels = [];
    const statusData = [];
    if (totalReservedVal > 0) {
        statusLabels.push('Reservado');
        statusData.push(totalReservedVal);
    }
    if (totalPendingVal > 0) {
        statusLabels.push('A Reservar');
        statusData.push(totalPendingVal);
    }

    // Chart Theme Styles
    const fontColor = '#9ca3af';

    // Destroy existing chart instances to re-render clean
    if (paymentChartInstance) paymentChartInstance.destroy();
    if (statusChartInstance) statusChartInstance.destroy();

    // 1. Render Payment Method Chart
    if (paymentData.length > 0) {
        paymentChartInstance = new Chart(paymentCtx, {
            type: 'doughnut',
            data: {
                labels: paymentLabels,
                datasets: [{
                    data: paymentData,
                    backgroundColor: [
                        '#6366f1', // Indigo
                        '#3b82f6', // Blue
                        '#10b981', // Emerald
                        '#f59e0b', // Amber
                        '#f43f5e'  // Coral
                    ],
                    borderColor: '#111622',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: fontColor,
                            font: { family: 'Outfit', size: 11 },
                            padding: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Gastos por Forma de Pagamento (R$)',
                        color: '#fff',
                        font: { family: 'Outfit', size: 13, weight: 'bold' },
                        padding: { bottom: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let value = context.raw || 0;
                                return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    } else {
        paymentChartInstance = null;
    }

    // 2. Render Status Chart
    if (statusData.length > 0) {
        statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusData,
                    backgroundColor: [
                        '#10b981', // Emerald (Reserved)
                        '#f43f5e'  // Coral (Pending)
                    ],
                    borderColor: '#111622',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: fontColor,
                            font: { family: 'Outfit', size: 11 },
                            padding: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Situação de Reserva (R$)',
                        color: '#fff',
                        font: { family: 'Outfit', size: 13, weight: 'bold' },
                        padding: { bottom: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let value = context.raw || 0;
                                return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    } else {
        statusChartInstance = null;
    }
}

// 4. Update Summary Metrics
function updateMetrics(filteredExpenses) {
    let total = 0;
    let reserved = 0;
    let pending = 0;

    filteredExpenses.forEach(exp => {
        total += exp.value;
        if (exp.reserved) {
            reserved += exp.value;
        } else {
            pending += exp.value;
        }
    });

    const formatMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('val-total').textContent = formatMoney(total);
    document.getElementById('val-reserved').textContent = formatMoney(reserved);
    document.getElementById('val-pending').textContent = formatMoney(pending);

    const progressPct = total > 0 ? Math.round((reserved / total) * 100) : 0;
    document.getElementById('val-progress-pct').textContent = `${progressPct}%`;
    
    const progressBar = document.getElementById('val-progress-bar');
    progressBar.style.width = `${progressPct}%`;

    const subtext = document.getElementById('val-progress-subtext');
    if (total === 0) {
        subtext.textContent = "Nenhuma despesa para reservar no período.";
        progressBar.style.background = "rgba(255, 255, 255, 0.05)";
    } else if (progressPct === 100) {
        subtext.textContent = "Excelente! Todas as despesas deste período estão cobertas.";
        progressBar.style.background = "linear-gradient(90deg, #10b981, #34d399)";
    } else {
        subtext.textContent = `Faltam ${formatMoney(pending)} para cobrir todas as despesas deste período.`;
        progressBar.style.background = "linear-gradient(90deg, #6366f1, #10b981)";
    }
}

// 5. Populate Period Selector
function renderPeriodSelector() {
    const selector = document.getElementById('filter-period');
    if (!selector) return;
    selector.innerHTML = '';

    const appContainer = document.getElementById('app-container');
    const isAppVisible = appContainer && appContainer.style.display !== 'none';

    if (state.periods.length === 0) {
        if (!isAppVisible) {
            // Do not create a fallback period while the app is hidden/authenticating
            return;
        }
        // Fallback safety period if empty
        const fallbackPeriod = { id: generateId(), name: "Meu Período", createdAt: getTodayString() };
        state.periods.push(fallbackPeriod);
        state.activePeriodId = fallbackPeriod.id;
        saveState();
    }

    state.periods.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        if (p.id === state.activePeriodId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

// 6. Render List of Expenses (Scoped to Current Period & Filters)
function renderList() {
    renderPeriodSelector();

    const listElement = document.getElementById('expenses-list');
    const emptyState = document.getElementById('empty-state');
    
    // Get filter inputs
    const query = document.getElementById('filter-search').value.toLowerCase().trim();
    const paymentFilter = document.getElementById('filter-payment').value;
    const statusFilter = document.getElementById('filter-status').value;
    const sortValue = document.getElementById('sort-expenses').value;

    // Filter by period first, then by search inputs
    let filtered = state.expenses.filter(exp => {
        // Must belong to the current active period
        const belongsToPeriod = exp.periodId === state.activePeriodId;
        if (!belongsToPeriod) return false;

        // Description match
        const matchesQuery = exp.description.toLowerCase().includes(query);
        
        // Payment match
        const matchesPayment = (paymentFilter === 'all' || exp.paymentMethod === paymentFilter);
        
        // Status match
        const matchesStatus = (statusFilter === 'all' || 
                              (statusFilter === 'reservado' && exp.reserved) || 
                              (statusFilter === 'pendente' && !exp.reserved));

        return matchesQuery && matchesPayment && matchesStatus;
    });

    // Sorting
    filtered.sort((a, b) => {
        if (sortValue === 'date-desc') {
            return new Date(b.date) - new Date(a.date);
        } else if (sortValue === 'date-asc') {
            return new Date(a.date) - new Date(b.date);
        } else if (sortValue === 'value-desc') {
            return b.value - a.value;
        } else if (sortValue === 'value-asc') {
            return a.value - b.value;
        }
        return 0;
    });

    // Update Counter
    document.getElementById('expense-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'despesa' : 'despesas'}`;

    listElement.innerHTML = '';

    if (filtered.length === 0) {
        listElement.style.display = 'none';
        emptyState.style.display = 'flex';
    } else {
        listElement.style.display = 'flex';
        emptyState.style.display = 'none';

        filtered.forEach(exp => {
            const item = document.createElement('div');
            item.className = `expense-item glass-card ${exp.reserved ? 'reserved' : 'not-reserved'}`;
            item.id = `item-${exp.id}`;

            let formattedDate = 'Sem data';
            if (exp.date) {
                const parts = exp.date.split('-');
                if (parts.length === 3) {
                    formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
            }

            const formattedVal = exp.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const statusIcon = exp.reserved ? 'shield-check' : 'shield-alert';
            const statusTooltip = exp.reserved ? 'Marcar como Não Reservado' : 'Marcar como Reservado';

            item.innerHTML = `
                <div class="item-reserve-toggle">
                    <button class="toggle-status-btn" onclick="toggleExpenseStatus('${exp.id}')" title="${statusTooltip}">
                        <i data-lucide="${statusIcon}"></i>
                    </button>
                </div>
                <div class="item-details">
                    <span class="item-desc">${escapeHtml(exp.description)}</span>
                    <div class="item-meta">
                        <span class="item-meta-item">
                            <i data-lucide="calendar"></i> ${formattedDate}
                        </span>
                        <span class="payment-tag">${exp.paymentMethod}</span>
                    </div>
                </div>
                <div class="item-value-area">
                    <span class="item-value">${formattedVal}</span>
                    <span class="badge ${exp.reserved ? 'text-emerald' : 'text-coral'}" style="background: rgba(255,255,255,0.02)">
                        ${exp.reserved ? 'Reservado' : 'A Reservar'}
                    </span>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" onclick="openEditModal('${exp.id}')" title="Editar Despesa">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteExpense('${exp.id}')" title="Excluir Despesa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            listElement.appendChild(item);
        });

        lucide.createIcons();
    }

    updateMetrics(filtered);
    renderCharts(filtered);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 7. Actions for Expenses

window.toggleExpenseStatus = function(id) {
    const expense = state.expenses.find(exp => exp.id === id);
    if (expense) {
        expense.reserved = !expense.reserved;
        saveAndSync();
        
        const itemDom = document.getElementById(`item-${id}`);
        if (itemDom) {
            itemDom.classList.toggle('reserved');
            itemDom.classList.toggle('not-reserved');
        }

        renderList();
        
        const statusMsg = expense.reserved ? 'marcada como Reservada!' : 'marcada como Não Reservada.';
        showToast(`Despesa "${expense.description}" ${statusMsg}`, 'success');
    }
};

window.deleteExpense = function(id) {
    const expenseIndex = state.expenses.findIndex(exp => exp.id === id);
    if (expenseIndex !== -1) {
        const desc = state.expenses[expenseIndex].description;
        state.expenses.splice(expenseIndex, 1);
        saveAndSync();
        renderList();
        showToast(`Despesa "${desc}" excluída com sucesso.`, 'success');
    }
};

function updateReservedToggleVisibility() {
    const paymentSelect = document.getElementById('expense-payment');
    const toggleGroup = document.getElementById('reserved-toggle-group');
    const checkbox = document.getElementById('expense-reserved');
    
    if (paymentSelect && toggleGroup) {
        const val = paymentSelect.value;
        if (val === 'Pix' || val === 'Dinheiro') {
            toggleGroup.style.display = 'none';
            if (checkbox) checkbox.checked = true;
        } else {
            toggleGroup.style.display = 'block';
        }
    }
}

function openAddModal() {
    document.getElementById('modal-title').textContent = "Nova Despesa";
    document.getElementById('expense-id').value = "";
    document.getElementById('expense-form').reset();
    document.getElementById('expense-date').value = getTodayString();
    
    updateReservedToggleVisibility();
    
    document.getElementById('expense-modal').classList.add('active');
    document.getElementById('expense-desc').focus();
}

window.openEditModal = function(id) {
    const expense = state.expenses.find(exp => exp.id === id);
    if (expense) {
        document.getElementById('modal-title').textContent = "Editar Despesa";
        document.getElementById('expense-id').value = expense.id;
        document.getElementById('expense-desc').value = expense.description;
        document.getElementById('expense-val').value = expense.value;
        document.getElementById('expense-date').value = expense.date;
        document.getElementById('expense-payment').value = expense.paymentMethod;
        document.getElementById('expense-reserved').checked = expense.reserved;

        updateReservedToggleVisibility();

        document.getElementById('expense-modal').classList.add('active');
        document.getElementById('expense-desc').focus();
    }
};

function closeModal() {
    document.getElementById('expense-modal').classList.remove('active');
}

function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('expense-id').value;
    const desc = document.getElementById('expense-desc').value.trim();
    const val = parseFloat(document.getElementById('expense-val').value);
    const date = document.getElementById('expense-date').value;
    const payment = document.getElementById('expense-payment').value;
    const reserved = document.getElementById('expense-reserved').checked;

    if (!desc || isNaN(val) || val <= 0 || !date || !payment) {
        showToast("Preencha todos os campos corretamente.", "error");
        return;
    }

    if (id) {
        // Edit Mode
        const expense = state.expenses.find(exp => exp.id === id);
        if (expense) {
            expense.description = desc;
            expense.value = val;
            expense.date = date;
            expense.paymentMethod = payment;
            expense.reserved = reserved;
            showToast("Despesa atualizada com sucesso!", "success");
        }
    } else {
        // Add Mode
        const newExpense = {
            id: generateId(),
            periodId: state.activePeriodId,
            description: desc,
            value: val,
            date: date,
            paymentMethod: payment,
            reserved: reserved
        };
        state.expenses.push(newExpense);
        showToast("Nova despesa cadastrada!", "success");
    }

    saveAndSync();
    closeModal();
    renderList();
}

function clearFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-payment').value = 'all';
    document.getElementById('filter-status').value = 'all';
    
    renderList();
    showToast("Filtros de pesquisa limpos.", "info");
}

// 8. Actions for Periods

function openPeriodModal() {
    document.getElementById('period-name').value = '';
    document.getElementById('period-modal').classList.add('active');
    document.getElementById('period-name').focus();
}

function closePeriodModal() {
    document.getElementById('period-modal').classList.remove('active');
}

function handlePeriodFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('period-name').value.trim();
    if (!name) return;

    const newPeriod = {
        id: "p-" + generateId(),
        name: name,
        createdAt: getTodayString()
    };

    state.periods.push(newPeriod);
    // User requested to automatically define the new period as active immediately
    state.activePeriodId = newPeriod.id;

    saveAndSync();
    closePeriodModal();
    renderList();
    showToast(`Período "${name}" criado e definido como ativo!`, "success");
}

function handlePeriodSelectionChange(e) {
    state.activePeriodId = e.target.value;
    saveAndSync();
    renderList();
    
    const activeP = state.periods.find(p => p.id === state.activePeriodId);
    showToast(`Alternado para o período: ${activeP ? activeP.name : ''}`, "info");
}

function deleteActivePeriod() {
    const activeP = state.periods.find(p => p.id === state.activePeriodId);
    if (!activeP) return;

    const name = activeP.name;
    const confirmMsg = `Deseja realmente excluir o período "${name}"?\nIsso apagará todas as despesas cadastradas nele permanentemente.`;
    
    if (confirm(confirmMsg)) {
        // Remove period
        state.periods = state.periods.filter(p => p.id !== state.activePeriodId);
        // Remove associated expenses
        state.expenses = state.expenses.filter(exp => exp.periodId !== state.activePeriodId);

        // Define a new active period
        if (state.periods.length > 0) {
            state.activePeriodId = state.periods[0].id;
        } else {
            // Re-create a default one if none left
            const fallbackP = { id: generateId(), name: "Período Inicial", createdAt: getTodayString() };
            state.periods = [fallbackP];
            state.activePeriodId = fallbackP.id;
        }

        saveAndSync();
        renderList();
        showToast(`Período "${name}" e suas despesas foram excluídos.`, "success");
    }
}

// 8.5 Actions for Custom Payment Methods

function populatePaymentDropdowns() {
    const filterPayment = document.getElementById('filter-payment');
    const expensePayment = document.getElementById('expense-payment');
    
    const currentFilterVal = filterPayment.value || 'all';
    const currentExpenseVal = expensePayment.value || '';

    // Rebuild Filter Selector
    filterPayment.innerHTML = '<option value="all">Todas as formas</option>';
    state.paymentMethods.forEach(method => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method;
        filterPayment.appendChild(option);
    });
    
    if (state.paymentMethods.includes(currentFilterVal) || currentFilterVal === 'all') {
        filterPayment.value = currentFilterVal;
    } else {
        filterPayment.value = 'all';
    }

    // Rebuild Form Selector
    expensePayment.innerHTML = '<option value="" disabled selected>Selecione uma opção</option>';
    state.paymentMethods.forEach(method => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method;
        expensePayment.appendChild(option);
    });
    
    if (state.paymentMethods.includes(currentExpenseVal)) {
        expensePayment.value = currentExpenseVal;
    }
}

function openPaymentMethodsModal() {
    document.getElementById('new-payment-name').value = '';
    document.getElementById('payment-methods-modal').classList.add('active');
    renderPaymentMethodsList();
}

function closePaymentMethodsModal() {
    document.getElementById('payment-methods-modal').classList.remove('active');
    editingPaymentMethodName = null;
}

let editingPaymentMethodName = null;

function renderPaymentMethodsList() {
    const listElement = document.getElementById('payment-methods-list');
    listElement.innerHTML = '';

    state.paymentMethods.forEach(method => {
        const li = document.createElement('li');
        li.className = 'payment-method-item';
        
        if (editingPaymentMethodName === method) {
            // Edit Mode Inline
            li.innerHTML = `
                <div class="input-action-row" style="width: 100%;">
                    <input type="text" id="edit-payment-input" value="${escapeHtml(method)}" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;" required>
                    <button class="btn-icon" onclick="saveEditedPaymentMethod('${escapeHtml(method)}')" title="Salvar alteração" style="color: var(--color-success); border-color: rgba(16, 185, 129, 0.3); background: var(--color-success-bg);">
                        <i data-lucide="check"></i>
                    </button>
                    <button class="btn-icon" onclick="cancelEditingPaymentMethod()" title="Cancelar" style="color: var(--text-muted);">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            `;
            listElement.appendChild(li);
            
            // Autofocus and keyboard bindings
            setTimeout(() => {
                const input = document.getElementById('edit-payment-input');
                if (input) {
                    input.focus();
                    input.select();
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEditedPaymentMethod(method);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditingPaymentMethod();
                        }
                    });
                }
            }, 50);
        } else {
            // Normal Mode
            li.innerHTML = `
                <span class="payment-method-name">${escapeHtml(method)}</span>
                <div style="display: flex; gap: 0.3rem;">
                    <button class="btn-icon" onclick="startEditingPaymentMethod('${escapeHtml(method)}')" title="Editar forma de pagamento">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteCustomPaymentMethod('${escapeHtml(method)}')" title="Excluir forma de pagamento">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            listElement.appendChild(li);
        }
    });

    lucide.createIcons();
}

window.startEditingPaymentMethod = function(name) {
    editingPaymentMethodName = name;
    renderPaymentMethodsList();
};

window.cancelEditingPaymentMethod = function() {
    editingPaymentMethodName = null;
    renderPaymentMethodsList();
};

window.saveEditedPaymentMethod = function(oldName) {
    const input = document.getElementById('edit-payment-input');
    if (!input) return;

    const newName = input.value.trim();
    if (!newName) {
        showToast("O nome da forma de pagamento não pode ser vazio.", "error");
        return;
    }

    if (newName.toLowerCase() === oldName.toLowerCase()) {
        editingPaymentMethodName = null;
        renderPaymentMethodsList();
        return;
    }

    // Duplicate check
    const exists = state.paymentMethods.some(m => m.toLowerCase() === newName.toLowerCase() && m.toLowerCase() !== oldName.toLowerCase());
    if (exists) {
        showToast(`A forma de pagamento "${newName}" já existe.`, "error");
        return;
    }

    // Update in state
    const index = state.paymentMethods.indexOf(oldName);
    if (index !== -1) {
        state.paymentMethods[index] = newName;
    }

    // Cascade update to expenses
    let updatedCount = 0;
    state.expenses.forEach(exp => {
        if (exp.paymentMethod === oldName) {
            exp.paymentMethod = newName;
            updatedCount++;
        }
    });

    saveAndSync();
    editingPaymentMethodName = null;

    populatePaymentDropdowns();
    renderPaymentMethodsList();
    renderList();

    if (updatedCount > 0) {
        showToast(`Forma de pagamento atualizada para "${newName}" e alterada em ${updatedCount} despesa(s).`, "success");
    } else {
        showToast(`Forma de pagamento atualizada para "${newName}".`, "success");
    }
};

window.deleteCustomPaymentMethod = function(name) {
    // Check if any expenses are associated with this method
    const associatedExpensesCount = state.expenses.filter(exp => exp.paymentMethod === name).length;

    if (associatedExpensesCount > 0) {
        const confirmMsg = `A forma de pagamento "${name}" está associada a ${associatedExpensesCount} despesa(s) no sistema.\n\nSe você excluir, estas despesas ainda manterão o nome "${name}" no histórico, mas você não poderá selecionar essa forma de pagamento para novos lançamentos.\n\nDeseja confirmar a exclusão mesmo assim?`;
        if (!confirm(confirmMsg)) {
            return;
        }
    }

    // Perform delete
    state.paymentMethods = state.paymentMethods.filter(m => m !== name);
    saveAndSync();
    
    populatePaymentDropdowns();
    renderPaymentMethodsList();
    renderList(); // Refresh list/charts to sync filters
    showToast(`Forma de pagamento "${name}" excluída com sucesso.`, "success");
};

function handleAddPaymentFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('new-payment-name').value.trim();
    if (!name) return;

    // Duplicate check
    const exists = state.paymentMethods.some(m => m.toLowerCase() === name.toLowerCase());
    if (exists) {
        showToast(`A forma de pagamento "${name}" já existe.`, "error");
        return;
    }

    state.paymentMethods.push(name);
    saveAndSync();

    document.getElementById('new-payment-name').value = '';
    populatePaymentDropdowns();
    renderPaymentMethodsList();
    renderList(); // Sync filters/charts
    showToast(`Forma de pagamento "${name}" adicionada com sucesso!`, "success");
}

// 9. Excel/CSV Export Logic (Formatted to XLSX with green headers, filters, currency format and alignment)
async function exportPeriodToExcel() {
    const activeP = state.periods.find(p => p.id === state.activePeriodId);
    if (!activeP) return;

    // Filter expenses belonging to the current active period
    const periodExpenses = state.expenses.filter(exp => exp.periodId === state.activePeriodId);

    if (periodExpenses.length === 0) {
        showToast("Este período não possui despesas registradas para exportar.", "error");
        return;
    }

    try {
        // Create a new workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Despesas');

        // Set Gridlines visible
        worksheet.views = [{ showGridLines: true }];

        // Set column widths. Columns A and B are empty (width 5)
        worksheet.getColumn('A').width = 5;
        worksheet.getColumn('B').width = 5;
        worksheet.getColumn('C').width = 15; // data
        worksheet.getColumn('D').width = 16; // valor
        worksheet.getColumn('E').width = 45; // Descrição
        worksheet.getColumn('F').width = 22; // Pagamento
        worksheet.getColumn('G').width = 16; // Reservado

        // Add Header row in Row 4
        const headerRow = worksheet.getRow(4);
        headerRow.getCell('C').value = 'data';
        headerRow.getCell('D').value = 'valor';
        headerRow.getCell('E').value = 'Descrição';
        headerRow.getCell('F').value = 'Pagamento';
        headerRow.getCell('G').value = 'Reservado';
        
        headerRow.height = 25;

        // Style headers: Green background (#548c3c) and White Bold Text
        const headerStyle = {
            font: {
                name: 'Segoe UI',
                family: 4,
                size: 11,
                bold: true,
                color: { argb: 'FFFFFFFF' }
            },
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF548C3C' } // leafy/olive green from user's image
            },
            alignment: {
                vertical: 'middle',
                horizontal: 'center'
            },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };

        ['C', 'D', 'E', 'F', 'G'].forEach(col => {
            headerRow.getCell(col).style = headerStyle;
        });

        // Date months in PT-BR shorthand format
        const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

        // Fill Data from Row 5 onwards
        let currentRowIndex = 5;
        
        // Sort expenses by date ascending to mirror timeline
        const sortedExpenses = [...periodExpenses].sort((a, b) => new Date(a.date) - new Date(b.date));

        sortedExpenses.forEach(exp => {
            const row = worksheet.getRow(currentRowIndex);
            
            // Format Date cell (Column C) like "06/nov"
            let dateText = exp.date;
            const dateParts = exp.date.split('-');
            if (dateParts.length === 3) {
                const dayStr = dateParts[2];
                const monthIndex = parseInt(dateParts[1], 10) - 1;
                const monthStr = monthNames[monthIndex] || 'ind';
                dateText = `${dayStr}/${monthStr}`;
            }

            const dateCell = row.getCell('C');
            dateCell.value = dateText;
            dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Value cell (Column D) - raw number formatted as currency
            const valueCell = row.getCell('D');
            valueCell.value = exp.value;
            valueCell.numFmt = '"R$ "#,##0.00'; // R$ 99,50 (aligned right)
            valueCell.alignment = { horizontal: 'right', vertical: 'middle' };

            // Description cell (Column E)
            const descCell = row.getCell('E');
            descCell.value = exp.description;
            descCell.alignment = { horizontal: 'left', vertical: 'middle' };

            // Payment cell (Column F)
            const paymentCell = row.getCell('F');
            paymentCell.value = exp.paymentMethod;
            paymentCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Reserved cell (Column G)
            const reservedCell = row.getCell('G');
            reservedCell.value = exp.reserved ? 'Reservado' : 'Não Reservado';
            reservedCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Apply standard font & thin light gray borders to data cells
            const dataStyle = {
                font: { name: 'Segoe UI', size: 10 },
                border: {
                    top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, // light gray borders
                    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
                }
            };

            ['C', 'D', 'E', 'F', 'G'].forEach(col => {
                const cell = row.getCell(col);
                cell.font = dataStyle.font;
                cell.border = dataStyle.border;
            });

            row.height = 20;
            currentRowIndex++;
        });

        const lastRowIndex = currentRowIndex - 1;

        // Add Auto Filter exactly like in the user's Excel screenshot
        worksheet.autoFilter = `C4:G${lastRowIndex}`;

        // Write to file and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const cleanName = activeP.name.toLowerCase().replace(/[^a-z0-9]/gi, '_');
        const filename = `spendwise_despesas_${cleanName}.xlsx`;

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast("Planilha Excel (.xlsx) gerada com sucesso com filtros e estilos!", "success");
    } catch (e) {
        showToast("Erro ao exportar despesas para Excel.", "error");
        console.error(e);
    }
}

// 9.5 Supabase Integration Logic
let supabaseClient = null;
let supabaseSession = null;
let googleUserEmail = "";
let googleUserName = "";
let googleUserPhoto = "";

// UI Login Gate Transition Helpers
function showApp(shouldRender = true) {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    
    if (shouldRender) {
        renderList();
    }
}

function showLoginGate(showLoader = false, loaderText = 'Autenticando...') {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
    
    const loader = document.getElementById('login-loader');
    const connectBtn = document.getElementById('btn-login-google');
    const loaderTextEl = document.getElementById('loader-text');
    
    if (showLoader) {
        if (loader) loader.style.display = 'flex';
        if (connectBtn) connectBtn.style.display = 'none';
        if (loaderTextEl) loaderTextEl.textContent = loaderText;
    } else {
        if (loader) loader.style.display = 'none';
        if (connectBtn) connectBtn.style.display = 'flex';
    }
}

async function initSupabase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            console.warn("Chaves do Supabase não configuradas no ambiente.");
            updateCloudUI();
            return;
        }
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        console.log("Supabase inicializado.");

        // Check for session on startup
        const { data: { session } } = await supabaseClient.auth.getSession();
        supabaseSession = session;
        
        if (session) {
            googleUserEmail = session.user.email;
            googleUserName = session.user.user_metadata.full_name || "";
            googleUserPhoto = session.user.user_metadata.avatar_url || "";
            
            localStorage.setItem('spendwise_user_email', googleUserEmail);
            localStorage.setItem('spendwise_user_name', googleUserName);
            localStorage.setItem('spendwise_user_photo', googleUserPhoto);

            showLoginGate(true, "Carregando dados da nuvem...");
            try {
                await migrateLocalDataToSupabase();
                await downloadFromSupabase();
                showApp(false); // Already rendered in downloadFromSupabase
            } catch (err) {
                console.error("Erro ao sincronizar dados na inicialização:", err);
                showApp(true); // fallback to local state
            }
        } else {
            // Check if we were logged in locally
            const email = localStorage.getItem('spendwise_user_email');
            if (email) {
                showApp();
            } else {
                showLoginGate(false);
            }
        }

        // Listen for auth state changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            supabaseSession = session;
            if (session) {
                googleUserEmail = session.user.email;
                googleUserName = session.user.user_metadata.full_name || "";
                googleUserPhoto = session.user.user_metadata.avatar_url || "";
                
                localStorage.setItem('spendwise_user_email', googleUserEmail);
                localStorage.setItem('spendwise_user_name', googleUserName);
                localStorage.setItem('spendwise_user_photo', googleUserPhoto);

                updateCloudUI();
            } else {
                handleSignOutClear();
            }
        });
    } catch (err) {
        console.error("Erro ao inicializar Supabase (provavelmente offline):", err);
        const email = localStorage.getItem('spendwise_user_email');
        if (email) {
            showApp();
        } else {
            showLoginGate(false);
        }
        updateCloudUI();
    }
}

async function signInWithGoogle() {
    if (!supabaseClient) {
        showToast("Inicializando cliente... Tente novamente em instantes.", "info");
        return;
    }
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) {
        showToast("Erro ao iniciar login com o Google: " + error.message, "error");
    }
}

async function migrateLocalDataToSupabase() {
    const isMigrated = localStorage.getItem('spendwise_migrated_to_supabase');
    if (isMigrated === 'true' || !supabaseSession) return;

    // Se o estado local não tiver despesas, não há dados reais para migrar
    if (state.expenses.length === 0) {
        localStorage.setItem('spendwise_migrated_to_supabase', 'true');
        return;
    }

    try {
        const userId = supabaseSession.user.id;
        
        // 1. Migrate payment methods
        if (state.paymentMethods && state.paymentMethods.length > 0) {
            const methodsToInsert = state.paymentMethods.map(name => ({ user_id: userId, name: name }));
            
            if (methodsToInsert.length > 0) {
                const { error: pmErr } = await supabaseClient
                    .from('payment_methods')
                    .upsert(methodsToInsert, { onConflict: 'user_id,name' });
                if (pmErr) console.error("Erro ao migrar formas de pagamento:", pmErr);
            }
        }

        // 2. Migrate periods
        if (state.periods && state.periods.length > 0) {
            const periodsToInsert = state.periods.map(p => ({
                id: p.id,
                user_id: userId,
                name: p.name,
                created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString()
            }));

            const { error: pErr } = await supabaseClient
                .from('periods')
                .upsert(periodsToInsert);
            if (pErr) console.error("Erro ao migrar períodos:", pErr);
        }

        // 3. Migrate expenses
        if (state.expenses && state.expenses.length > 0) {
            const expensesToInsert = state.expenses.map(e => ({
                id: e.id,
                user_id: userId,
                period_id: e.periodId,
                description: e.description,
                value: parseFloat(e.value),
                date: e.date,
                payment_method: e.paymentMethod,
                reserved: !!e.reserved,
                created_at: e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString()
            }));

            const { error: eErr } = await supabaseClient
                .from('expenses')
                .upsert(expensesToInsert);
            if (eErr) console.error("Erro ao migrar despesas:", eErr);
        }

        localStorage.setItem('spendwise_migrated_to_supabase', 'true');
        console.log("Migração de dados locais para o Supabase concluída!");
    } catch (err) {
        console.error("Falha na migração automática de dados locais:", err);
    }
}

async function downloadFromSupabase() {
    if (!supabaseSession) return;

    try {
        const userId = supabaseSession.user.id;

        // Fetch periods
        const { data: dbPeriods, error: pErr } = await supabaseClient
            .from('periods')
            .select('*')
            .order('created_at', { ascending: true });
        if (pErr) throw pErr;

        // Fetch expenses
        const { data: dbExpenses, error: eErr } = await supabaseClient
            .from('expenses')
            .select('*');
        if (eErr) throw eErr;

        // Fetch payment methods from Supabase
        const { data: dbPM, error: pmErr } = await supabaseClient
            .from('payment_methods')
            .select('name');
        if (pmErr) throw pmErr;

        // Reconstruct local state
        state.periods = dbPeriods.map(p => ({
            id: p.id,
            name: p.name,
            createdAt: p.created_at ? p.created_at.slice(0, 10) : getTodayString()
        }));

        state.expenses = dbExpenses.map(e => ({
            id: e.id,
            periodId: e.period_id,
            description: e.description,
            value: parseFloat(e.value),
            date: e.date,
            paymentMethod: e.payment_method,
            reserved: e.reserved
        }));

        if (dbPM && dbPM.length > 0) {
            state.paymentMethods = dbPM.map(m => m.name);
        } else {
            // New user, populate with default payment methods
            state.paymentMethods = [...DEFAULT_PAYMENTS];
            const methodsToInsert = DEFAULT_PAYMENTS.map(name => ({ user_id: userId, name: name }));
            await supabaseClient.from('payment_methods').insert(methodsToInsert);
        }

        // Set active period if empty or invalid
        if (state.periods.length > 0) {
            if (!state.activePeriodId || !state.periods.some(p => p.id === state.activePeriodId)) {
                state.activePeriodId = state.periods[0].id;
            }
        } else {
            // Create a default period
            const defaultPeriodId = "p-" + generateId();
            const defaultPeriod = { id: defaultPeriodId, name: "Período Inicial", createdAt: getTodayString() };
            state.periods = [defaultPeriod];
            state.activePeriodId = defaultPeriodId;
            
            // Insert it into Supabase in background
            await supabaseClient.from('periods').insert({
                id: defaultPeriodId,
                user_id: userId,
                name: defaultPeriod.name,
                created_at: new Date().toISOString()
            });
        }

        saveState();
        populatePaymentDropdowns();
        renderList();
    } catch (e) {
        console.error("Erro ao carregar dados do Supabase", e);
        showToast("Erro ao carregar dados da nuvem. Usando versão local.", "warning");
    }
}

async function syncToSupabase() {
    if (!supabaseClient || !supabaseSession) return;

    const userId = supabaseSession.user.id;

    try {
        // Sync periods
        const periodsToUpsert = state.periods.map(p => ({
            id: p.id,
            user_id: userId,
            name: p.name
        }));

        if (periodsToUpsert.length > 0) {
            await supabaseClient.from('periods').upsert(periodsToUpsert);
            
            // Delete periods that no longer exist locally
            const { data: dbPeriods } = await supabaseClient.from('periods').select('id').eq('user_id', userId);
            if (dbPeriods) {
                const localPeriodIds = state.periods.map(p => p.id);
                const periodsToDelete = dbPeriods.map(p => p.id).filter(id => !localPeriodIds.includes(id));
                if (periodsToDelete.length > 0) {
                    await supabaseClient.from('periods').delete().in('id', periodsToDelete);
                }
            }
        } else {
            await supabaseClient.from('periods').delete().eq('user_id', userId);
        }

        // Sync expenses
        const expensesToUpsert = state.expenses.map(e => ({
            id: e.id,
            user_id: userId,
            period_id: e.periodId,
            description: e.description,
            value: parseFloat(e.value),
            date: e.date,
            payment_method: e.paymentMethod,
            reserved: !!e.reserved
        }));

        if (expensesToUpsert.length > 0) {
            await supabaseClient.from('expenses').upsert(expensesToUpsert);

            // Delete expenses that no longer exist locally
            const { data: dbExpenses } = await supabaseClient.from('expenses').select('id').eq('user_id', userId);
            if (dbExpenses) {
                const localExpenseIds = state.expenses.map(e => e.id);
                const expensesToDelete = dbExpenses.map(e => e.id).filter(id => !localExpenseIds.includes(id));
                if (expensesToDelete.length > 0) {
                    await supabaseClient.from('expenses').delete().in('id', expensesToDelete);
                }
            }
        } else {
            await supabaseClient.from('expenses').delete().eq('user_id', userId);
        }

        // Sync all payment methods to Supabase
        const pmToUpsert = state.paymentMethods.map(name => ({
            user_id: userId,
            name: name
        }));

        if (pmToUpsert.length > 0) {
            await supabaseClient.from('payment_methods').upsert(pmToUpsert, { onConflict: 'user_id,name' });
            
            // Delete methods that no longer exist locally
            const { data: dbPM } = await supabaseClient.from('payment_methods').select('name').eq('user_id', userId);
            if (dbPM) {
                const localMethods = state.paymentMethods;
                const methodsToDelete = dbPM
                    .map(m => m.name)
                    .filter(name => !localMethods.includes(name));
                
                if (methodsToDelete.length > 0) {
                    await supabaseClient.from('payment_methods')
                        .delete()
                        .eq('user_id', userId)
                        .in('name', methodsToDelete);
                }
            }
        } else {
            await supabaseClient.from('payment_methods').delete().eq('user_id', userId);
        }

        console.log("Supabase sincronizado.");
    } catch (e) {
        console.error("Falha na sincronização com Supabase:", e);
    }
}

async function disconnectGoogleDrive() {
    if (supabaseClient) {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.warn("Falha ao deslogar do Supabase:", e);
        }
    }
    handleSignOutClear();
    showToast("Desconectado com sucesso.", "info");
}

function handleSignOutClear() {
    supabaseSession = null;
    googleUserEmail = "";
    googleUserName = "";
    googleUserPhoto = "";
    localStorage.removeItem('spendwise_user_email');
    localStorage.removeItem('spendwise_user_name');
    localStorage.removeItem('spendwise_user_photo');
    localStorage.removeItem('spendwise_migrated_to_supabase');
    
    // Clear local state to prevent data remaining visible
    state.periods = [];
    state.expenses = [];
    state.activePeriodId = "";
    state.paymentMethods = [];
    saveState();

    updateCloudUI();
    showLoginGate(false);
}

function updateProfileUI() {
    const dropdownContainer = document.getElementById('profile-dropdown-container');
    const triggerAvatar = document.getElementById('profile-trigger-avatar');
    const popoverAvatar = document.getElementById('popover-avatar');
    const popoverName = document.getElementById('popover-name');
    const popoverEmail = document.getElementById('popover-email');
    const syncBtn = document.getElementById('btn-reconnect-google');

    const email = localStorage.getItem('spendwise_user_email') || googleUserEmail;
    const name = localStorage.getItem('spendwise_user_name') || googleUserName;
    const photo = localStorage.getItem('spendwise_user_photo') || googleUserPhoto;

    if (dropdownContainer) {
        if (email) {
            dropdownContainer.style.display = 'inline-block';
            const avatarUrl = photo || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
            if (triggerAvatar) triggerAvatar.src = avatarUrl;
            if (popoverAvatar) popoverAvatar.src = avatarUrl;
            if (popoverName) popoverName.textContent = name || 'Usuário Google';
            if (popoverEmail) popoverEmail.textContent = email;
            
            if (syncBtn) {
                syncBtn.style.display = 'block';
                const btnText = syncBtn.querySelector('span');
                if (btnText) btnText.textContent = 'Sincronizar Nuvem';
            }
        } else {
            dropdownContainer.style.display = 'none';
            const card = document.getElementById('profile-popover-card');
            if (card) card.classList.remove('active');
        }
    }
}

function toggleProfileDropdown(e) {
    e.stopPropagation();
    const card = document.getElementById('profile-popover-card');
    if (card) {
        card.classList.toggle('active');
    }
}

function updateCloudUI() {
    const statusDot = document.getElementById('cloud-status-dot');
    const statusText = document.getElementById('cloud-status-text');
    const actionsContainer = document.getElementById('cloud-actions-container');

    if (!supabaseClient) {
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'Sem Conexão';
        if (actionsContainer) actionsContainer.style.display = 'none';
        updateProfileUI();
        return;
    }

    if (supabaseSession) {
        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusText) statusText.textContent = googleUserEmail ? `Sincronizado: ${googleUserEmail}` : 'Sincronizado';
        if (actionsContainer) actionsContainer.style.display = 'block';
    } else {
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'Desconectado';
        if (actionsContainer) actionsContainer.style.display = 'none';
    }
    updateProfileUI();
}

async function manualSync() {
    if (!supabaseClient || !supabaseSession) {
        showToast("Conecte-se para sincronizar com a nuvem.", "warning");
        return;
    }
    showToast("Sincronizando dados com o Supabase...", "info");
    try {
        await syncToSupabase();
        await downloadFromSupabase();
        showToast("Sincronização concluída com sucesso!", "success");
    } catch (e) {
        console.error(e);
        showToast("Erro durante a sincronização manual.", "error");
    }
}

// Toggle UI instructions collapsible card
function toggleInstructions() {
    const container = document.querySelector('.help-collapsible');
    const content = document.getElementById('instructions-content');
    
    container.classList.toggle('active');
    if (content.style.display === 'none') {
        content.style.display = 'block';
    } else {
        content.style.display = 'none';
    }
}

// 10. Complete Backup System (JSON Export / Import)
function exportFullBackup() {
    if (state.periods.length === 0 && state.expenses.length === 0) {
        showToast("Não há dados para exportar.", "error");
        return;
    }

    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `spendwise_backup_completo_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showToast("Backup completo exportado com sucesso!", "success");
    } catch (e) {
        showToast("Erro ao exportar backup de dados.", "error");
        console.error(e);
    }
}

function importFullBackup() {
    document.getElementById('import-file-input').click();
}

function handleFileInputChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            
            // Check if it's the new Period-based structure
            if (imported.periods && Array.isArray(imported.periods) && imported.expenses && Array.isArray(imported.expenses)) {
                state = imported;
                if (!state.paymentMethods || state.paymentMethods.length === 0) {
                    state.paymentMethods = [...DEFAULT_PAYMENTS];
                }
            } else if (Array.isArray(imported)) {
                // Compatibility layer: importing old array-only format
                const defaultPeriod = { id: "p-imported", name: "Importado (Antigo)", createdAt: getTodayString() };
                state.periods = [defaultPeriod];
                state.activePeriodId = defaultPeriod.id;
                state.paymentMethods = [...DEFAULT_PAYMENTS];
                state.expenses = imported.map(exp => ({
                    ...exp,
                    periodId: defaultPeriod.id,
                    id: exp.id || generateId()
                }));
            } else {
                throw new Error("Formato de arquivo inválido.");
            }

            saveAndSync();
            populatePaymentDropdowns();
            renderList();
            showToast("Backup importado com sucesso!", "success");
        } catch (err) {
            showToast(`Falha na importação: ${err.message}`, "error");
            console.error(err);
        }
        e.target.value = ''; // Reset input
    };
    reader.readAsText(file);
}

// 11. Event Listeners Initialization
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initial State Load & Login Gate Check
    const cachedToken = localStorage.getItem('spendwise_gdrive_token');
    const email = localStorage.getItem('spendwise_user_email');
    if (cachedToken) {
        showLoginGate(true, "Carregando dados da nuvem...");
    } else if (email) {
        showApp(false); // Do not render inside showApp, we renderList() on DOMContentLoaded
    } else {
        showLoginGate(false);
    }
    loadState();
    
    // Populate Custom Payment Dropdowns
    populatePaymentDropdowns();

    // 2. Initial List rendering (will populate dropdown and charts)
    renderList();

    // Initialize Supabase Client Check and status UI
    initSupabase();
    updateCloudUI();

    // 3. Setup Actions Event Listeners
    document.getElementById('btn-new-expense').addEventListener('click', openAddModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('expense-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('expense-payment').addEventListener('change', updateReservedToggleVisibility);

    // Modal click-outside close
    document.getElementById('expense-modal').addEventListener('click', (e) => {
        if (e.target.id === 'expense-modal') closeModal();
    });

    // 4. Period Management Listeners
    document.getElementById('filter-period').addEventListener('change', handlePeriodSelectionChange);
    document.getElementById('btn-new-period').addEventListener('click', openPeriodModal);
    document.getElementById('btn-close-period-modal').addEventListener('click', closePeriodModal);
    document.getElementById('btn-cancel-period-modal').addEventListener('click', closePeriodModal);
    document.getElementById('period-form').addEventListener('submit', handlePeriodFormSubmit);
    document.getElementById('btn-delete-period').addEventListener('click', deleteActivePeriod);
    
    document.getElementById('period-modal').addEventListener('click', (e) => {
        if (e.target.id === 'period-modal') closePeriodModal();
    });

    // Excel Export Listener
    document.getElementById('btn-export-excel').addEventListener('click', exportPeriodToExcel);

    // 4.5 Custom Payment Methods Listeners
    document.getElementById('btn-manage-payments').addEventListener('click', openPaymentMethodsModal);
    document.getElementById('btn-close-payment-modal').addEventListener('click', closePaymentMethodsModal);
    document.getElementById('btn-close-payment-mgr').addEventListener('click', closePaymentMethodsModal);
    document.getElementById('add-payment-form').addEventListener('submit', handleAddPaymentFormSubmit);

    document.getElementById('payment-methods-modal').addEventListener('click', (e) => {
        if (e.target.id === 'payment-methods-modal') closePaymentMethodsModal();
    });

    // 4.7 Supabase Sync Listeners
    const btnLoginGoogle = document.getElementById('btn-login-google');
    if (btnLoginGoogle) btnLoginGoogle.addEventListener('click', signInWithGoogle);
    
    const btnReconnectGoogle = document.getElementById('btn-reconnect-google');
    if (btnReconnectGoogle) btnReconnectGoogle.addEventListener('click', manualSync);
    
    const btnDisconnectGoogle = document.getElementById('btn-disconnect-google');
    if (btnDisconnectGoogle) btnDisconnectGoogle.addEventListener('click', disconnectGoogleDrive);

    const btnImportBackup = document.getElementById('btn-import-backup');
    if (btnImportBackup) btnImportBackup.addEventListener('click', importFullBackup);

    const btnExportBackup = document.getElementById('btn-export-backup');
    if (btnExportBackup) btnExportBackup.addEventListener('click', exportFullBackup);

    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) importFileInput.addEventListener('change', handleFileInputChange);

    const profileTriggerBtn = document.getElementById('profile-trigger-btn');
    if (profileTriggerBtn) profileTriggerBtn.addEventListener('click', toggleProfileDropdown);

    // 5. Search Filters Listeners
    document.getElementById('filter-search').addEventListener('input', renderList);
    document.getElementById('filter-payment').addEventListener('change', renderList);
    document.getElementById('filter-status').addEventListener('change', renderList);
    document.getElementById('sort-expenses').addEventListener('change', renderList);
    document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);

    // 7. Auto-sync on reconnection
    window.addEventListener('online', () => {
        if (supabaseClient && supabaseSession) {
            syncToSupabase();
        }
    });
});
