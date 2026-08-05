const crypto = require('crypto');
const axios = require('axios');

/**
 * Meta Advanced Matching SHA-256 Hashing Helper
 * Standard: lowercase, trimmed, SHA-256 hex string.
 */
function hashSha256(value) {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Normalize phone to E.164 format before hashing
 * Brazil format: 55 + DDD + number (no spaces, dashes or parens)
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return hashSha256(digits);
}

/**
 * Normalize and extract First and Last name
 */
function extractNames(fullName) {
  if (!fullName) return { fn: null, ln: null };
  const parts = String(fullName).trim().split(/\s+/);
  const fn = hashSha256(parts[0]);
  const ln = parts.length > 1 ? hashSha256(parts.slice(1).join(' ')) : null;
  return { fn, ln };
}

/**
 * Normalize state (e.g. "São Paulo" -> "sp", "RJ" -> "rj")
 */
function normalizeState(state) {
  if (!state) return null;
  const str = String(state).trim().toLowerCase();
  if (str.length === 2) return hashSha256(str);
  if (str.includes('são paulo') || str.includes('sao paulo')) return hashSha256('sp');
  if (str.includes('rio de janeiro')) return hashSha256('rj');
  if (str.includes('minas')) return hashSha256('mg');
  return hashSha256(str.slice(0, 2));
}

/**
 * Send conversion event to Meta Conversions API for Leads (Conversion Leads)
 * Fully compliant with Meta Advanced Matching & High Event Match Quality (EMQ)
 */
async function sendMetaCapiEvent({
  pixelId,
  accessToken,
  testEventCode,
  eventName = 'QualifiedLead',
  leadId,
  email,
  phone,
  fullName,
  city,
  state,
  country = 'br',
  value = 0,
  currency = 'BRL',
  customData = {}
}) {
  if (!pixelId || !accessToken) {
    throw new Error('Pixel ID / Dataset ID e Access Token do Meta Ads são obrigatórios.');
  }

  const { fn, ln } = extractNames(fullName);
  const hashedEmail = hashSha256(email || 'lead_qualificado@exemplo.com.br');
  const hashedPhone = normalizePhone(phone || '5511999999999');
  const hashedCountry = hashSha256(country || 'br');
  const hashedExternalId = hashSha256(leadId || email || phone || 'lead_' + Date.now());

  // User Data Object for Full Advanced Matching (Máxima Pontuação de Qualidade EMQ)
  const userData = {
    em: [hashedEmail],
    ph: [hashedPhone],
    country: [hashedCountry],
    external_id: [hashedExternalId]
  };

  // Only pass lead_id in user_data if it's a valid numeric digits string from Meta Lead Ads
  if (leadId && /^\d+$/.test(String(leadId).trim())) {
    userData.lead_id = String(leadId).trim();
  }

  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (city) userData.ct = [hashSha256(city)];
  if (state) userData.st = [normalizeState(state)];

  const payload = {
    data: [
      {
        event_name: eventName, // Standard event: QualifiedLead, Lead, ConvertedLead, etc.
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'system_generated', // Official action_source for CRM / CAPI for Leads
        event_source_url: 'http://localhost:3000',
        user_data: userData,
        custom_data: {
          currency: currency || 'BRL',
          value: parseFloat(value) || 0,
          lead_event_source: 'Google Sheets / Meta Lead Ads',
          lead_status: 'QUALIFICADO',
          ...customData
        }
      }
    ]
  };

  if (testEventCode && testEventCode.trim()) {
    payload.test_event_code = testEventCode.trim().toUpperCase();
  }

  const cleanPixelId = String(pixelId).trim();
  const cleanToken = String(accessToken).trim();
  const url = `https://graph.facebook.com/v20.0/${cleanPixelId}/events?access_token=${cleanToken}`;

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return {
      success: true,
      data: response.data,
      eventsReceived: response.data?.events_received || 1,
      messages: response.data?.messages || [],
      fbtraceId: response.data?.fbtrace_id,
      sentPayload: payload
    };
  } catch (error) {
    const errorDetails = error.response?.data || { message: error.message };
    console.error('Meta CAPI Error:', JSON.stringify(errorDetails));
    return {
      success: false,
      error: errorDetails,
      sentPayload: payload
    };
  }
}

module.exports = {
  sendMetaCapiEvent,
  hashSha256,
  normalizePhone,
  extractNames
};
