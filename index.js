const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const axios = require("axios")
const fs = require("fs")
const ytdl = require("ytdl-core")

const OWNER = "91XXXXXXXXXX@s.whatsapp.net"

let AUTO_REPLY = false
let ANTI_DELETE = true

let db = {}
if (fs.existsSync("db.json")) {
    db = JSON.parse(fs.readFileSync("db.json"))
}

function saveDB() {
    fs.writeFileSync("db.json", JSON.stringify(db, null, 2))
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("session")

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant || from
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

        if (!db[sender]) db[sender] = { chat: [] }

        // ================= AI MEMORY =================
        if (body.startsWith(".ai")) {
            let text = body.replace(".ai ", "")

            db[sender].chat.push({ role: "user", content: text })
            db[sender].chat = db[sender].chat.slice(-5)

            let res = await axios.post("https://api.openai.com/v1/chat/completions", {
                model: "gpt-4o-mini",
                messages: db[sender].chat
            }, {
                headers: { "Authorization": "Bearer YOUR_OPENAI_API_KEY" }
            })

            let reply = res.data.choices[0].message.content
            db[sender].chat.push({ role: "assistant", content: reply })
            saveDB()

            sock.sendMessage(from, { text: reply })
        }

        // ================= IMAGE =================
        else if (body.startsWith(".img")) {
            let prompt = body.replace(".img ", "")
            let res = await axios.post("https://api.openai.com/v1/images/generations", {
                prompt, n: 1, size: "512x512"
            }, {
                headers: { "Authorization": "Bearer YOUR_OPENAI_API_KEY" }
            })

            sock.sendMessage(from, {
                image: { url: res.data.data[0].url },
                caption: "AI Image"
            })
        }

        // ================= SONG (FREE) =================
else if (body.startsWith(".song")) {
    let query = body.replace(".song ", "")

    let url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`

    sock.sendMessage(from, {
        text: `🎵 Search Result:\n${url}`
    })
}
        // ================= MP3 =================
        else if (body.startsWith(".mp3")) {
            let url = body.replace(".mp3 ", "")
            let stream = ytdl(url, { filter: "audioonly" })
            let path = "./song.mp3"

            stream.pipe(fs.createWriteStream(path))
            stream.on("end", async () => {
                await sock.sendMessage(from, {
                    audio: fs.readFileSync(path),
                    mimetype: "audio/mpeg"
                })
                fs.unlinkSync(path)
            })
        }

        // ================= INSTA =================
        else if (body.startsWith(".insta")) {
            let link = body.replace(".insta ", "")
            let api = `https://api.example.com/insta?url=${link}`

            let res = await axios.get(api)
            sock.sendMessage(from, { video: { url: res.data.url } })
        }

        // ================= FUN =================
        else if (body === ".joke") {
            let res = await axios.get("https://official-joke-api.appspot.com/random_joke")
            sock.sendMessage(from, {
                text: res.data.setup + "\n" + res.data.punchline
            })
        }

        else if (body === ".truth") {
            sock.sendMessage(from, { text: "Kya tumne kabhi jhoot bola? 😏" })
        }

        else if (body === ".dare") {
            sock.sendMessage(from, { text: "Apne dost ko call karo 😂" })
        }

        // ================= GROUP =================
        else if (body === ".tagall") {
            let group = await sock.groupMetadata(from)
            let text = group.participants.map(p => `@${p.id.split("@")[0]}`).join(" ")

            sock.sendMessage(from, {
                text,
                mentions: group.participants.map(p => p.id)
            })
        }

        // ================= AUTO REPLY =================
        else if (body === ".autoreply on" && sender === OWNER) {
            AUTO_REPLY = true
            sock.sendMessage(from, { text: "ON" })
        }

        else if (body === ".autoreply off" && sender === OWNER) {
            AUTO_REPLY = false
            sock.sendMessage(from, { text: "OFF" })
        }

        else if (AUTO_REPLY) {
            sock.sendMessage(from, { text: "Bot Active 🤖" })
        }

        // ================= MENU =================
        else if (body === ".menu") {
            sock.sendMessage(from, {
                text: `
🔥 ULTIMATE BOT 🔥

.ai text
.img text
.song name
.mp3 link
.insta link
.joke
.truth / .dare
.tagall
.autoreply on/off
`
            })
        }
    })

    // ================= ANTI DELETE =================
    sock.ev.on("messages.update", async (updates) => {
        if (!ANTI_DELETE) return
        for (let u of updates) {
            if (u.update.message === null) {
                sock.sendMessage(u.key.remoteJid, {
                    text: "⚠️ Deleted msg!"
                })
            }
        }
    })
}

startBot()
