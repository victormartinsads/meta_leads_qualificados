const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./config/store');
const { fetchLeadsFromSheet, fetchLeadsFromMultipleSheets, getAppsScriptSnippet } = require('./services/googleSheets');
const { qualifyLead } = require('./services/qualifier');
const { sendMetaCapiEvent, sendMetaCapiEventsBatch } = require('./services/metaCapi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// AUTHENTICATION API
// ----------------------------------------------------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === '@agenciaand' && password === '@agenciaand') {
    return res.json({ success: true, message: 'Autenticado com sucesso!' });
  }
  return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos.' });
});

// ----------------------------------------------------
// CLIENTS API
// ----------------------------------------------------
app.get('/api/clients', (req, res) => {
  res.json(store.getClients());
});

app.post('/api/clients', (req, res) => {
  const client = store.saveClient(req.body);
  store.addLog({ type: 'CLIENT_SAVE', message: `Cliente "${client.name}" salvo.` });
  res.json(client);
});

app.delete('/api/clients/:id', (req, res) => {
  store.deleteClient(req.params.id);
  store.addLog({ type: 'CLIENT_DELETE', message: `Cliente ID "${req.params.id}" removido.` });
  res.json({ success: true });
});

// ----------------------------------------------------
// RULES API
// ----------------------------------------------------
app.get('/api/rules', (req, res) => {
  const { clientId } = req.query;
  res.json(store.getRules(clientId));
});

app.post('/api/rules', (req, res) => {
  const rule = store.saveRule(req.body);
  store.addLog({ type: 'RULE_SAVE', message: `Regra "${rule.name}" salva.` });
  res.json(rule);
});

app.delete('/api/rules/:id', (req, res) => {
  store.deleteRule(req.params.id);
  res.json({ success: true });
});

// ----------------------------------------------------
// LEADS & QUALIFICATION API
// ----------------------------------------------------
app.get('/api/leads', (req, res) => {
  const { clientId } = req.query;
  res.json(store.getLeads(clientId));
});

/**
 * Manually update lead qualification and send to Meta CAPI if qualified
 */
app.post('/api/leads/:leadId/qualify', async (req, res) => {
  const { leadId } = req.params;
  const { status, clientId, customReason } = req.body; // QUALIFICADO, DESQUALIFICADO

  const leads = store.getLeads(clientId);
  const lead = leads.find(l => l.lead_id === leadId);

  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado' });
  }

  const client = store.getClients().find(c => c.id === (clientId || lead.clientId));
  lead.lead_status = status;
  lead.qualification_reason = customReason || `Qualificação manual como ${status}`;

  let metaResponse = null;

  if (status === 'QUALIFICADO' && client && client.pixelId && client.accessToken) {
    store.addLog({
      type: 'META_CAPI_DISPATCH',
      clientId: client.id,
      message: `Enviando lead "${lead.name || lead.lead_id}" para o Meta CAPI...`
    });

    metaResponse = await sendMetaCapiEvent({
      pixelId: client.pixelId,
      accessToken: client.accessToken,
      testEventCode: client.testEventCode,
      eventName: 'QualifiedLead',
      leadId: lead.lead_id,
      email: lead.email,
      phone: lead.phone,
      fullName: lead.name,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      dob: lead.dob,
      customData: {
        reason: lead.qualification_reason,
        manual: true
      }
    });

    if (metaResponse.success) {
      lead.metaSent = true;
      lead.metaSentAt = new Date().toISOString();
      store.addLog({
        type: 'META_CAPI_SUCCESS',
        clientId: client.id,
        message: `Evento QualifiedLead enviado com SUCESSO para o Meta Ads (Lead ID: ${lead.lead_id}). Trace ID: ${metaResponse.fbtraceId || 'OK'}`
      });
    } else {
      lead.metaSent = false;
      lead.metaError = metaResponse.error;
      store.addLog({
        type: 'META_CAPI_ERROR',
        clientId: client.id,
        message: `Erro ao enviar evento CAPI para Meta: ${JSON.stringify(metaResponse.error)}`
      });
    }
  }

  store.saveLead(lead);
  res.json({ lead, metaResponse });
});

// ----------------------------------------------------
// SYNC WITH GOOGLE SHEETS & META
// ----------------------------------------------------
async function syncClientSheet(clientId) {
  const client = store.getClients().find(c => c.id === clientId);
  if (!client) {
    throw new Error('Cliente não encontrado');
  }

  const clientSheets = (Array.isArray(client.sheets) && client.sheets.length > 0)
    ? client.sheets
    : [{ name: 'Planilha Principal', url: client.sheetUrl, tab: client.sheetTab }];

  const validSheets = clientSheets.filter(s => s && s.url && s.url.trim());
  if (validSheets.length === 0) {
    throw new Error('Nenhuma URL de planilha cadastrada para este cliente.');
  }

  store.addLog({
    type: 'SHEET_SYNC_START',
    clientId,
    message: `Sincronizando ${validSheets.length} planilha(s)/aba(s) do cliente "${client.name}"...`
  });

  const { headers, leads: rawLeads, errors } = await fetchLeadsFromMultipleSheets(validSheets);
  const rules = store.getRules(clientId);

  let newLeadsCount = 0;
  let autoQualifiedCount = 0;
  let capiSentCount = 0;

  const existingLeads = store.getLeads(clientId);

  const pendingCapiLeads = [];
  const leadsToSave = [];

  for (const rawLead of rawLeads) {
    rawLead.clientId = clientId;

    const existing = existingLeads.find(l => l.lead_id === rawLead.lead_id);
    const result = qualifyLead(rawLead, rules);

    const mergedLead = {
      ...rawLead,
      lead_status: existing?.metaSent ? existing.lead_status : result.status,
      qualification_reason: result.reason,
      metaSent: existing ? existing.metaSent : false,
      metaSentAt: existing ? existing.metaSentAt : null
    };

    if (!existing) newLeadsCount++;

    if (mergedLead.lead_status === 'QUALIFICADO' && !mergedLead.metaSent && client.pixelId && client.accessToken) {
      autoQualifiedCount++;
      pendingCapiLeads.push({
        ...mergedLead,
        reason: result.reason,
        ruleName: result.matchedRule ? result.matchedRule.name : 'Auto'
      });
    }

    leadsToSave.push(mergedLead);
  }

  // Batch send to Meta CAPI in 1 fast HTTP request instead of slow individual calls
  if (pendingCapiLeads.length > 0) {
    const batchRes = await sendMetaCapiEventsBatch({
      pixelId: client.pixelId,
      accessToken: client.accessToken,
      testEventCode: client.testEventCode,
      leads: pendingCapiLeads
    });

    const nowIso = new Date().toISOString();
    if (batchRes.success) {
      capiSentCount = pendingCapiLeads.length;
      const sentIds = new Set(pendingCapiLeads.map(l => l.lead_id));
      leadsToSave.forEach(l => {
        if (sentIds.has(l.lead_id)) {
          l.metaSent = true;
          l.metaSentAt = nowIso;
        }
      });
    } else {
      const errStr = JSON.stringify(batchRes.error || {});
      leadsToSave.forEach(l => {
        if (pendingCapiLeads.some(p => p.lead_id === l.lead_id)) {
          l.metaError = errStr;
        }
      });
    }
  }

  leadsToSave.forEach(l => store.saveLead(l));

  client.lastSync = new Date().toISOString();
  client.sheetHeaders = headers;
  store.saveClient(client);

  let summaryMessage = `Sincronização concluída: ${rawLeads.length} leads importados de ${validSheets.length} planilha(s). ${newLeadsCount} novos, ${autoQualifiedCount} qualificados por regras e ${capiSentCount} enviados ao Meta.`;
  
  if (errors && errors.length > 0) {
    summaryMessage += ` (Aviso: ${errors.join(' | ')})`;
  }

  store.addLog({
    type: 'SHEET_SYNC_COMPLETE',
    clientId,
    message: summaryMessage
  });

  return {
    headers,
    totalLeads: rawLeads.length,
    newLeadsCount,
    autoQualifiedCount,
    capiSentCount,
    errors,
    message: summaryMessage
  };
}

app.post('/api/sync/:clientId', async (req, res) => {
  try {
    const result = await syncClientSheet(req.params.clientId);
    res.json(result);
  } catch (err) {
    store.addLog({
      type: 'SHEET_SYNC_ERROR',
      clientId: req.params.clientId,
      message: `Erro na sincronização da planilha: ${err.message}`
    });
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// TEST CAPI CONNECTION
// ----------------------------------------------------
app.post('/api/test-capi', async (req, res) => {
  const { pixelId, accessToken, testEventCode } = req.body;
  
  if (!pixelId || !accessToken) {
    return res.status(400).json({ error: 'Pixel ID e Access Token são obrigatórios para teste.' });
  }

  const result = await sendMetaCapiEvent({
    pixelId,
    accessToken,
    testEventCode: testEventCode ? testEventCode.trim() : null,
    eventName: 'QualifiedLead',
    leadId: null, // Don't send fake lead_id in synthetic test
    email: 'teste_qualificado_' + Date.now() + '@exemplo.com.br',
    phone: '5511999999999',
    fullName: 'Lead Teste Qualificado',
    customData: { test: true, environment: 'local_test' }
  });

  res.json(result);
});

// ----------------------------------------------------
// WEBHOOK & UTILS
// ----------------------------------------------------
app.post('/api/webhook/lead', async (req, res) => {
  store.addLog({
    type: 'WEBHOOK_RECEIVED',
    message: `Webhook de lead recebido: ${JSON.stringify(req.body)}`
  });
  res.json({ received: true });
});

app.get('/api/logs', (req, res) => {
  res.json(store.getLogs());
});

app.get('/api/script-snippet', (req, res) => {
  const hostUrl = `${req.protocol}://${req.get('host')}/api/webhook/lead`;
  res.send(getAppsScriptSnippet(hostUrl));
});

// ----------------------------------------------------
// AUTOMATIC BACKGROUND SYNC SCHEDULER (Every 15m)
// ----------------------------------------------------
setInterval(async () => {
  const clients = store.getClients();
  for (const client of clients) {
    if (client.autoSync && client.sheetUrl) {
      try {
        await syncClientSheet(client.id);
      } catch (err) {
        console.error(`Error auto-syncing client ${client.name}:`, err.message);
      }
    }
  }
}, 15 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SERVIDOR LEAD QUALIFIER RODANDO EM: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
