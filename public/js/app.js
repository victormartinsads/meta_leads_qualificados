let clients = [];
let currentClientId = null;
let currentLeads = [];
let currentRules = [];
let selectedLeadForModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  renderSheetsForm([]);
  if (checkAuth()) {
    document.getElementById('loginModal').classList.remove('active');
    await loadClients();
  } else {
    document.getElementById('loginModal').classList.add('active');
  }
});

function checkAuth() {
  return sessionStorage.getItem('leadQualifierAuth') === 'true';
}

async function submitLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');

  errorDiv.style.display = 'none';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.setItem('leadQualifierAuth', 'true');
      document.getElementById('loginModal').classList.remove('active');
      await loadClients();
    } else {
      errorDiv.textContent = data.error || 'Usuário ou senha incorretos.';
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = 'Erro ao realizar login: ' + err.message;
    errorDiv.style.display = 'block';
  }
}

function logoutSystem() {
  sessionStorage.removeItem('leadQualifierAuth');
  document.getElementById('loginModal').classList.add('active');
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'logsTab') loadLogs();
  if (tabId === 'clientsTab') renderClientsTable();
}

// ----------------------------------------------------
// CLIENT MANAGEMENT
// ----------------------------------------------------
async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    clients = await res.json();
    
    const select = document.getElementById('clientSelect');
    select.innerHTML = '';

    if (clients.length === 0) {
      select.innerHTML = '<option value="">Nenhum cliente cadastrado</option>';
      currentClientId = null;
      return;
    }

    clients.forEach(client => {
      const opt = document.createElement('option');
      opt.value = client.id;
      opt.textContent = client.name;
      select.appendChild(opt);
    });

    if (!currentClientId && clients.length > 0) {
      currentClientId = clients[0].id;
    }

    select.value = currentClientId;
    await onClientChange();
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}

async function onClientChange() {
  const select = document.getElementById('clientSelect');
  currentClientId = select.value;

  if (!currentClientId) return;

  await loadLeads();
  await loadRules();
  populateRuleColumnSelect();
}

function addSheetRow(sheet = {}) {
  const container = document.getElementById('sheetsContainer');

  const rowDiv = document.createElement('div');
  rowDiv.className = 'sheet-row-item';
  rowDiv.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; background: var(--bg-dark); padding: 0.65rem; border-radius: 8px; border: 1px solid var(--border-color);';

  rowDiv.innerHTML = `
    <input type="text" class="form-control sheet-name-input" placeholder="Nome/Identificador (Ex: Form 1)" value="${sheet.name || ''}" style="flex: 1.2;">
    <input type="url" class="form-control sheet-url-input" placeholder="Link da Planilha (https://docs.google.com/...)" value="${sheet.url || ''}" required style="flex: 2.2;">
    <input type="text" class="form-control sheet-tab-input" placeholder="Nome da Aba/GID (Ex: Leads ou 0)" value="${sheet.tab || ''}" style="flex: 1;">
    <button type="button" class="btn btn-danger" onclick="removeSheetRow(this)" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">🗑️</button>
  `;

  container.appendChild(rowDiv);
}

function removeSheetRow(btn) {
  const container = document.getElementById('sheetsContainer');
  if (container.children.length > 1) {
    btn.closest('.sheet-row-item').remove();
  } else {
    alert('Você precisa manter ao menos 1 planilha/aba conectada.');
  }
}

function getSheetsFromForm() {
  const rows = document.querySelectorAll('.sheet-row-item');
  const sheets = [];
  rows.forEach((row, idx) => {
    const name = row.querySelector('.sheet-name-input').value.trim() || `Planilha ${idx + 1}`;
    const url = row.querySelector('.sheet-url-input').value.trim();
    const tab = row.querySelector('.sheet-tab-input').value.trim();
    if (url) {
      sheets.push({ name, url, tab });
    }
  });
  return sheets;
}

function renderSheetsForm(sheets = []) {
  const container = document.getElementById('sheetsContainer');
  container.innerHTML = '';

  if (!sheets || sheets.length === 0) {
    addSheetRow();
    return;
  }

  sheets.forEach(s => addSheetRow(s));
}

async function saveClientForm(e) {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const name = document.getElementById('clientName').value;
  const pixelId = document.getElementById('clientPixelId').value;
  const accessToken = document.getElementById('clientAccessToken').value;
  const testEventCode = document.getElementById('clientTestEventCode').value;
  const sheets = getSheetsFromForm();

  if (sheets.length === 0) {
    alert('Adicione ao menos uma planilha válida.');
    return;
  }

  const payload = {
    id: id || undefined,
    name,
    sheetUrl: sheets[0].url,
    sheetTab: sheets[0].tab,
    sheets,
    pixelId,
    accessToken,
    testEventCode
  };

  await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  alert('Cliente salvo com sucesso com suas planilhas e abas!');
  resetClientForm();
  await loadClients();
}

function editClient(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;

  document.getElementById('clientId').value = client.id;
  document.getElementById('clientName').value = client.name;
  document.getElementById('clientPixelId').value = client.pixelId;
  document.getElementById('clientAccessToken').value = client.accessToken;
  document.getElementById('clientTestEventCode').value = client.testEventCode || '';
  
  const clientSheets = (Array.isArray(client.sheets) && client.sheets.length > 0)
    ? client.sheets
    : [{ name: 'Planilha Principal', url: client.sheetUrl || '', tab: client.sheetTab || '' }];

  renderSheetsForm(clientSheets);
  switchTab('clientsTab');
}

async function deleteClient(id) {
  if (!confirm('Deseja realmente excluir este cliente e suas regras?')) return;
  await fetch(`/api/clients/${id}`, { method: 'DELETE' });
  await loadClients();
}

function resetClientForm() {
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientPixelId').value = '';
  document.getElementById('clientAccessToken').value = '';
  document.getElementById('clientTestEventCode').value = '';
  renderSheetsForm([]);
}

function renderClientsTable() {
  const tbody = document.getElementById('clientsTableBody');
  tbody.innerHTML = '';

  if (clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum cliente.</td></tr>';
    return;
  }

  clients.forEach(c => {
    const tr = document.createElement('tr');
    const cSheets = (Array.isArray(c.sheets) && c.sheets.length > 0) 
      ? c.sheets 
      : [{ name: 'Planilha Principal', url: c.sheetUrl, tab: c.sheetTab }];

    const sheetsHtml = cSheets.map(s => {
      const tabStr = s.tab ? ` (Aba: ${s.tab})` : '';
      return `<div><a href="${s.url}" target="_blank" style="color: var(--primary);">📄 ${s.name}${tabStr} 🔗</a></div>`;
    }).join('');

    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td><code>${c.pixelId || 'Sem Pixel'}</code></td>
      <td>${sheetsHtml}</td>
      <td>${c.lastSync ? new Date(c.lastSync).toLocaleString('pt-BR') : 'Nunca'}</td>
      <td>
        <button class="btn btn-secondary" onclick="editClient('${c.id}')">✏️ Editar</button>
        <button class="btn btn-danger" onclick="deleteClient('${c.id}')">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// LEADS & QUALIFICATION
// ----------------------------------------------------
async function loadLeads() {
  if (!currentClientId) return;
  try {
    const res = await fetch(`/api/leads?clientId=${currentClientId}`);
    currentLeads = await res.json();
    updateStats();
    renderLeadsTable();
  } catch (err) {
    console.error('Erro ao carregar leads:', err);
  }
}

function updateStats() {
  const total = currentLeads.length;
  const qualified = currentLeads.filter(l => l.lead_status === 'QUALIFICADO').length;
  const pending = currentLeads.filter(l => l.lead_status === 'PENDENTE').length;
  const capi = currentLeads.filter(l => l.metaSent).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statQualified').textContent = qualified;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statCapi').textContent = capi;
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');
  const filter = document.getElementById('filterStatus').value;

  let filtered = currentLeads;
  if (filter !== 'ALL') {
    filtered = currentLeads.filter(l => l.lead_status === filter);
  }

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum lead encontrado para este filtro.</td></tr>';
    return;
  }

  filtered.forEach(lead => {
    const tr = document.createElement('tr');
    
    let statusBadge = `<span class="badge badge-pending">⏳ PENDENTE</span>`;
    if (lead.lead_status === 'QUALIFICADO') {
      statusBadge = `<span class="badge badge-qualified">✅ QUALIFICADO</span>`;
    } else if (lead.lead_status === 'DESQUALIFICADO') {
      statusBadge = `<span class="badge badge-unqualified">❌ DESQUALIFICADO</span>`;
    }

    let capiBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.2); color: var(--text-muted);">Não Enviado</span>`;
    if (lead.metaSent) {
      capiBadge = `<span class="badge badge-meta">🚀 ENVIADO CAPI</span>`;
    } else if (lead.metaError) {
      capiBadge = `<span class="badge badge-unqualified">Erro Meta</span>`;
    }

    const created = lead.created_time ? new Date(lead.created_time).toLocaleString('pt-BR') : '-';

    tr.innerHTML = `
      <td style="font-size: 0.8rem; color: var(--text-muted);">${created}</td>
      <td><code>${lead.lead_id}</code></td>
      <td>
        <strong>${lead.name || 'Lead s/ Nome'}</strong><br>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${lead.email || lead.phone || ''}</span>
      </td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${lead.answers?.ad_name || lead.answers?.campaign_name || 'Nativo Meta'}</td>
      <td>${statusBadge}</td>
      <td>${capiBadge}</td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary" onclick="viewLeadDetails('${lead.lead_id}')">👁️ Ver Respostas</button>
          ${lead.lead_status !== 'QUALIFICADO' ? `
            <button class="btn btn-success" onclick="updateLeadStatus('${lead.lead_id}', 'QUALIFICADO')">✅ Qualificar</button>
          ` : ''}
          ${lead.lead_status !== 'DESQUALIFICADO' ? `
            <button class="btn btn-danger" onclick="updateLeadStatus('${lead.lead_id}', 'DESQUALIFICADO')">❌ Desqualificar</button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateLeadStatus(leadId, status) {
  try {
    const res = await fetch(`/api/leads/${leadId}/qualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        clientId: currentClientId
      })
    });

    const data = await res.json();
    if (data.metaResponse && data.metaResponse.success) {
      alert(`Status atualizado para ${status}! Evento enviado com sucesso para a Conversions API da Meta (CAPI).`);
    } else if (status === 'QUALIFICADO' && data.metaResponse && !data.metaResponse.success) {
      alert(`Status atualizado para ${status}, mas houve um aviso/erro ao enviar ao Meta: ${JSON.stringify(data.metaResponse.error)}`);
    }

    await loadLeads();
  } catch (err) {
    alert('Erro ao atualizar status: ' + err.message);
  }
}

function viewLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.lead_id === leadId);
  if (!lead) return;

  selectedLeadForModal = lead;

  document.getElementById('modalLeadTitle').textContent = `Detalhes de ${lead.name || 'Lead ' + lead.lead_id}`;
  const body = document.getElementById('modalLeadBody');
  body.innerHTML = '';

  const mainItem = document.createElement('div');
  mainItem.className = 'lead-detail-item';
  mainItem.innerHTML = `
    <strong>DADOS DE CONTATO E STATUS</strong>
    <span>Email: ${lead.email || 'Não informado'} | Telefone: ${lead.phone || 'Não informado'}</span><br>
    <span style="font-size: 0.8rem; color: var(--primary);">Motivo da Qualificação: ${lead.qualification_reason || 'Nenhum'}</span>
  `;
  body.appendChild(mainItem);

  if (lead.answers) {
    Object.keys(lead.answers).forEach(question => {
      const item = document.createElement('div');
      item.className = 'lead-detail-item';
      item.innerHTML = `
        <strong>${question}</strong>
        <span>${lead.answers[question] || '(Vazio)'}</span>
      `;
      body.appendChild(item);
    });
  }

  document.getElementById('leadModal').classList.add('active');
}

async function changeLeadStatusFromModal(status) {
  if (!selectedLeadForModal) return;
  closeModal('leadModal');
  await updateLeadStatus(selectedLeadForModal.lead_id, status);
}

// ----------------------------------------------------
// SYNC WITH GOOGLE SHEETS
// ----------------------------------------------------
async function syncCurrentClient() {
  if (!currentClientId) {
    alert('Selecione um cliente primeiro.');
    return;
  }

  const client = clients.find(c => c.id === currentClientId);
  if (!client || !client.sheetUrl) {
    alert('Cadastre a URL da planilha para este cliente nas configurações.');
    return;
  }

  try {
    const res = await fetch(`/api/sync/${currentClientId}`, { method: 'POST' });
    const data = await res.json();
    
    if (res.ok) {
      alert(data.message || 'Planilha sincronizada com sucesso!');
      await loadClients();
      await loadLeads();
      populateRuleColumnSelect();
    } else {
      alert('Erro ao sincronizar: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    alert('Erro de conexão ao sincronizar planilha: ' + err.message);
  }
}

// ----------------------------------------------------
// RULES ENGINE
// ----------------------------------------------------
async function loadRules() {
  if (!currentClientId) return;
  try {
    const res = await fetch(`/api/rules?clientId=${currentClientId}`);
    currentRules = await res.json();
    renderRulesTable();
  } catch (err) {
    console.error('Erro ao carregar regras:', err);
  }
}

function populateRuleColumnSelect() {
  const select = document.getElementById('ruleColumnSelect');
  select.innerHTML = '';

  const client = clients.find(c => c.id === currentClientId);
  const headers = client?.sheetHeaders || [];

  if (headers.length === 0 && currentLeads.length > 0 && currentLeads[0].answers) {
    headers.push(...Object.keys(currentLeads[0].answers));
  }

  if (headers.length === 0) {
    select.innerHTML = '<option value="">Clique em "Sincronizar Planilha" para carregar as perguntas...</option>';
    return;
  }

  headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    select.appendChild(opt);
  });
}

async function saveRule(e) {
  e.preventDefault();
  if (!currentClientId) {
    alert('Selecione um cliente primeiro.');
    return;
  }

  const name = document.getElementById('ruleName').value;
  const column = document.getElementById('ruleColumnSelect').value;
  const operator = document.getElementById('ruleOperator').value;
  const value = document.getElementById('ruleValue').value;
  const action = document.getElementById('ruleAction').value;

  const payload = {
    clientId: currentClientId,
    name,
    column,
    operator,
    value,
    action,
    enabled: true
  };

  await fetch('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  document.getElementById('ruleForm').reset();
  await loadRules();
}

function renderRulesTable() {
  const tbody = document.getElementById('rulesTableBody');
  tbody.innerHTML = '';

  if (currentRules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhuma regra configurada.</td></tr>';
    return;
  }

  currentRules.forEach(r => {
    const tr = document.createElement('tr');
    const actionBadge = r.action === 'QUALIFICADO' ? 
      '<span class="badge badge-qualified">✅ QUALIFICAR</span>' : 
      '<span class="badge badge-unqualified">❌ DESQUALIFICAR</span>';

    tr.innerHTML = `
      <td><strong>${r.name}</strong></td>
      <td><code>${r.column}</code></td>
      <td><span style="color: var(--primary);">${r.operator}</span></td>
      <td><code>"${r.value}"</code></td>
      <td>${actionBadge}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteRule('${r.id}')">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteRule(id) {
  await fetch(`/api/rules/${id}`, { method: 'DELETE' });
  await loadRules();
}

// ----------------------------------------------------
// TEST CAPI & LOGS
// ----------------------------------------------------
function openTestCapiModal() {
  const client = clients.find(c => c.id === currentClientId);
  if (client) {
    document.getElementById('testPixelId').value = client.pixelId || '';
    document.getElementById('testAccessToken').value = client.accessToken || '';
    document.getElementById('testEventCodeInput').value = client.testEventCode || '';
  }
  document.getElementById('testResultOutput').innerHTML = '';
  document.getElementById('testCapiModal').classList.add('active');
}

async function runTestCapi() {
  const pixelId = document.getElementById('testPixelId').value;
  const accessToken = document.getElementById('testAccessToken').value;
  const testEventCode = document.getElementById('testEventCodeInput').value;

  const output = document.getElementById('testResultOutput');
  output.innerHTML = `
    <div style="padding: 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid var(--primary); border-radius: 8px; color: #a5b4fc;">
      ⏳ Enviando evento <strong>QualifiedLead</strong> para a Graph API do Meta...
    </div>
  `;

  try {
    const res = await fetch('/api/test-capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixelId, accessToken, testEventCode })
    });
    const data = await res.json();

    if (data.success) {
      const messagesHtml = data.messages && data.messages.length > 0 
        ? `<div style="margin-top: 0.5rem; color: #fbbf24;">⚠️ Avisos da Meta: ${JSON.stringify(data.messages)}</div>`
        : '';

      const testCodeTip = testEventCode ? `
        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-main);">
          💡 <strong>Abra o Gerenciador de Eventos da Meta:</strong> Vá na aba <em>"Testar Eventos"</em>. O evento com o código <code>${testEventCode}</code> deve aparecer em alguns segundos!
        </div>
      ` : `
        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: #fbbf24;">
          ⚠️ <strong>Dica:</strong> Insira o <strong>Test Event Code</strong> (copiado da aba <em>Testar Eventos</em> do Meta) para ver a resposta aparecer ao vivo na tela do Meta.
        </div>
      `;

      output.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; padding: 1.25rem; border-radius: 10px; color: #34d399; margin-bottom: 1rem;">
          <div style="font-size: 1.05rem; font-weight: 700;">✅ SUCESSO! Evento Aceito pela Meta Ads (HTTP 200)</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">
            Events Received: <strong>${data.eventsReceived}</strong> | FB Trace ID: <code>${data.fbtraceId || 'N/A'}</code>
          </div>
          ${messagesHtml}
          ${testCodeTip}
        </div>
        
        <details open style="background: var(--bg-dark); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.8rem;">
          <summary style="cursor: pointer; font-weight: 600; color: var(--text-muted);">📋 Ver Payload JSON Enviado para a Meta Graph API</summary>
          <pre class="code-block" style="margin-top: 0.5rem;">${JSON.stringify(data.sentPayload, null, 2)}</pre>
        </details>
      `;
    } else {
      output.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 1.25rem; border-radius: 10px; color: #f87171; margin-bottom: 1rem;">
          <div style="font-size: 1.05rem; font-weight: 700;">❌ ERRO DE VALIDAÇÃO META CAPI</div>
          <pre style="white-space: pre-wrap; font-size: 0.8rem; margin-top: 0.5rem; background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: 6px;">${JSON.stringify(data.error, null, 2)}</pre>
        </div>

        <details open style="background: var(--bg-dark); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.8rem;">
          <summary style="cursor: pointer; font-weight: 600; color: var(--text-muted);">📋 Ver Payload Tentado</summary>
          <pre class="code-block" style="margin-top: 0.5rem;">${JSON.stringify(data.sentPayload, null, 2)}</pre>
        </details>
      `;
    }
  } catch (err) {
    output.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 1rem; border-radius: 8px; color: #f87171;">
        <strong>Erro de conexão com o servidor local:</strong> ${err.message}
      </div>
    `;
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();

    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum log registrado.</td></tr>';
      return;
    }

    logs.forEach(log => {
      const tr = document.createElement('tr');
      const time = new Date(log.timestamp).toLocaleString('pt-BR');
      tr.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--text-muted);">${time}</td>
        <td><code>${log.type}</code></td>
        <td>${log.message}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar logs:', err);
  }
}

async function copyAppsScriptSnippet() {
  try {
    const res = await fetch('/api/script-snippet');
    const script = await res.text();
    await navigator.clipboard.writeText(script);
    alert('Script do Apps Script copiado para a sua área de transferência!');
  } catch (err) {
    alert('Erro ao copiar script: ' + err.message);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}
