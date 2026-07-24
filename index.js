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
  reconnectDelay: 5000, // Korter voor sneller herstellen
  afkDelay: 10000,
  clickDelay: 2000,
  registerDelay: 2000,
  loginDelay: 2000,
  pingInterval: 30000 // Ping elke 30 seconden
};

let bot = null;
let ws = null;
let isSpawning = false;
let reconnectTimer = null;
let afkTimer = null;
let pingTimer = null;
let isLoggedIn = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// --- 3. Bot Creatie met Verbeterde WebSocket ---
function createBot() {
  // Clear bestaande timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  console.log('🔄 Verbinden met ArchMC via WebSocket...');

  try {
    // Verbeterde WebSocket met extra headers
    ws = new WebSocket(CONFIG.serverUrl, {
      origin: 'https://arch.lol',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
      },
      perMessageDeflate: false // Zet compressie uit voor betere compatibiliteit
    });

    // --- WebSocket Event Handlers ---
    ws.on('open', () => {
      console.log('✅ WebSocket verbinding opgebouwd met ArchMC!');
      reconnectAttempts = 0;
      
      // Start ping interval om verbinding levend te houden
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          // Stuur een ping frame
          ws.ping();
          console.log('💓 Ping verzonden naar server');
        } else {
          console.log('⚠️ WebSocket niet open, ping overslaan');
        }
      }, CONFIG.pingInterval);
    });

    ws.on('ping', (data) => {
      // Reageer op ping van server met pong
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.pong(data);
        console.log('💓 Pong terug gestuurd naar server');
      }
    });

    ws.on('pong', (data) => {
      console.log('💓 Pong ontvangen van server');
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket Fout:', err.message);
      if (err.message.includes('Unexpected server response')) {
        console.log('⚠️ Server gaf onverwachte response, probeer alternatieve verbinding...');
        // Probeer zonder extra headers
        reconnectWithFallback();
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`🔴 WebSocket gesloten: ${code} - ${reason || 'Geen reden'}`);
      
      // Specifieke error codes afhandelen
      if (code === 1006) {
        console.log('⚠️ Abnormale sluiting (1006) - waarschijnlijk netwerkprobleem');
      } else if (code === 1000) {
        console.log('✅ Normale sluiting - bot is gestopt');
      } else if (code === 1001) {
        console.log('⚠️ Server gaat weg - wachten op herverbinding');
      }
      
      if (bot) {
        bot.end();
        bot = null;
      }
      
      handleReconnect();
    });

    // --- Mineflayer Bot met WebSocket Stream ---
    const stream = WebSocket.createWebSocketStream(ws, {
      encoding: 'utf8',
      highWaterMark: 16384
    });

    stream.on('error', (err) => {
      console.error('❌ Stream fout:', err.message);
    });

    bot = mineflayer.createBot({
      stream: stream,
      username: CONFIG.username,
      version: CONFIG.version,
      checkTimeoutInterval: 60000, // Langer timeout voor stabiliteit
      reconnectDelay: 1000,
      logErrors: true,
      hideErrors: false
    });

    // --- Bot Event Handlers ---
    let isSpawned = false;
    isLoggedIn = false;

    bot.once('spawn', () => {
      if (isSpawned) return;
      isSpawned = true;
      isSpawning = false;
      console.log('✅ Bot is gespawned in de wereld!');
      console.log(`📍 Bot naam: ${bot.username}`);
      
      // Stuur een hallo bericht om te testen of de bot werkt
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat('Hallo! Ik ben een AFK bot');
        }
      }, 3000);
    });

    // --- Login & Register via Chat ---
    bot.on('message', (jsonMsg) => {
      const messageText = jsonMsg.toString();
      console.log(`💬 Chat: ${messageText}`);

      if (!isSpawned) return;

      // Controleer of we moeten registreren of inloggen
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

            // Start AFK timer na inloggen
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

    // --- Menu / GUI Interactie ---
    bot.on('windowOpen', async (window) => {
      console.log(`📂 GUI Menu geopend: "${window.title}"`);
      
      // Check of het de juiste GUI is
      if (window.title.includes('Kies') || window.title.includes('Menu') || window.title.includes('Server')) {
        console.log(`🖱️ Klikken op slot ${CONFIG.slotIndex + 1}...`);

        try {
          // Eerst proberen met normale klik
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
          
          // Probeer alternatieve methodes
          try {
            console.log('🔄 Probeer alternatieve klik...');
            await bot.clickWindow(CONFIG.slotIndex, 0, 1);
            console.log('✅ Alternatieve klik gelukt!');
          } catch (err2) {
            console.error('❌ Alle klik methodes mislukt:', err2.message);
            
            // Fallback: stuur gewoon /afk zonder klik
            setTimeout(() => {
              if (bot && bot.chat) {
                bot.chat('/afk');
                console.log('💤 /afk verzonden (fallback)');
              }
            }, CONFIG.clickDelay);
          }
        }
      } else {
        console.log('⚠️ Onbekende GUI, overslaan...');
      }
    });

    // --- Error Handling ---
    bot.on('error', (err) => {
      console.error('❌ Bot Fout:', err.message);
      if (err.message.includes('ECONNRESET') || 
          err.message.includes('ETIMEDOUT') ||
          err.message.includes('socket closed')) {
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

    // --- End ---
    bot.on('end', (reason) => {
      isSpawned = false;
      isLoggedIn = false;
      isSpawning = false;
      console.log(`🔴 Verbinding verbroken: ${reason}`);
      
      // Als de WebSocket nog open is, sluit deze
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
    handleReconnect();
  }
}

// --- 4. Fallback verbinding zonder extra headers ---
function reconnectWithFallback() {
  console.log('🔄 Poging met fallback verbinding...');
  try {
    if (ws) {
      ws.close();
      ws = null;
    }
    
    ws = new WebSocket(CONFIG.serverUrl, {
      origin: 'https://arch.lol'
    });
    
    // Rest van de setup...
    // (vereenvoudigde versie zonder extra headers)
  } catch (err) {
    console.error('❌ Fallback mislukt:', err.message);
    handleReconnect();
  }
}

// --- 5. Reconnect Logic met limiet ---
function handleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try {
      bot.end();
    } catch (e) {
      // Negeer
    }
    bot = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (e) {
      // Negeer
    }
    ws = null;
  }

  reconnectAttempts++;
  
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(`⚠️ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) bereikt, wachten met exponentiele backoff...`);
    // Reset na een langere pauze
    setTimeout(() => {
      reconnectAttempts = 0;
      console.log('🔄 Reset reconnect attempts, opnieuw proberen...');
      createBot();
    }, 60000);
    return;
  }

  const delay = Math.min(CONFIG.reconnectDelay * Math.pow(1.5, reconnectAttempts - 1), 60000);
  console.log(`🔄 Herverbinden over ${delay/1000} seconden... (poging ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(() => {
    console.log('🔄 Poging tot herverbinden...');
    createBot();
  }, delay);
}

// --- 6. Periodieke Health Check ---
function periodicHealthCheck() {
  if (!bot || !bot.entity) {
    console.log('⚠️ Bot lijkt niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond en actief');
    
    // Extra check: als WebSocket gesloten is maar bot nog leeft
    if (ws && ws.readyState !== WebSocket.OPEN) {
      console.log('⚠️ WebSocket is gesloten maar bot leeft nog, herstellen...');
      handleReconnect();
    }
  }
}

// Elke 3 minuten check (i.p.v. 5 voor snellere detectie)
setInterval(periodicHealthCheck, 180000);

// --- 7. Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  cleanup();
  process.exit(0);
});

function cleanup() {
  if (pingTimer) clearInterval(pingTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (afkTimer) clearTimeout(afkTimer);
  if (bot) {
    bot.end();
    bot = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

// --- 8. Start de bot ---
console.log('🚀 ArchMC AFK Bot starting...');
console.log(`📝 Gebruikersnaam: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.serverUrl}`);
createBot();

console.log('✅ Bot is gestart! Monitoring via /health endpoint');
