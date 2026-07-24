const mineflayer = require('mineflayer');
const express = require('express');
const WebSocket = require('ws');

// --- 1. Webserver voor Back4App & cron-job.org ---
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint voor cron-job.org
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: bot ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Extra health endpoint voor specifieke monitoring
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
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// --- 2. Bot Configuraties ---
const CONFIG = {
  password: 'pass1234',
  slotIndex: 13, // 14e vakje (telt vanaf 0)
  serverUrl: 'wss://mc.arch.lol/',
  username: 'MijnAFKBot',
  version: '1.8.8',
  reconnectDelay: 15000,
  afkDelay: 10000, // 10 seconden wachten voor /afk
  clickDelay: 2000, // 2 seconden wachten na klik
  registerDelay: 2000, // 2 seconden wachten voor /register
  loginDelay: 2000 // 2 seconden wachten voor /login
};

let bot = null;
let isSpawning = false;
let reconnectTimer = null;
let afkTimer = null;

// --- 3. Bot Creatie met WebSocket ---
function createBot() {
  // Clear bestaande timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  console.log('🔄 Verbinden met ArchMC via WebSocket...');

  try {
    // Maak de WebSocket-verbinding aan
    const ws = new WebSocket(CONFIG.serverUrl, {
      origin: 'https://arch.lol',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    ws.on('open', () => {
      console.log('✅ WebSocket verbinding opgebouwd met ArchMC!');
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket Fout:', err.message);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔴 WebSocket gesloten: ${code} - ${reason}`);
    });

    // Koppel de WebSocket aan Mineflayer
    bot = mineflayer.createBot({
      stream: WebSocket.createWebSocketStream(ws),
      username: CONFIG.username,
      version: CONFIG.version,
      checkTimeoutInterval: 30000,
      reconnectDelay: 5000,
      logErrors: true
    });

    // --- 4. Bot Event Handlers ---
    let isSpawned = false;
    let isLoggedIn = false;
    let loginAttempts = 0;
    const MAX_LOGIN_ATTEMPTS = 3;

    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      isSpawning = false;
      loginAttempts = 0;
      console.log('✅ Bot is gespawned in de wereld!');
      console.log(`📍 Bot naam: ${bot.username}`);
      console.log(`📊 Bot versie: ${bot.version}`);
    });

    // --- Login & Register via Chat ---
    bot.on('message', (jsonMsg) => {
      const messageText = jsonMsg.toString();
      console.log(`💬 Chat: ${messageText}`);

      // Alleen handelen als de bot is gespawned
      if (!isSpawned) return;

      // /register detectie
      if (messageText.includes('/register') && !isLoggedIn) {
        console.log('📝 /register gedetecteerd. Versturen...');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
            console.log('✅ /register verzonden');
          }
        }, CONFIG.registerDelay);
      } 
      // /login detectie
      else if (messageText.includes('/login') && !isLoggedIn) {
        console.log('🔑 /login gedetecteerd. Versturen...');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/login ${CONFIG.password}`);
            console.log('✅ /login verzonden');
            isLoggedIn = true;

            // Na inloggen: wachten en dan rechtermuisklik uitvoeren
            if (afkTimer) clearTimeout(afkTimer);
            afkTimer = setTimeout(() => {
              console.log('⏰ 10 seconden verstreken. Rechtermuisklik uitvoeren...');
              if (bot && bot.activateItem) {
                bot.activateItem();
                console.log('🖱️ Rechtermuisklik uitgevoerd');
              }
            }, CONFIG.afkDelay);
          }
        }, CONFIG.loginDelay);
      }
      // Succesvol ingelogd bericht
      else if (messageText.includes('succesvol ingelogd') || 
               messageText.includes('successfully logged in') ||
               messageText.includes('je bent nu ingelogd')) {
        isLoggedIn = true;
        console.log('✅ Bot is succesvol ingelogd!');
      }
      // AFK bevestiging
      else if (messageText.includes('je bent nu AFK') || 
               messageText.includes('you are now AFK')) {
        console.log('💤 Bot is nu AFK!');
      }
    });

    // --- Menu / GUI Interactie ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI Menu geopend: "${window.title}"`);
      console.log(`🖱️ Klikken op slot ${CONFIG.slotIndex + 1}...`);

      try {
        // Klik op het gespecificeerde vakje
        const result = await bot.clickWindow(CONFIG.slotIndex, 0, 0);
        console.log(`✅ Geklikt op vakje ${CONFIG.slotIndex + 1}! Result: ${result}`);

        // Wacht en stuur /afk
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat('/afk');
            console.log('💤 /afk verzonden');
          }
        }, CONFIG.clickDelay);
      } catch (err) {
        console.error('❌ Fout bij klikken op vakje:', err.message);
        
        // Probeer alternatieve klik methode
        try {
          console.log('🔄 Poging 2: alternatieve klik...');
          await bot.clickWindow(CONFIG.slotIndex, 0, 1); // Shift+klik
          console.log('✅ Alternatieve klik gelukt!');
        } catch (err2) {
          console.error('❌ Alternatieve klik ook mislukt:', err2.message);
        }
      }
    });

    // --- Window Close ---
    bot.on('windowClose', (window) => {
      console.log(`❌ GUI Menu gesloten: "${window.title}"`);
    });

    // --- Error Handling ---
    bot.on('error', (err) => {
      console.error('❌ Bot Fout:', err.message);
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        console.log('🔄 Verbindingsfout, probeer opnieuw...');
        handleReconnect();
      }
    });

    // --- Kicked ---
    bot.on('kicked', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      isSpawning = false;
      console.log(`👢 Bot is gekicked: ${reason}`);
      handleReconnect();
    });

    // --- End / Disconnect ---
    bot.on('end', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      isSpawning = false;
      console.log(`🔴 Verbinding verbroken: ${reason}`);
      handleReconnect();
    });

    // --- Resource Pack (soms nodig voor Eaglercraft) ---
    bot.on('resourcePack', (pack) => {
      console.log('📦 Resource pack ontvangen, accepteren...');
      bot.acceptResourcePack();
    });

  } catch (error) {
    console.error('❌ Fout bij creëren bot:', error.message);
    handleReconnect();
  }
}

// --- 5. Reconnect Logic ---
function handleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try {
      bot.end();
    } catch (e) {
      // Negeer errors bij het sluiten
    }
    bot = null;
  }

  console.log(`🔄 Herverbinden over ${CONFIG.reconnectDelay/1000} seconden...`);
  reconnectTimer = setTimeout(() => {
    console.log('🔄 Poging tot herverbinden...');
    createBot();
  }, CONFIG.reconnectDelay);
}

// --- 6. Periodic Health Check (extra veiligheid) ---
function periodicHealthCheck() {
  if (!bot || !bot.entity) {
    console.log('⚠️ Bot lijkt niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond en actief');
  }
}

// Elke 5 minuten een health check
setInterval(periodicHealthCheck, 300000);

// --- 7. Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  if (bot) {
    bot.end();
    bot = null;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (afkTimer) clearTimeout(afkTimer);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  if (bot) {
    bot.end();
    bot = null;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (afkTimer) clearTimeout(afkTimer);
  process.exit(0);
});

// --- 8. Start de bot ---
console.log('🚀 ArchMC AFK Bot starting...');
console.log(`📝 Gebruikersnaam: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.serverUrl}`);
createBot();

// Extra: Log wanneer de bot actief is
console.log('✅ Bot is gestart! Monitoring via /health endpoint');
