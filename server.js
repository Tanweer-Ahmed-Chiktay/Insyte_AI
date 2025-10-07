// Load environment variables from .env file
require('dotenv').config()

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

// Import WebSocket manager
const { wsManager } = require('./lib/websocket/websocket-server.js')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT || 3000

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // Be sure to pass `true` as the second argument to `url.parse`.
      // This tells it to parse the query portion of the URL.
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  // Initialize a dedicated HTTP server for WebSocket to avoid conflicts with Next's upgrade handler
  const wsHttpServer = createServer()
  const wsPort = process.env.WS_PORT || 3001
  wsManager.initialize(wsHttpServer)
  wsHttpServer.listen(wsPort, () => {
    console.log(`> WebSocket server ready on ws://localhost:${wsPort}`)
  })



  // Properly forward non-WS upgrades (e.g., HMR) to Next.js while leaving /api/ws
  // to be handled by the ws library attached above.
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '', true)

    // Our WebSocket server runs on a separate port now; no special handling here

    const upgradeHandler = app.getUpgradeHandler && app.getUpgradeHandler()
    if (upgradeHandler) {
      return upgradeHandler(request, socket, head)
    }

    // If no upgrade handler available, close
    socket.destroy()
  })

  server
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully')
    wsManager.shutdown()
    wsHttpServer.close(() => {
      console.log('WebSocket server closed')
    })
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully')
    wsManager.shutdown()
    wsHttpServer.close(() => {
      console.log('WebSocket server closed')
    })
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
})