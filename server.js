require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startMatchExpiryJob } = require('./src/jobs/expireMatchRequests');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  const server = http.createServer(app);

  // Socket.io powers live tracking (module 5): the customer's app joins
  // `booking:<id>` and receives `tracking:update` events as the rider's
  // location pings come in. REST polling via GET /api/tracking/:bookingId
  // remains available as a fallback for clients that don't use sockets.
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || '*' },
  });

  io.on('connection', (socket) => {
    socket.on('booking:subscribe', (bookingId) => {
      socket.join(`booking:${bookingId}`);
    });
    socket.on('booking:unsubscribe', (bookingId) => {
      socket.leave(`booking:${bookingId}`);
    });
  });

  app.set('io', io); // so controllers can do req.app.get('io').to(...).emit(...)

  server.listen(PORT, () => {
    console.log(`[Server] MustyRide API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  startMatchExpiryJob();
}

start();
