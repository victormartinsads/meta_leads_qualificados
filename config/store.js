const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// Default Database Structure
const defaultData = {
  clients: [
    {
      id: 'client_demo',
      name: 'Cliente Exemplo - Tributário',
      pixelId: '',
      accessToken: '',
      testEventCode: '',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1Cg1eD1P7UgfupxK3s-6cXODaLwTDxmON2tRlKhVYTSQ/edit?usp=sharing',
      autoSync: true,
      syncIntervalMinutes: 15,
      lastSync: null,
      createdAt: new Date().toISOString()
    }
  ],
  rules: [
    {
      id: 'rule_1',
      clientId: 'client_demo',
      name: 'Dívida Alta Tributária',
      column: 'qual_o_valor_da_dívida_tribtuária',
      operator: 'contains', // contains, equals, not_contains, in_list, greater_than
      value: '100 mil',
      action: 'QUALIFICADO', // QUALIFICADO, DESQUALIFICADO
      enabled: true
    },
    {
      id: 'rule_2',
      clientId: 'client_demo',
      name: 'Prioridade Alta',
      column: 'qual_seu_nível_de_prioridade_para_quitar_essa_dívida?',
      operator: 'contains',
      value: 'Imediata',
      action: 'QUALIFICADO',
      enabled: true
    }
  ],
  leads: [],
  logs: []
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function getDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json, returning default', err);
    return defaultData;
  }
}

function saveDb(data) {
  ensureDb();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  getDb,
  saveDb,
  getClients: () => getDb().clients || [],
  saveClient: (client) => {
    const db = getDb();
    const idx = db.clients.findIndex(c => c.id === client.id);
    if (idx >= 0) {
      db.clients[idx] = { ...db.clients[idx], ...client };
    } else {
      client.id = client.id || 'client_' + Date.now();
      client.createdAt = new Date().toISOString();
      db.clients.push(client);
    }
    saveDb(db);
    return client;
  },
  deleteClient: (id) => {
    const db = getDb();
    db.clients = db.clients.filter(c => c.id !== id);
    db.rules = db.rules.filter(r => r.clientId !== id);
    saveDb(db);
  },
  getRules: (clientId) => {
    const db = getDb();
    if (clientId) return db.rules.filter(r => r.clientId === clientId);
    return db.rules || [];
  },
  saveRule: (rule) => {
    const db = getDb();
    const idx = db.rules.findIndex(r => r.id === rule.id);
    if (idx >= 0) {
      db.rules[idx] = { ...db.rules[idx], ...rule };
    } else {
      rule.id = rule.id || 'rule_' + Date.now();
      db.rules.push(rule);
    }
    saveDb(db);
    return rule;
  },
  deleteRule: (id) => {
    const db = getDb();
    db.rules = db.rules.filter(r => r.id !== id);
    saveDb(db);
  },
  getLeads: (clientId) => {
    const db = getDb();
    if (clientId) return db.leads.filter(l => l.clientId === clientId);
    return db.leads || [];
  },
  saveLead: (lead) => {
    const db = getDb();
    const idx = db.leads.findIndex(l => l.lead_id === lead.lead_id || (l.id && l.id === lead.id));
    if (idx >= 0) {
      db.leads[idx] = { ...db.leads[idx], ...lead, updatedAt: new Date().toISOString() };
    } else {
      lead.updatedAt = new Date().toISOString();
      db.leads.push(lead);
    }
    saveDb(db);
    return lead;
  },
  saveLeadsBatch: (leads) => {
    const db = getDb();
    for (const lead of leads) {
      const idx = db.leads.findIndex(l => l.lead_id === lead.lead_id || (l.id && l.id === lead.id));
      if (idx >= 0) {
        db.leads[idx] = { ...db.leads[idx], ...lead, updatedAt: new Date().toISOString() };
      } else {
        lead.updatedAt = new Date().toISOString();
        db.leads.push(lead);
      }
    }
    saveDb(db);
  },
  addLog: (log) => {
    const db = getDb();
    db.logs.unshift({
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      ...log
    });
    // Keep max 200 logs
    if (db.logs.length > 200) db.logs = db.logs.slice(0, 200);
    saveDb(db);
  },
  getLogs: () => getDb().logs || []
};
