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
  host: 'mc.arch.lol',     // Java Minecraft server
  port: 25565,             // Standaard Minecraft poort
  username: 'MijnAFKBot',  // Verander naar jouw bot naam
  version: '1.8.8',        // ArchMC ondersteunt 1.8.8
  password: 'pass1234',    // Wachtwoord voor de server
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

// --- 3. Bot Creatie (Java Minecraft) ---
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
      logErrors: true
    });

    // --- Bot Event Handlers ---
    bot.on('error', (err) => {
      console.error('❌ Bot error:', err.message);
      handleReconnect();
    });

    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      console.log('✅ Bot is gespawned in de wereld!');
      console.log(`📍 Bot naam: ${bot.username}`);
      reconnectAttempts = 0;
      
      // Chat timer voor keep-alive
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = setInterval(() => {
        if (bot && bot.chat && isSpawned) {
          const messages = [
            'Hallo! Ik ben een AFK bot 🤖',
            'Iets te doen hier?',
            'Gezellig hier!',
            'Wat een leuk server!',
            'AFK mode aan 🥱'
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          bot.chat(randomMsg);
          console.log(`💬 Keep-alive: "${randomMsg}"`);
        }
      }, 45000);
    });

    // --- Login & Register ---
    bot.on('message', (jsonMsg) => {
      const messageText = jsonMsg.toString();
      console.log(`💬 Chat: ${messageText}`);

      if (!isSpawned) return;

      if (messageText.includes('/register') && !isLoggedIn) {
        console.log('📝 /register gedetecteerd');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
            console.log('✅ /register verzonden');
          }
        }, CONFIG.registerDelay);
      } 
      else if (messageText.includes('/login') && !isLoggedIn) {
        console.log('🔑 /login gedetecteerd');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/login ${CONFIG.password}`);
            console.log('✅ /login verzonden');
            isLoggedIn = true;

            if (afkTimer) clearTimeout(afkTimer);
            afkTimer = setTimeout(() => {
              console.log('⏰ Start AFK modus...');
              if (bot && bot.activateItem) {
                bot.activateItem();
                console.log('🖱️ Rechtermuisklik uitgevoerd');
              }
            }, CONFIG.afkDelay);
          }
        }, CONFIG.loginDelay);
      }
      else if (messageText.includes('succesvol ingelogd') || 
               messageText.includes('successfully logged in') ||
               messageText.includes('Welcome')) {
        isLoggedIn = true;
        console.log('✅ Bot is succesvol ingelogd!');
      }
      else if (messageText.includes('AFK')) {
        console.log('💤 AFK modus actief!');
      }
    });

    // --- GUI Interactie ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI geopend: "${window.title}"`);
      
      if (window.title.includes('Kies') || window.title.includes('Menu')) {
        try {
          await bot.clickWindow(13, 0, 0); // 14e vakje
          console.log('✅ Geklikt op vakje 14!');

          setTimeout(() => {
            if (bot && bot.chat) {
              bot.chat('/afk');
              console.log('💤 /afk verzonden');
            }
          }, CONFIG.clickDelay);
        } catch (err) {
          console.error('❌ Fout bij klikken:', err.message);
          setTimeout(() => {
            if (bot && bot.chat) {
              bot.chat('/afk');
              console.log('💤 /afk verzonden (fallback)');
            }
          }, CONFIG.clickDelay);
        }
      }
    });

    // --- Kicked & End ---
    bot.on('kicked', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`👢 Bot is gekicked: ${reason}`);
      handleReconnect();
    });

    bot.on('end', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`🔴 Verbinding verbroken: ${reason}`);
      handleReconnect();
    });

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
    console.log(`⚠️ Max reconnect pogingen, wachten...`);
    setTimeout(() => {
      reconnectAttempts = 0;
      createBot();
    }, 60000);
    return;
  }

  const delay = Math.min(5000 * reconnectAttempts, 30000);
  console.log(`🔄 Herverbinden over ${delay/1000}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(() => {
    createBot();
  }, delay);
}

// --- 5. Health Check ---
setInterval(() => {
  if (!bot || !bot.entity || !isSpawned) {
    console.log('⚠️ Bot niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond');
  }
}, 180000);

// --- 6. Graceful Shutdown ---
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

function cleanup() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (afkTimer) clearTimeout(afkTimer);
  if (chatTimer) clearInterval(chatTimer);
  if (bot) { bot.end(); bot = null; }
}

// --- 7. Start ---
console.log('🚀 ArchMC AFK Bot starting...');
console.log(`📝 Bot: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.host}:${CONFIG.port}`);

setTimeout(() => {
  createBot();
}, 2000);
