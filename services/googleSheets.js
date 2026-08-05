const axios = require('axios');

/**
 * Helper to convert any Google Sheets URL and Tab Name/GID to a direct CSV Export URL
 */
function getCsvUrl(sheetUrl, sheetTab) {
  if (!sheetUrl) return null;
  
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return sheetUrl;
  
  const spreadsheetId = match[1];
  
  // If user provided a specific sheetTab (name or GID)
  if (sheetTab && String(sheetTab).trim()) {
    const tabStr = String(sheetTab).trim();
    // If it's a numeric GID
    if (/^\d+$/.test(tabStr)) {
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${tabStr}`;
    } else {
      // If it's a sheet name (e.g. "Página1", "Leads", "Formulário 1")
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabStr)}`;
    }
  }

  // Fallback to URL's existing gid if present
  let gidParam = '';
  const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/);
  if (gidMatch) {
    gidParam = `&gid=${gidMatch[1]}`;
  }
  
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gidParam}`;
}

/**
 * Robust CSV parser handling quotes and commas
 */
function parseCsv(csvText) {
  const lines = [];
  let currentRow = [];
  let currentToken = '';
  let insideQuote = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentToken += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentToken.trim());
      currentToken = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentToken.trim());
      lines.push(currentRow);
      currentRow = [];
      currentToken = '';
    } else {
      currentToken += char;
    }
  }

  if (currentToken.length > 0 || currentRow.length > 0) {
    currentRow.push(currentToken.trim());
    lines.push(currentRow);
  }

  return lines.filter(row => row.length > 0 && row.some(cell => cell !== ''));
}

/**
 * Fetch leads from Google Sheet CSV (with specific tab support)
 */
async function fetchLeadsFromSheet(sheetUrl, sheetTab) {
  const csvUrl = getCsvUrl(sheetUrl, sheetTab);
  if (!csvUrl) {
    throw new Error('URL da planilha inválida');
  }

  const response = await axios.get(csvUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadQualifierBot/1.0'
    },
    timeout: 6000
  });

  const textData = String(response.data || '');
  if (textData.trim().startsWith('<') || textData.includes('<!DOCTYPE html>') || textData.includes('<html')) {
    throw new Error('Planilha privada ou inacessível. Altere a permissão da planilha no Google Sheets para "Qualquer pessoa com o link pode ver".');
  }

  const rows = parseCsv(textData);
  if (rows.length < 2) {
    return { headers: [], leads: [] };
  }

  const rawHeaders = rows[0].map(h => h.trim());

  // Detect index of standard columns with exact match priority
  const getIndex = (possibleNames) => {
    // 1. Try exact match first
    const exactIdx = rawHeaders.findIndex(h => {
      const lower = h.toLowerCase().trim();
      return possibleNames.some(name => lower === name);
    });
    if (exactIdx >= 0) return exactIdx;

    // 2. Try partial match as fallback
    return rawHeaders.findIndex(h => {
      const lower = h.toLowerCase().trim();
      return possibleNames.some(name => lower.includes(name));
    });
  };

  const idIdx = getIndex(['id', 'lead_id', 'id_do_lead']);
  const emailIdx = getIndex(['email', 'e-mail']);
  const nameIdx = getIndex(['nome_completo', 'nome', 'name', 'full_name']);
  const phoneIdx = getIndex(['telefone', 'phone', 'celular', 'whatsapp', 'phone_number', 'telefone_de_contato']);
  const statusIdx = getIndex(['lead_status', 'status', 'qualificado']);
  const createdIdx = getIndex(['created_time', 'data', 'data_criacao']);
  const cityIdx = getIndex(['cidade', 'city', 'municipio']);
  const stateIdx = getIndex(['estado', 'state', 'uf']);
  const zipIdx = getIndex(['cep', 'zip', 'codigo_postal']);
  const dobIdx = getIndex(['data_de_nascimento', 'nascimento', 'dob']);

  const leads = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const leadId = idIdx >= 0 ? row[idIdx] : null;
    const email = emailIdx >= 0 ? row[emailIdx] : null;
    const name = nameIdx >= 0 ? row[nameIdx] : null;
    const phone = phoneIdx >= 0 ? row[phoneIdx] : null;
    const status = statusIdx >= 0 ? row[statusIdx] : null;
    const createdTime = createdIdx >= 0 ? row[createdIdx] : null;
    const city = cityIdx >= 0 ? row[cityIdx] : null;
    const state = stateIdx >= 0 ? row[stateIdx] : null;
    const zip = zipIdx >= 0 ? row[zipIdx] : null;
    const dob = dobIdx >= 0 ? row[dobIdx] : null;

    // Collect key-value map for all answers
    const answers = {};
    rawHeaders.forEach((header, colIdx) => {
      if (header) {
        answers[header] = row[colIdx] || '';
      }
    });

    // Need at least a lead_id, email, or phone to process
    if (leadId || email || phone || name) {
      leads.push({
        lead_id: leadId || `sheet_lead_${r}_${Date.now()}`,
        email: email || '',
        name: name || '',
        phone: phone || '',
        city: city || '',
        state: state || '',
        zip: zip || '',
        dob: dob || '',
        lead_status: status || 'PENDENTE',
        created_time: createdTime || new Date().toISOString(),
        rowIndex: r + 1,
        answers
      });
    }
  }

  return {
    headers: rawHeaders,
    leads
  };
}

/**
 * Fetch leads from multiple Google Sheets / Tabs for a client (in parallel with safety)
 */
async function fetchLeadsFromMultipleSheets(sheets = []) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { headers: [], leads: [] };
  }

  const validItems = sheets.filter(item => {
    const url = typeof item === 'string' ? item : item?.url;
    return url && url.trim().length > 0;
  });

  const promises = validItems.map(async (item, i) => {
    const sheetUrl = typeof item === 'string' ? item : item.url;
    const sheetTab = typeof item === 'object' ? item.tab : null;
    const sheetName = typeof item === 'object' ? (item.name || `Planilha ${i + 1}`) : `Planilha ${i + 1}`;

    try {
      const res = await fetchLeadsFromSheet(sheetUrl, sheetTab);
      return { success: true, sheetName, ...res };
    } catch (err) {
      console.error(`Aviso: Falha ao ler "${sheetName}":`, err.message);
      return { success: false, sheetName, error: err.message, headers: [], leads: [] };
    }
  });

  const results = await Promise.all(promises);

  const allHeadersSet = new Set();
  const allLeads = [];
  const errors = [];

  results.forEach(res => {
    if (res.headers) res.headers.forEach(h => allHeadersSet.add(h));
    if (res.leads) {
      res.leads.forEach(l => {
        l.sourceSheetName = res.sheetName;
        if (l.answers) l.answers['_origem_planilha'] = res.sheetName;
        allLeads.push(l);
      });
    }
    if (!res.success && res.error) {
      errors.push(`${res.sheetName}: ${res.error}`);
    }
  });

  return {
    headers: Array.from(allHeadersSet),
    leads: allLeads,
    errors
  };
}

/**
 * Generate Google Apps Script code snippet for instant push webhooks
 */
function getAppsScriptSnippet(serverWebhookUrl) {
  return `
/**
 * Script de Automação para Google Sheets -> LeadQualifier System
 * Instalação:
 * 1. Na planilha, clique em Extensões -> Apps Script
 * 2. Cole este código
 * 3. Altere a WEBHOOK_URL abaixo para o endereço do seu servidor
 * 4. Salve e crie um Acionador (Trigger) do tipo "Ao editar" ou "Ao alterar"
 */

const WEBHOOK_URL = "${serverWebhookUrl || 'https://seu-servidor.com/api/webhook/lead'}";

function onFormSubmitTrigger(e) {
  sendLeadToSystem(e);
}

function onEditTrigger(e) {
  // Dispara se a coluna de status for alterada
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowValues = sheet.getRange(range.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var payload = {};
  for (var i = 0; i < headers.length; i++) {
    payload[headers[i]] = rowValues[i];
  }
  
  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      event: "sheet_update",
      data: payload
    })
  });
}
`;
}

module.exports = {
  getCsvUrl,
  parseCsv,
  fetchLeadsFromSheet,
  fetchLeadsFromMultipleSheets,
  getAppsScriptSnippet
};
