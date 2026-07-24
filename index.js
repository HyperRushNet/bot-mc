const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. Webserver ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: bot ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: bot && bot.entity ? 'healthy' : 'unhealthy'
  });
});

app.listen(PORT, () => {
  console.log(`✅ Webserver gestart op poort ${PORT}`);
});

// --- 2. Configuratie ---
const CONFIG = {
  host: 'mc.arch.lol',
  port: 25565,
  username: 'MijnAFKBot',
  version: '1.8.8',
  password: 'pass1234'
};

let bot = null;
let reconnectTimer = null;
let isSpawned = false;
let isLoggedIn = false;
let keepAliveInterval = null;

// --- 3. Bot Creatie (ZONDER PROXY) ---
function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  isSpawned = false;
  isLoggedIn = false;
  
  console.log('🔄 Verbinden met ArchMC...');
  console.log(`📍 ${CONFIG.host}:${CONFIG.port}`);

  try {
    bot = mineflayer.createBot({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      version: CONFIG.version,
      checkTimeoutInterval: 120000, // 2 minuten timeout
      logErrors: true
    });

    // --- Events ---
    bot.on('error', (err) => {
      console.error('❌ Error:', err.message);
    });

    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      console.log('✅ Bot is gespawned!');
      console.log(`📍 ${bot.username}`);
      
      // DIRECT ACTIE: Stuur meteen berichten
      
      // 1. Hallo bericht (na 1 sec)
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('Hallo!');
          console.log('💬 Hallo');
        }
      }, 1000);

      // 2. Login (na 2 sec)
      setTimeout(() => {
        if (bot && bot.chat && !isLoggedIn) {
          bot.chat(`/login ${CONFIG.password}`);
          console.log('🔑 Login');
        }
      }, 2000);

      // 3. AFK (na 4 sec)
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('/afk');
          console.log('💤 AFK');
        }
      }, 4000);

      // 4. Keep-alive: elke 20 seconden
      keepAliveInterval = setInterval(() => {
        if (bot && bot.chat && isSpawned) {
          const msgs = ['🤖', '💤', '👋', '🌟', '🎮'];
          bot.chat(msgs[Math.floor(Math.random() * msgs.length)]);
          console.log('💬 Ping');
        }
      }, 20000);
    });

    // --- Chat ---
    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      console.log(`💬 ${msg}`);

      if (!isSpawned) return;

      // Login success
      if (msg.includes('succesvol ingelogd') || 
          msg.includes('Welcome') ||
          msg.includes('logged in')) {
        isLoggedIn = true;
        console.log('✅ Ingelogd!');
        
        setTimeout(() => {
          if (bot && bot.chat) bot.chat('/afk');
        }, 2000);
      }

      // Register
      if (msg.includes('/register') && !isLoggedIn) {
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
            console.log('📝 Register');
          }
        }, 1000);
      }

      // Login prompt
      if (msg.includes('/login') && !isLoggedIn) {
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/login ${CONFIG.password}`);
            console.log('🔑 Login');
          }
        }, 1000);
      }
    });

    // --- GUI ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI: "${window.title}"`);
      
      try {
        // Probeer verschillende slots
        for (const slot of [13, 12, 14, 10, 0]) {
          try {
            await bot.clickWindow(slot, 0, 0);
            console.log(`✅ Slot ${slot+1}`);
            break;
          } catch (e) {}
        }
        
        setTimeout(() => {
          if (bot && bot.chat) bot.chat('/afk');
        }, 1000);
      } catch (err) {
        console.error('❌ GUI error:', err.message);
      }
    });

    // --- Kicked ---
    bot.on('kicked', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`👢 Kicked: ${reason}`);
      
      // Bij VPN detectie, wacht langer
      const delay = reason.includes('VPN') ? 60000 : 10000;
      console.log(`⏰ Wacht ${delay/1000}s`);
      
      reconnectTimer = setTimeout(createBot, delay);
    });

    // --- End ---
    bot.on('end', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`🔴 Disconnected: ${reason}`);
      
      reconnectTimer = setTimeout(createBot, 5000);
    });

    // --- Resource Pack ---
    bot.on('resourcePack', (pack) => {
      console.log('📦 Resource pack');
      bot.acceptResourcePack();
    });

  } catch (error) {
    console.error('❌ Fout:', error.message);
    reconnectTimer = setTimeout(createBot, 10000);
  }
}

// --- 4. Health Check ---
setInterval(() => {
  if (!bot || !bot.entity || !isSpawned) {
    console.log('⚠️ Bot niet actief, herstart...');
    if (!reconnectTimer) {
      createBot();
    }
  } else {
    console.log('✅ Bot actief');
  }
}, 60000);

// --- 5. Start ---
console.log('🚀 ArchMC Bot');
console.log(`📝 ${CONFIG.username}`);
console.log(`🌐 ${CONFIG.host}:${CONFIG.port}`);

setTimeout(createBot, 2000);

// --- 6. Cleanup ---
process.on('SIGINT', () => {
  console.log('🛑 Stopping...');
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) { bot.end(); }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Stopping...');
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) { bot.end(); }
  process.exit(0);
});
