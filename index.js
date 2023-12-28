const {
  default: WaPairing,
  useMultiFileAuthState,
  PHONENUMBER_MCC,
  jidDecode
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const path = require('path')
const fs = require('fs-extra')
const readline = require('readline')
const {ChatGPT} = require('./chatgpt.js')

// Session
global.session = 'auth'
// PairingCode
let pairingCode = true //false

// Untuk Memasukan Nomer Telepon
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})
const question = (text) => new Promise((resolve)=>rl.question(text, resolve));

// Connection
async function WaConnect() {
  const {state, saveCreds} = await useMultiFileAuthState(session);
  try{
    const socket = WaPairing({
      printQRInTerminal: !pairingCode,
      logger: pino({
        level: "silent"
      }),
      browser: ['Chrome (Linux)','',''],
      auth: state
    })
    if (pairingCode && !socket.authState.creds.registered){
      let phoneNumber;
      phoneNumber = await question('Masukan Nomer Telepon : ')
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "")
      
      // Logika Cek Nomer Telepon Jika Error Menampilkan Console Log
      if (
        !Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))
      ) {
        console.log('Masukan Nomer Telepon Sesuai Code Negara Anda Misalnya +628XXXXXXXX')
        phoneNumber = await question('Masukan Nomer Telepon : ')
        phoneNumber = phoneNumber.replace(/[^0-9]/g, "")
        rl.close();
      }
      
      setTimeout(async () => {
        let code = await socket.requestPairingCode(phoneNumber)
        code = code.match(/.{1,4}/g).join("-") || code;
        console.log('Code Pairing Anda : \n' + code)
      }, 3000)
    }
    
    socket.ev.on("connection.update", async ({connection, lastDisconnect})=>{
      if (connection === "open"){
        console.log('Berhasil Terhubung Ke WhatsApps!')
      } else if (
        connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode && lastDisconnect.error.output.statusCode !== 40
      ){
         WaConnect()
      }
    })
    // Save saveCreds
    socket.ev.on("creds.update", saveCreds)
    
    socket.ev.on("messages.upsert", async (m) => {
    m.messages.forEach(async (message) => {
      if (
        !message.message ||
        message.key.fromMe ||
        (message.key && message.key.remoteJid == "status@broadcast")
      )
        return;
      if (message.message.ephemeralMessage) {
        message.message = message.message.ephemeralMessage.message;
      }

      try {
        await socket.sendPresenceUpdate("composing", message.key.remoteJid);
         const senderNumber = message.key.remoteJid;
         const textMessage =
          message.message.conversation ||
          (message.message.extendedTextMessage &&
            message.message.extendedTextMessage.text) ||
          (imageMessage && imageMessage.caption) ||
          (videoMessage && videoMessage.caption);
      
         const userMessage = textMessage;
         console.log(senderNumber, ": ", userMessage)
         ch = await ChatGPT(userMessage)
         socket.sendMessage(senderNumber, {text: ch})
      } catch (e) {
        console.log("[ERROR] " + e.message);
      } finally {
        await socket.sendPresenceUpdate("available", message.key.remoteJid);
      }
    });
  })
  }catch(err){
    console.log(err)
  }
}

WaConnect()