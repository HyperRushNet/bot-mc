const mineflayer = require('mineflayer');
const express = require('express');
const WebSocket = require('ws');

// --- 1. Webserver voor Back4App & cron-job.org ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('ArchMC Eaglercraft Bot is actief!');
});

app.listen(PORT, () => {
  console.log(`Webserver gestart op poort ${PORT}`);
});

// --- 2. Bot Configuraties ---
const PASWOORD = 'pass1234';
const SLOT_INDEX = 13; // 14e vakje in de kist/GUI (telt vanaf index 0)

// WebSocket URL van ArchMC (Eaglercraft server)
const EAGLER_SERVER_URL = 'wss://mc.arch.lol/'; 

let bot;

function createBot() {
  console.log('[+] Verbinden met ArchMC via WebSocket...');

  // Maak de WebSocket-verbinding aan
  const ws = new WebSocket(EAGLER_SERVER_URL, {
    origin: 'https://arch.lol'
  });

  ws.on('open', () => {
    console.log('[+] WebSocket verbinding opgebouwd met ArchMC!');
  });

  ws.on('error', (err) => {
    console.error('[-] WebSocket Fout:', err.message);
  });

  // Koppel de WebSocket aan Mineflayer
  bot = mineflayer.createBot({
    stream: WebSocket.createWebSocketStream(ws),
    username: 'MijnAFKBot',
    version: '1.8.8',
    checkTimeoutInterval: 30000
  });

  let isSpawned = false;

  bot.on('spawn', () => {
    if (isSpawned) return;
    isSpawned = true;
    console.log('[+] Bot is gespawned in de wereld!');
  });

  // --- Login & Register via Chat ---
  bot.on('message', (jsonMsg) => {
    const messageText = jsonMsg.toString();

    // Wacht tot de bot daadwerkelijk ingeladen is
    if (!isSpawned) return;

    if (messageText.includes('/register')) {
      console.log('[->] /register gedetecteerd. Wachten op versturen...');
      setTimeout(() => {
        if (bot) bot.chat(`/register ${PASWOORD} ${PASWOORD}`);
      }, 2000);
    } 
    else if (messageText.includes('/login')) {
      console.log('[->] /login gedetecteerd. Wachten op versturen...');
      setTimeout(() => {
        if (bot) {
          bot.chat(`/login ${PASWOORD}`);

          // 10 seconden na inloggen de rechtermuisklik uitvoeren
          setTimeout(() => {
            console.log('[->] 10 seconden verstreken. Rechtermuisklik uitvoeren...');
            bot.activateItem();
          }, 10000);
        }
      }, 2000);
    }
  });

  // --- Menu / GUI Interactie ---
  bot.on('windowOpen', async (window) => {
    console.log(`[+] GUI Menu geopend: "${window.title}". Slot ${SLOT_INDEX + 1} aanklikken...`);

    try {
      // Klik op het 14e vakje (index 13)
      await bot.clickWindow(SLOT_INDEX, 0, 0);
      console.log('[+] Op het 14e vakje geklikt!');

      // Wacht 2 seconden en stuur /afk
      setTimeout(() => {
        console.log('[->] /afk versturen...');
        bot.chat('/afk');
      }, 2000);
    } catch (err) {
      console.error('[-] Fout bij het klik op vakje:', err.message);
    }
  });

  // --- Reconnect Logica ---
  bot.on('end', (reason) => {
    isSpawned = false;
    console.log(`[-] Verbinding verbroken (${reason}). Herverbinden over 15 seconden...`);
    setTimeout(createBot, 15000);
  });

  bot.on('error', (err) => {
    console.error('[-] Bot Fout opgetreden:', err.message);
  });
}

// Start de bot
createBot();
