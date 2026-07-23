const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. Webserver voor Back4App & cron-job.org ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('ArchMC Bot is actief en draait op Back4App!');
});

app.listen(PORT, () => {
  console.log(`Webserver gestart op poort ${PORT}`);
});

// --- 2. Bot Configuraties ---
const PASWOORD = 'pass1234';
// Mineflayer telt vanaf index 0. Slot 14 = index 13.
const SLOT_INDEX = 13; 

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

  bot.on('spawn', () => {
    console.log('[+] Bot is gespawned in de wereld.');
  });

  // --- Login & Register via Chat ---
  bot.on('message', (jsonMsg) => {
    const messageText = jsonMsg.toString();

    // Registreren indien de server erom vraagt
    if (messageText.includes('/register')) {
      console.log('[->] /register commando uitvoeren...');
      bot.chat(`/register ${PASWOORD} ${PASWOORD}`);
    } 
    // Inloggen indien de server erom vraagt
    else if (messageText.includes('/login')) {
      console.log('[->] /login commando uitvoeren...');
      bot.chat(`/login ${PASWOORD}`);

      // 10 seconden wachten na login om rechtermuisklik uit te voeren
      setTimeout(() => {
        console.log('[->] 10 seconden verstreken. Rechtermuisklik uitvoeren...');
        bot.activateItem(); // Voert rechtermuisklik uit
      }, 10000);
    }
  });

  // --- Menu Interactie (Chest / GUI Menu) ---
  bot.on('windowOpen', async (window) => {
    console.log(`[+] GUI Menu geopend (Titel: "${window.title}"). Slot ${SLOT_INDEX + 1} (index ${SLOT_INDEX}) aanklikken...`);

    try {
      // Klik op het 14e vakje (index 13)
      await bot.clickWindow(SLOT_INDEX, 0, 0);
      console.log('[+] Op het vakje geklikt!');

      // Wacht 2 seconden en stuur /afk
      setTimeout(() => {
        console.log('[->] /afk versturen...');
        bot.chat('/afk');
      }, 2000);
    } catch (err) {
      console.error('[-] Fout bij het aanklikken in het menu:', err.message);
    }
  });

  // --- Reconnect Logica ---
  bot.on('end', (reason) => {
    console.log(`[-] Verbinding verbroken: ${reason}. Herverbinden over 10 seconden...`);
    setTimeout(createBot, 10000);
  });

  bot.on('error', (err) => {
    console.error('[-] Fout opgetreden:', err.message);
  });
}

// Start de bot
createBot();
