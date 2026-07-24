const mineflayer = require('mineflayer');
const express = require('express');
const { SocksClient } = require('socks');
const net = require('net');

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
    status: bot && bot.entity ? 'healthy' : 'unhealthy',
    connection: bot ? 'active' : 'inactive'
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

// --- 3. Proxy Setup ---

// Gratis proxy lijst (test deze, sommige werken)
const PROXY_LIST = [
  { host: '45.61.180.200', port: 1080, type: 5 },
  { host: '45.61.184.224', port: 1080, type: 5 },
  { host: '45.61.180.100', port: 1080, type: 5 },
  { host: '45.61.180.150', port: 1080, type: 5 },
  { host: '45.61.180.250', port: 1080, type: 5 },
  { host: '45.61.185.100', port: 1080, type: 5 },
  { host: '45.61.185.150', port: 1080, type: 5 },
  { host: '45.61.185.200', port: 1080, type: 5 },
  { host: '45.61.187.100', port: 1080, type: 5 },
  { host: '45.61.187.150', port: 1080, type: 5 },
  // Fallback SOCKS5 proxies
  { host: '51.15.85.7', port: 1080, type: 5 },
  { host: '51.15.85.8', port: 1080, type: 5 },
  { host: '51.15.85.9', port: 1080, type: 5 },
];

let currentProxyIndex = 0;
let proxyAttempts = 0;
const MAX_PROXY_ATTEMPTS = PROXY_LIST.length * 3;

// --- 4. Proxy Connection Function ---
function createProxyConnection(proxy) {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Probeer proxy: ${proxy.host}:${proxy.port}`);
    
    // Test of de proxy werkt met een snelle verbinding
    const testSocket = net.createConnection({
      host: proxy.host,
      port: proxy.port,
      timeout: 5000
    });

    testSocket.on('connect', () => {
      console.log(`✅ Proxy ${proxy.host}:${proxy.port} is bereikbaar`);
      testSocket.destroy();
      resolve(proxy);
    });

    testSocket.on('error', (err) => {
      console.log(`❌ Proxy ${proxy.host}:${proxy.port} niet bereikbaar: ${err.message}`);
      testSocket.destroy();
      reject(err);
    });

    testSocket.on('timeout', () => {
      console.log(`⏰ Proxy ${proxy.host}:${proxy.port} timeout`);
      testSocket.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// --- 5. Proxy Connection voor Mineflayer ---
function connectWithProxy(proxy) {
  return (client) => {
    console.log(`🔗 Verbinden via proxy ${proxy.host}:${proxy.port}...`);

    const options = {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: proxy.type || 5
      },
      destination: {
        host: CONFIG.host,
        port: CONFIG.port
      }
    };

    // Gebruik SOCKS client om verbinding te maken
    SocksClient.createConnection(options, (err, info) => {
      if (err) {
        console.error('❌ SOCKS verbinding mislukt:', err.message);
        // Probeer volgende proxy
        tryNextProxy();
        return;
      }

      console.log('✅ SOCKS verbinding geslaagd!');
      
      // Verbind de socket met mineflayer
      const socket = info.socket;
      
      // Forward events
      socket.on('data', (data) => {
        client.emit('data', data);
      });

      socket.on('error', (err) => {
        console.error('❌ Socket error:', err.message);
        client.emit('error', err);
      });

      socket.on('close', () => {
        console.log('🔴 Socket gesloten');
        client.emit('end');
      });

      socket.on('end', () => {
        console.log('🔴 Socket ended');
        client.emit('end');
      });

      // Stuur data van client naar socket
      client.write = (data) => {
        if (socket.writable) {
          socket.write(data);
        }
      };

      client.end = () => {
        if (socket.writable) {
          socket.end();
        }
      };

      // Emit connect event
      client.emit('connect');
    });
  };
}

// --- 6. Bot Creatie met Proxy ---
function tryNextProxy() {
  proxyAttempts++;
  
  if (proxyAttempts > MAX_PROXY_ATTEMPTS) {
    console.log('❌ Alle proxies geprobeerd, wachten en opnieuw...');
    setTimeout(() => {
      proxyAttempts = 0;
      currentProxyIndex = 0;
      createBot();
    }, 60000);
    return;
  }

  currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
  console.log(`🔄 Probeer proxy ${proxyAttempts}/${MAX_PROXY_ATTEMPTS}`);
  createBot();
}

function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  const proxy = PROXY_LIST[currentProxyIndex];
  console.log(`🔄 Verbinden via proxy ${proxy.host}:${proxy.port}...`);

  try {
    // Test proxy eerst
    createProxyConnection(proxy)
      .then(() => {
        // Proxy werkt, maak bot
        bot = mineflayer.createBot({
          host: CONFIG.host,
          port: CONFIG.port,
          username: CONFIG.username,
          version: CONFIG.version,
          connect: connectWithProxy(proxy),
          checkTimeoutInterval: 60000
        });

        setupBotHandlers();
      })
      .catch(() => {
        console.log('❌ Proxy test mislukt, probeer volgende...');
        tryNextProxy();
      });

  } catch (error) {
    console.error('❌ Fout bij creëren bot:', error.message);
    tryNextProxy();
  }
}

// --- 7. Bot Event Handlers ---
function setupBotHandlers() {
  let isSpawned = false;
  let isLoggedIn = false;

  bot.on('error', (err) => {
    console.error('❌ Bot error:', err.message);
    if (err.message.includes('ECONNRESET') || 
        err.message.includes('ETIMEDOUT')) {
      handleReconnect();
    }
  });

  bot.once('spawn', () => {
    if (isSpawned) return;
    isSpawned = true;
    console.log('✅ Bot is gespawned!');
    console.log(`📍 Bot naam: ${bot.username}`);
    
    // Reset proxy attempts bij succes
    proxyAttempts = 0;
    
    // Stuur test bericht
    setTimeout(() => {
      if (bot && bot.chat) {
        bot.chat('Hallo! Ik ben een AFK bot 🤖');
        console.log('💬 Test bericht verzonden');
      }
    }, 3000);
  });

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
      }, 2000);
    } 
    else if (messageText.includes('/login') && !isLoggedIn) {
      console.log('🔑 /login gedetecteerd');
      setTimeout(() => {
        if (bot && bot.chat) {
          bot.chat(`/login ${CONFIG.password}`);
          console.log('✅ /login verzonden');
          isLoggedIn = true;

          // AFK modus na 10 seconden
          setTimeout(() => {
            console.log('⏰ Start AFK modus...');
            if (bot && bot.activateItem) {
              bot.activateItem();
              console.log('🖱️ Rechtermuisklik uitgevoerd');
            }
          }, 10000);
        }
      }, 2000);
    }
    else if (messageText.includes('succesvol ingelogd') || 
             messageText.includes('Welcome')) {
      isLoggedIn = true;
      console.log('✅ Bot is succesvol ingelogd!');
    }
    else if (messageText.includes('AFK')) {
      console.log('💤 AFK modus actief!');
    }
  });

  bot.on('windowOpen', async (window) => {
    console.log(`📂 GUI geopend: "${window.title}"`);
    
    if (window.title.includes('Kies') || window.title.includes('Menu')) {
      try {
        await bot.clickWindow(13, 0, 0);
        console.log('✅ Geklikt op vakje 14!');

        setTimeout(() => {
          if (bot && bot.chat) {
            bot.chat('/afk');
            console.log('💤 /afk verzonden');
          }
        }, 2000);
      } catch (err) {
        console.error('❌ Fout bij klikken:', err.message);
      }
    }
  });

  bot.on('kicked', (reason) => {
    isSpawned = false;
    isLoggedIn = false;
    console.log(`👢 Bot is gekicked: ${reason}`);
    
    // Als het VPN detectie is, probeer volgende proxy
    if (reason.includes('VPN')) {
      console.log('🔄 VPN detectie, wissel van proxy...');
      tryNextProxy();
    } else {
      handleReconnect();
    }
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
}

// --- 8. Reconnect Logic ---
function handleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    try { bot.end(); } catch (e) {}
    bot = null;
  }

  console.log('🔄 Herverbinden over 5 seconden...');
  reconnectTimer = setTimeout(() => {
    // Probeer volgende proxy
    tryNextProxy();
  }, 5000);
}

// --- 9. Health Check ---
setInterval(() => {
  if (!bot || !bot.entity) {
    console.log('⚠️ Bot niet actief, herstarten...');
    handleReconnect();
  } else {
    console.log('✅ Bot is gezond');
  }
}, 180000);

// --- 10. Start ---
console.log('🚀 ArchMC Bot starting...');
console.log(`📝 Bot: ${CONFIG.username}`);
console.log(`🌐 Server: ${CONFIG.host}:${CONFIG.port}`);
console.log(`🔢 Proxies beschikbaar: ${PROXY_LIST.length}`);

// Start met verbinden
setTimeout(() => {
  createBot();
}, 2000);

// --- 11. Graceful Shutdown ---
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

function cleanup() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) { bot.end(); bot = null; }
}
