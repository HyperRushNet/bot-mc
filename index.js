const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. Webserver voor Back4App & cron-job.org ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('ArchMC Bot is actief!');
});

app.listen(PORT, () => {
  console.log(`Webserver gestart op poort ${PORT}`);
});

// --- 2. Bot Configuraties ---
const PASWOORD = 'pass1234';
const SLOT_INDEX = 13; // 14e vakje in het menu (telt vanaf 0)

const botOptions = {
  host: 'arch.mc',
  port: 25565,
  username: 'MijnAFKBot',
  version: '1.8.8'
};

let bot;

function createBot() {
  console.log('[+] Verbinden met ArchMC...');
  bot = mineflayer.createBot(botOptions);

  let isSpawned = false;

  bot.on('spawn', () => {
    isSpawned = true;
    console.log('[+] Bot is succesvol gespawned in de wereld.');
  });

  // --- Login & Register via Chat ---
  bot.on('message', (jsonMsg) => {
    const messageText = jsonMsg.toString();

    // Alleen reageren als de bot al daadwerkelijk gespawned is
    if (!isSpawned) return;

    if (messageText.includes('/register')) {
      console.log('[->] /register commando klaarzetten...');
      // Wacht 1 seconde met versturen om te voorkomen dat de server dit als spam ziet
      setTimeout(() => {
        if (bot) bot.chat(`/register ${PASWOORD} ${PASWOORD}`);
      }, 1000);
    } 
    else if (messageText.includes('/login')) {
      console.log('[->] /login commando klaarzetten...');
      setTimeout(() => {
        if (bot) {
          bot.chat(`/login ${PASWOORD}`);

          // 10 seconden na login de rechtermuisklik uitvoeren
          setTimeout(() => {
            console.log('[->] Rechtermuisklik uitvoeren...');
            bot.activateItem();
          }, 10000);
        }
      }, 1000);
    }
  });

  // --- Menu Interactie (Chest GUI) ---
  bot.on('windowOpen', async (window) => {
    console.log(`[+] GUI Menu geopend: "${window.title}". Slot ${SLOT_INDEX + 1} aanklikken...`);

    try {
      await bot.clickWindow(SLOT_INDEX, 0, 0);
      console.log('[+] Op het 14e vakje geklikt!');

      setTimeout(() => {
        console.log('[->] /afk versturen...');
        bot.chat('/afk');
      }, 2000);
    } catch (err) {
      console.error('[-] Fout bij aanklikken in menu:', err.message);
    }
  });

  // --- Reconnect Logica ---
  bot.on('end', (reason) => {
    isSpawned = false;
    console.log(`[-] Verbinding verbroken: ${reason}. Herverbinden over 12 seconden...`);
    setTimeout(createBot, 12000);
  });

  bot.on('error', (err) => {
    console.error('[-] Fout opgetreden:', err.message);
  });
}

createBot();
