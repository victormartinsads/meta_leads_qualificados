/**
 * Lead Qualification Rule Engine
 */

function evaluateRule(answerValue, operator, targetValue) {
  if (answerValue === undefined || answerValue === null) answerValue = '';
  const valStr = String(answerValue).trim().toLowerCase();
  const targetStr = String(targetValue || '').trim().toLowerCase();

  switch (operator) {
    case 'contains':
      return valStr.includes(targetStr);
    
    case 'not_contains':
      return !valStr.includes(targetStr);

    case 'equals':
      return valStr === targetStr;

    case 'not_equals':
      return valStr !== targetStr;

    case 'starts_with':
      return valStr.startsWith(targetStr);

    case 'in_list':
      const list = targetStr.split(',').map(s => s.trim()).filter(Boolean);
      return list.some(item => valStr.includes(item));

    case 'greater_than':
      const numAnswerG = parseFloat(valStr.replace(/[^\d.-]/g, ''));
      const numTargetG = parseFloat(targetStr.replace(/[^\d.-]/g, ''));
      if (isNaN(numAnswerG) || isNaN(numTargetG)) return false;
      return numAnswerG >= numTargetG;

    case 'less_than':
      const numAnswerL = parseFloat(valStr.replace(/[^\d.-]/g, ''));
      const numTargetL = parseFloat(targetStr.replace(/[^\d.-]/g, ''));
      if (isNaN(numAnswerL) || isNaN(numTargetL)) return false;
      return numAnswerL <= numTargetL;

    default:
      return false;
  }
}

/**
 * Evaluate lead against client rules
 */
function qualifyLead(lead, rules = []) {
  const activeRules = rules.filter(r => r.enabled !== false);
  const answers = lead.answers || {};

  // If lead already explicitly marked in Google Sheets
  const sheetStatus = String(lead.lead_status || '').toUpperCase();
  if (sheetStatus.includes('QUALIFICADO') && !sheetStatus.includes('DESQUALIFICADO')) {
    return {
      status: 'QUALIFICADO',
      reason: 'Status definido manualmente na planilha como QUALIFICADO',
      matchedRule: null
    };
  } else if (sheetStatus.includes('DESQUALIFICADO') || sheetStatus.includes('LIXO')) {
    return {
      status: 'DESQUALIFICADO',
      reason: 'Status definido na planilha como DESQUALIFICADO',
      matchedRule: null
    };
  }

  if (activeRules.length === 0) {
    return {
      status: 'PENDENTE',
      reason: 'Sem regras ativas configuradas para este cliente',
      matchedRule: null
    };
  }

  const matchedReasons = [];

  for (const rule of activeRules) {
    // Find matching column in answers (case-insensitive key lookup)
    const colKey = Object.keys(answers).find(
      k => k.toLowerCase() === (rule.column || '').toLowerCase()
    ) || rule.column;

    const answerVal = answers[colKey] !== undefined ? answers[colKey] : answers[rule.column];
    const isMatch = evaluateRule(answerVal, rule.operator, rule.value);

    if (isMatch) {
      matchedReasons.push(`Regra "${rule.name}": [${rule.column}] ${rule.operator} "${rule.value}" (Valor recebido: "${answerVal}")`);
      
      if (rule.action === 'QUALIFICADO') {
        return {
          status: 'QUALIFICADO',
          reason: matchedReasons.join(' | '),
          matchedRule: rule
        };
      } else if (rule.action === 'DESQUALIFICADO') {
        return {
          status: 'DESQUALIFICADO',
          reason: matchedReasons.join(' | '),
          matchedRule: rule
        };
      }
    }
  }

  return {
    status: 'PENDENTE',
    reason: 'Não atingiu os critérios de regras automáticas',
    matchedRule: null
  };
}

module.exports = {
  evaluateRule,
  qualifyLead
};
