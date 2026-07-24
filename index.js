const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. Webserver ---
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
let loginAttempts = 0;
let isLoggedIn = false;
let isSpawned = false;

// --- 3. Bot Creatie ---
function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  isSpawned = false;
  isLoggedIn = false;
  
  console.log('🔄 Verbinden met ArchMC...');
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
    
    // Error handler
    bot.on('error', (err) => {
      console.error('❌ Bot error:', err.message);
      if (err.message.includes('ECONNRESET') || 
          err.message.includes('ETIMEDOUT') ||
          err.message.includes('socketClosed')) {
        handleReconnect();
      }
    });

    // Spawn - DIRECT ACTIE ONDERNEMEN
    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      console.log('✅ Bot is gespawned!');
      console.log(`📍 Bot: ${bot.username}`);
      loginAttempts = 0;
      
      // STAP 1: Direct een bericht sturen om verbinding actief te houden
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('Hallo! Ik ben er!');
          console.log('💬 Hallo bericht verzonden');
        }
      }, 1000);

      // STAP 2: Wacht 2 seconden en stuur login
      setTimeout(() => {
        if (bot && bot.chat && !isLoggedIn) {
          bot.chat(`/login ${CONFIG.password}`);
          console.log('🔑 Login verzonden');
        }
      }, 2000);

      // STAP 3: Wacht 5 seconden en stuur AFK
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('/afk');
          console.log('💤 /afk verzonden');
        }
      }, 5000);

      // STAP 4: Start keep-alive berichten
      setInterval(() => {
        if (bot && bot.chat && isSpawned) {
          const messages = [
            '🤖 AFK bot draait!',
            '💤 AFK modus actief',
            '👋 Hallo allemaal!',
            '🌟 Bot is online'
          ];
          const msg = messages[Math.floor(Math.random() * messages.length)];
          bot.chat(msg);
          console.log(`💬 Keep-alive: "${msg}"`);
        }
      }, 30000); // Elke 30 seconden
    });

    // --- Login detectie ---
    bot.on('message', (jsonMsg) => {
      const messageText = jsonMsg.toString();
      console.log(`💬 Chat: ${messageText}`);

      if (!isSpawned) return;

      // Login succesvol
      if (messageText.includes('succesvol ingelogd') || 
          messageText.includes('successfully logged in') ||
          messageText.includes('Welcome') ||
          messageText.includes('je bent nu ingelogd')) {
        isLoggedIn = true;
        console.log('✅ Bot is succesvol ingelogd!');
        
        // Direct AFK sturen na inloggen
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat('/afk');
            console.log('💤 /afk verzonden (na login)');
          }
        }, 3000);
      }

      // Register detectie
      if (messageText.includes('/register') && !isLoggedIn) {
        console.log('📝 Register gedetecteerd, sturen...');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
            console.log('✅ Register verzonden');
          }
        }, 1000);
      }

      // Login prompt
      if (messageText.includes('/login') && !isLoggedIn) {
        console.log('🔑 Login prompt gedetecteerd, sturen...');
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat(`/login ${CONFIG.password}`);
            console.log('✅ Login verzonden');
          }
        }, 1000);
      }

      // AFK bevestiging
      if (messageText.includes('AFK') || messageText.includes('afk')) {
        console.log('💤 AFK bevestigd!');
      }
    });

    // --- GUI ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI geopend: "${window.title}"`);
      
      try {
        // Klik op verschillende slots om te zien wat werkt
        const slots = [13, 12, 14, 10, 0];
        for (const slot of slots) {
          try {
            await bot.clickWindow(slot, 0, 0);
            console.log(`✅ Geklikt op slot ${slot + 1}`);
            break;
          } catch (e) {
            // Probeer volgende slot
          }
        }
        
        // Stuur AFK na klikken
        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat('/afk');
            console.log('💤 /afk verzonden (via GUI)');
          }
        }, 1000);
        
      } catch (err) {
        console.error('❌ GUI error:', err.message);
      }
    });

    // --- Kicked ---
    bot.on('kicked', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      console.log(`👢 Gekicked: ${reason}`);
      
      // Als het VPN detectie is, wacht langer
      if (reason.includes('VPN') || reason.includes('vpn')) {
        console.log('⏰ VPN detectie, wacht 60 seconden...');
        setTimeout(() => {
          handleReconnect();
        }, 60000);
      } else {
        handleReconnect();
      }
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

// --- 4. Reconnect ---
function handleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  const delay = 5000;
  console.log(`🔄 Herverbinden over ${delay/1000}s...`);
  
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
}, 60000);

// --- 6. Start ---
console.log('🚀 ArchMC Bot starting...');
console.log(`📝 Bot: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.host}:${CONFIG.port}`);

setTimeout(() => {
  createBot();
}, 2000);

// --- 7. Cleanup ---
process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  if (bot) { bot.end(); bot = null; }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  if (bot) { bot.end(); bot = null; }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});
