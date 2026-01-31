import fs from "fs"
import twilio from "twilio"

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM || null
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || null

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN")
  process.exit(1)
}

if (!FROM && !MESSAGING_SERVICE_SID) {
  console.error("❌ Provide TWILIO_FROM (phone) OR TWILIO_MESSAGING_SERVICE_SID")
  process.exit(1)
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN)

// Petit sleep pour éviter d'envoyer trop vite
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Usage: node scripts/send-twilio.js twilio.csv
const file = process.argv[2]
if (!file) {
  console.error("Usage: node scripts/send-twilio.js twilio.csv")
  process.exit(1)
}

const raw = fs.readFileSync(file, "utf8").trim().split("\n")
const rows = raw.slice(1) // skip header

console.log(`📦 Rows to send: ${rows.length}`)

let ok = 0
let ko = 0

for (let i = 0; i < rows.length; i++) {
  const line = rows[i]
  if (!line.trim()) continue

  // Format ; avec potentiels guillemets
  const cols = line.split(";")
  const To = (cols[0] || "").replaceAll('"', "")
  const Body = (cols[1] || "").replaceAll('"', "")

  if (!To || !Body) {
    console.log(`⚠️ Skip line ${i + 2} (missing To/Body)`)
    continue
  }

  try {
    const payload = {
      to: To,
      body: Body,
      ...(MESSAGING_SERVICE_SID
        ? { messagingServiceSid: MESSAGING_SERVICE_SID }
        : { from: FROM }),
    }

    await client.messages.create(payload)
    ok++
    console.log(`✅ Sent (${ok}/${rows.length}) -> ${To}`)

    // throttle (0.5s)
    await sleep(500)
  } catch (err) {
    ko++
    console.error(`❌ Failed -> ${To}`, err?.message || err)
    await sleep(500)
  }
}

console.log(`Done. OK=${ok} KO=${ko}`)