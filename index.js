const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. Webserver voor Back4App & cron-job.org ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: bot ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const isConnected = bot && bot.entity;
  res.json({
    status: isConnected ? 'healthy' : 'unhealthy',
    botStatus: isConnected ? 'spawned' : 'not spawned',
    connection: bot ? 'active' : 'inactive'
  });
});

app.listen(PORT, () => {
  console.log(`✅ Webserver gestart op poort ${PORT}`);
});

// --- 2. Bot Configuraties ---
const CONFIG = {
  host: 'mc.arch.lol',  // Java Minecraft server host
  port: 25565,          // Standaard Minecraft poort
  username: 'MijnAFKBot',
  password: 'pass1234', // Alleen nodig voor premium accounts
  version: '1.8.8',     // Versie die de server ondersteunt
  afkDelay: 10000,
  clickDelay: 2000,
  registerDelay: 2000,
  loginDelay: 2000
};

let bot = null;
let reconnectTimer = null;
let afkTimer = null;
let chatTimer = null;
let isLoggedIn = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let isSpawned = false;

// --- 3. Bot Creatie (Normale Minecraft Verbinding) ---
function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try {
      bot.end();
    } catch (e) {}
    bot = null;
  }

  isSpawned = false;
  isLoggedIn = false;
  console.log('🔄 Verbinden met ArchMC Java server...');
  console.log(`📍 Host: ${CONFIG.host}:${CONFIG.port}`);

  try {
    bot = mineflayer.createBot({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      version: CONFIG.version,
      checkTimeoutInterval: 60000,
      logErrors: true,
      hideErrors: false
    });

    // --- Bot Event Handlers ---
    bot.on('error', (err) => {
      console.error('❌ Bot error:', err.message);
      if (err.message.includes('ECONNRESET') || 
          err.message.includes('ETIMEDOUT') ||
          err.message.includes('socket closed') ||
          err.message.includes('read ECONNRESET')) {
        handleReconnect();
      }
    });

    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      console.log('✅ Bot is gespawned in de wereld!');
      console.log(`📍 Bot naam: ${bot.username}`);
      console.log(`📍 Server: ${bot.server ? bot.server.host : 'Onbekend'}`);
      reconnectAttempts = 0;
      
      // Start chat timer voor keep-alive berichten
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = setInterval(() => {
        if (bot && bot.chat && isSpawned) {
          const messages = [
            'Hallo! Ik ben een AFK bot 🤖',
            'Iets te doen hier?',
            'Gezellig hier!',
            'Wat een leuk server!',
            'AFK mode aan 🥱',
            'Even een berichtje om wakker te blijven!'
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          bot.chat(randomMsg);
          console.log(`💬 Keep-alive bericht: "${randomMsg}"`);
        }
      }, 45000);
      
      // Stuur een test bericht na 3 seconden
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('Hallo! Ik ben een AFK bot 🤖');
          console.log('💬 Test bericht verzonden');
        }
      }, 3000);
    });

    // --- Login & Register via Chat ---
    bot.on('message', (jsonMsg) => {
      const messageText = jsonMsg.toString();
      console.log(`💬 Chat: ${messageText}`);

      if (!isSpawned) return;

      // /register detectie
      if (messageText.includes('/register') && !isLoggedIn) {
        console.log('📝 /register gedetecteerd');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
            console.log('✅ /register verzonden');
          }
        }, CONFIG.registerDelay);
      } 
      // /login detectie
      else if (messageText.includes('/login') && !isLoggedIn) {
        console.log('🔑 /login gedetecteerd');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/login ${CONFIG.password}`);
            console.log('✅ /login verzonden');
            isLoggedIn = true;

            // Start AFK modus na 10 seconden
            if (afkTimer) clearTimeout(afkTimer);
            afkTimer = setTimeout(() => {
              console.log('⏰ 10 seconden verstreken. Start AFK modus...');
              if (bot && bot.activateItem) {
                bot.activateItem();
                console.log('🖱️ Rechtermuisklik uitgevoerd');
              }
            }, CONFIG.afkDelay);
          }
        }, CONFIG.loginDelay);
      }
      // Succesvol ingelogd
      else if (messageText.includes('succesvol ingelogd') || 
               messageText.includes('successfully logged in') ||
               messageText.includes('je bent nu ingelogd') ||
               messageText.includes('Welcome')) {
        isLoggedIn = true;
        console.log('✅ Bot is succesvol ingelogd!');
      }
      // AFK bevestiging
      else if (messageText.includes('je bent nu AFK') || 
               messageText.includes('you are now AFK') ||
               messageText.includes('AFK mode')) {
        console.log('💤 Bot is nu AFK!');
      }
    });

    // --- GUI Interactie ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI geopend: "${window.title}"`);
      
      if (window.title.includes('Kies') || window.title.includes('Menu') || window.title.includes('Server')) {
        // Probeer het 14e vakje (index 13)
        const slotIndex = 13;
        console.log(`🖱️ Klikken op slot ${slotIndex + 1}...`);

        try {
          await bot.clickWindow(slotIndex, 0, 0);
          console.log(`✅ Geklikt op vakje ${slotIndex + 1}!`);

          setTimeout(() => {
            if (bot && bot.chat) {
              bot.chat('/afk');
              console.log('💤 /afk verzonden');
            }
          }, CONFIG.clickDelay);
        } catch (err) {
          console.error('❌ Fout bij klikken:', err.message);
          // Fallback: stuur gewoon /afk
          setTimeout(() => {
            if (bot && bot.chat) {
              bot.chat('/afk');
              console.log('💤 /afk verzonden (fallback)');
            }
          }, CONFIG.clickDelay);
        }
      }
    });

    // --- Kicked ---
    bot.on('kicked', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`👢 Bot is gekicked: ${reason}`);
      handleReconnect();
    });

    // --- End ---
    bot.on('end', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`🔴 Verbinding verbroken: ${reason}`);
      handleReconnect();
    });

    // --- Resource Pack ---
    bot.on('resourcePack', (pack) => {
      console.log('📦 Resource pack ontvangen, accepteren...');
      bot.acceptResourcePack();
    });

  } catch (error) {
    console.error('❌ Fout bij creëren bot:', error.message);
    handleReconnect();
  }
}

// --- 4. Reconnect Logic ---
function handleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try {
      bot.end();
    } catch (e) {}
    bot = null;
  }

  isSpawned = false;
  isLoggedIn = false;
  reconnectAttempts++;

  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(`⚠️ Max reconnect pogingen (${MAX_RECONNECT_ATTEMPTS}), wachten met lange pauze...`);
    setTimeout(() => {
      reconnectAttempts = 0;
      console.log('🔄 Reset, opnieuw proberen...');
      createBot();
    }, 60000);
    return;
  }

  const delay = Math.min(5000 * reconnectAttempts, 30000);
  console.log(`🔄 Herverbinden over ${delay/1000} seconden... (poging ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(() => {
    console.log('🔄 Poging tot herverbinden...');
    createBot();
  }, delay);
}

// --- 5. Health Check ---
function periodicHealthCheck() {
  if (!bot || !bot.entity || !isSpawned) {
    console.log('⚠️ Bot lijkt niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond en actief');
  }
}

setInterval(periodicHealthCheck, 180000);

// --- 6. Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  cleanup();
  process.exit(0);
});

function cleanup() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (afkTimer) clearTimeout(afkTimer);
  if (chatTimer) clearInterval(chatTimer);
  if (bot) {
    bot.end();
    bot = null;
  }
}

// --- 7. Start ---
console.log('🚀 ArchMC AFK Bot starting...');
console.log(`📝 Gebruikersnaam: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.host}:${CONFIG.port}`);
console.log('✅ Bot is gestart! Monitoring via /health endpoint');

// Start de bot met een kleine vertraging
setTimeout(() => {
  createBot();
}, 2000);
