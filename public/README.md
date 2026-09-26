# AI Lead Capture Kit

An AI chat assistant that qualifies visitors across Real Estate, Trading, and
POS & IT Solutions, then sends captured leads to your email, a Google Sheet,
and (later) a CRM.

## 1. Install

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `GEMINI_API_KEY` — free, get one at aistudio.google.com/apikey (Google
  account, no credit card needed)
- SMTP settings — for the email notification (any provider works: Gmail app
  password, SendGrid, Mailgun, etc.)
- Google Sheets — create a Google Cloud service account, download its JSON
  key, save it as `service-account.json` in this folder, then share your
  target Google Sheet with the service account's email (found inside the
  JSON) as an Editor. Create a tab named `Leads` with headers:
  `Timestamp | Name | Contact | Interest | Need`.

You can leave email or Sheets unconfigured and the server will just skip
that step quietly — nothing breaks.

## 2. Run

```bash
npm start
```

This starts the server on `http://localhost:3000`. Two ready-to-use pages
are served automatically:

- `http://localhost:3000/` (`public/index.html`) — a full-page standalone
  chat. Once deployed, this is the link you share directly (text, email,
  social bio, QR code) — no website needed.
- `http://localhost:3000/widget.html` — the embeddable snippet for your
  own site (see step 3).

## 3. Embed on your site

Open `public/widget.html`, copy the `<div id="lead-chat-widget">…</div>`
block and the `<script>` block into any page on your custom site (e.g. right
before `</body>`). If your site and this server run on different domains,
set `API_BASE` inside the script to your server's public URL.

## 4. Deploy

Any Node host works (Render, Railway, Fly.io, your own VPS). Set the same
environment variables there that you set locally, and update `API_BASE` in
the widget to point at the deployed URL.

## 5. Add a CRM later

`server.js` has a `pushToCrm(lead)` function that's currently a no-op —
when you pick a CRM (HubSpot, Salesforce, etc.), that's the one place to
add the API call. Everything else stays the same.
