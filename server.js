// server.js
// AI-powered lead capture backend.
// Handles: /api/chat (talks to the visitor, decides when to capture a lead)
//          /api/health (sanity check)
//
// Setup: copy .env.example to .env and fill in your keys, then:
//   npm install
//   node server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a friendly, efficient sales assistant for a company offering three services: (1) Real Estate, (2) Trading (financial/commodities trading), and (3) POS and IT Solutions.
Your job: figure out which service(s) the visitor is interested in, understand their need in 1-2 sentences, and collect their name and a phone number or email — one question at a time. Do not be pushy or repetitive. Keep every message under 3 sentences.
Once you have: name, contact (phone or email), interest area, and a short note on their need, call the save_lead tool with that data, then send a short warm closing message thanking them and saying someone will follow up soon. Only call save_lead once, and only with complete data.`;

const SAVE_LEAD_TOOL = {
  name: 'save_lead',
  description: 'Save a captured lead once name, contact info, and service interest are known.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      contact: { type: 'string', description: 'phone number or email' },
      interest: { type: 'string', description: 'Real Estate, Trading, or POS & IT Solutions' },
      need: { type: 'string', description: 'brief note on what they need' }
    },
    required: ['name', 'contact', 'interest']
  }
};

// ---------- Lead delivery: email + Google Sheet + (later) CRM ----------

async function sendLeadEmail(lead) {
  if (!process.env.SMTP_HOST) return; // email not configured, skip quietly
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.LEAD_NOTIFY_EMAIL,
    subject: `New lead: ${lead.name} (${lead.interest})`,
    text: `Name: ${lead.name}\nContact: ${lead.contact}\nInterest: ${lead.interest}\nNeed: ${lead.need || '-'}\nCaptured: ${lead.capturedAt}`
  });
}

async function appendToSheet(lead) {
  if (!process.env.GOOGLE_SHEET_ID) return; // sheet not configured, skip quietly
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON, // path to service account key file
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Leads!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[lead.capturedAt, lead.name, lead.contact, lead.interest, lead.need || '']]
    }
  });
}

// Placeholder for later CRM integration (HubSpot, Salesforce, etc.)
async function pushToCrm(lead) {
  // TODO: wire this up when you pick a CRM.
  // Example shape for HubSpot contacts API is straightforward to add here.
  return;
}

async function saveLead(lead) {
  const enriched = { ...lead, capturedAt: new Date().toISOString() };
  const results = await Promise.allSettled([
    sendLeadEmail(enriched),
    appendToSheet(enriched),
    pushToCrm(enriched)
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(['email', 'sheet', 'crm'][i] + ' failed:', r.reason);
    }
  });
  return enriched;
}

// ---------- Chat endpoint ----------

app.post('/api/chat', async (req, res) => {
  try {
    const { history } = req.body; // [{role:'user'|'assistant', content:'...'}]
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'history required' });
    }

    let messages = history.map(m => ({ role: m.role, content: m.content }));
    let leadSaved = false;
    let finalText = '';

    // Loop to handle tool_use turns
    for (let i = 0; i < 3; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages,
          tools: [SAVE_LEAD_TOOL]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const textBlock = data.content.find(b => b.type === 'text');
      const toolBlock = data.content.find(b => b.type === 'tool_use');
      finalText = textBlock ? textBlock.text : finalText;

      if (toolBlock && toolBlock.name === 'save_lead') {
        await saveLead(toolBlock.input);
        leadSaved = true;
        messages.push({ role: 'assistant', content: data.content });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: 'saved' }]
        });
        continue; // let the model produce its closing message
      }
      break;
    }

    res.json({ reply: finalText, leadSaved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead capture server running on port ${PORT}`));
