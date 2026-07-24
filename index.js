const mineflayer = require('mineflayer');
const express = require('express');
const WebSocket = require('ws');

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
    connection: bot ? 'active' : 'inactive',
    websocket: ws && ws.readyState === WebSocket.OPEN ? 'open' : 'closed'
  });
});

app.listen(PORT, () => {
  console.log(`✅ Webserver gestart op poort ${PORT}`);
});

// --- 2. Bot Configuraties ---
const CONFIG = {
  password: 'pass1234',
  slotIndex: 13,
  serverUrl: 'wss://mc.arch.lol/',
  username: 'MijnAFKBot',
  version: '1.8.8',
  reconnectDelay: 5000,
  afkDelay: 10000,
  clickDelay: 2000,
  registerDelay: 2000,
  loginDelay: 2000,
  keepAliveInterval: 15000, // Ping elke 15 seconden
  chatInterval: 45000 // Stuur een bericht elke 45 seconden
};

let bot = null;
let ws = null;
let reconnectTimer = null;
let afkTimer = null;
let keepAliveTimer = null;
let chatTimer = null;
let isLoggedIn = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let isConnecting = false;
let isSpawned = false;

// --- 3. Aangepaste WebSocket verbinding voor ArchMC ---
function createCustomWebSocket() {
  return new Promise((resolve, reject) => {
    try {
      const socket = new WebSocket(CONFIG.serverUrl, {
        origin: 'https://arch.lol',
        perMessageDeflate: false,
        handshakeTimeout: 10000
      });

      socket.on('upgrade', (response) => {
        const headers = response.headers;
        if (headers['sec-websocket-extensions']) {
          console.log('⚠️ Sec-WebSocket-Extensions header gedetecteerd, negeren...');
          delete headers['sec-websocket-extensions'];
        }
      });

      socket.on('open', () => {
        console.log('✅ WebSocket verbinding opgebouwd!');
        resolve(socket);
      });

      socket.on('error', (err) => {
        console.error('❌ WebSocket error:', err.message);
        reject(err);
      });

      socket.on('close', (code, reason) => {
        if (code !== 1000) {
          console.log(`🔴 WebSocket gesloten: ${code} - ${reason || 'Geen reden'}`);
        }
      });

      // Stuur direct een ping na opening
      socket.on('open', () => {
        // Start keep-alive
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        keepAliveTimer = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.ping();
            console.log('💓 Ping verzonden naar server');
          }
        }, CONFIG.keepAliveInterval);
      });

      setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          reject(new Error('Connection timeout'));
        }
      }, 15000);

    } catch (error) {
      reject(error);
    }
  });
}

// --- 4. Bot Creatie met Aangepaste WebSocket ---
async function createBot() {
  if (isConnecting) {
    console.log('⚠️ Verbinding wordt al gemaakt, wachten...');
    return;
  }

  // Clear bestaande timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (chatTimer) {
    clearInterval(chatTimer);
    chatTimer = null;
  }

  if (bot) {
    try {
      bot.end();
    } catch (e) {}
    bot = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }

  isConnecting = true;
  isSpawned = false;
  console.log('🔄 Verbinden met ArchMC via WebSocket...');

  try {
    ws = await createCustomWebSocket();

    const stream = WebSocket.createWebSocketStream(ws, {
      encoding: 'utf8',
      highWaterMark: 16384
    });

    stream.on('error', (err) => {
      console.error('❌ Stream error:', err.message);
    });

    bot = mineflayer.createBot({
      stream: stream,
      username: CONFIG.username,
      version: CONFIG.version,
      checkTimeoutInterval: 60000,
      logErrors: true,
      hideErrors: false
    });

    // --- Bot Event Handlers ---
    isLoggedIn = false;
    isConnecting = false;

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
      reconnectAttempts = 0;
      
      // Start chat timer om regelmatig berichten te sturen
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = setInterval(() => {
        if (bot && bot.chat && isSpawned) {
          // Stuur een willekeurig bericht om de verbinding levend te houden
          const messages = [
            'Hallo! Ik ben een AFK bot 🤖',
            'Iets te doen hier?',
            'Gezellig hier!',
            'Wat een leuk server!',
            'AFK mode aan 🥱'
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          bot.chat(randomMsg);
          console.log(`💬 Keep-alive bericht: "${randomMsg}"`);
        }
      }, CONFIG.chatInterval);
      
      // Stuur een test bericht
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('Hallo! Ik ben een AFK bot 🤖');
          console.log('💬 Test bericht verzonden');
        }
      }, 3000);
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
              console.log('⏰ 10 seconden verstreken. Start AFK modus...');
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
               messageText.includes('je bent nu ingelogd') ||
               messageText.includes('Welcome')) {
        isLoggedIn = true;
        console.log('✅ Bot is succesvol ingelogd!');
      }
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
        console.log(`🖱️ Klikken op slot ${CONFIG.slotIndex + 1}...`);

        try {
          await bot.clickWindow(CONFIG.slotIndex, 0, 0);
          console.log(`✅ Geklikt op vakje ${CONFIG.slotIndex + 1}!`);

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
      isConnecting = false;
      console.log(`🔴 Verbinding verbroken: ${reason}`);
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      
      handleReconnect();
    });

    // --- Resource Pack ---
    bot.on('resourcePack', (pack) => {
      console.log('📦 Resource pack ontvangen, accepteren...');
      bot.acceptResourcePack();
    });

  } catch (error) {
    console.error('❌ Fout bij creëren bot:', error.message);
    isConnecting = false;
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
    } catch (e) {}
    bot = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }

  isConnecting = false;
  isSpawned = false;
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

  const delay = Math.min(CONFIG.reconnectDelay * reconnectAttempts, 30000);
  console.log(`🔄 Herverbinden over ${delay/1000} seconden... (poging ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(() => {
    console.log('🔄 Poging tot herverbinden...');
    createBot();
  }, delay);
}

// --- 6. Health Check ---
function periodicHealthCheck() {
  if (!bot || !bot.entity || !isSpawned) {
    console.log('⚠️ Bot lijkt niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond en actief');
    
    if (ws && ws.readyState !== WebSocket.OPEN) {
      console.log('⚠️ WebSocket is gesloten, herstellen...');
      handleReconnect();
    }
  }
}

setInterval(periodicHealthCheck, 180000);

// --- 7. Graceful Shutdown ---
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
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (chatTimer) clearInterval(chatTimer);
  if (bot) {
    bot.end();
    bot = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

// --- 8. Start ---
console.log('🚀 ArchMC AFK Bot starting...');
console.log(`📝 Gebruikersnaam: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.serverUrl}`);
console.log('✅ Bot is gestart! Monitoring via /health endpoint');

// Start de bot met een kleine vertraging
setTimeout(() => {
  createBot();
}, 2000);
