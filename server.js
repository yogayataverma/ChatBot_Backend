const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sanitizeHtml = require('sanitize-html'); // Added for sanitizing user input
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Adjust CORS as per your frontend's origin
    methods: ['GET', 'POST'],
  }
});

app.use(cors());

// Keep track of connected clients and devices
const connectedClients = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle device registration
  socket.on('registerDevice', (data) => {
    const { deviceId } = data;
    connectedClients[socket.id] = deviceId;
    console.log(`Device registered: ${deviceId}`);
  });

  // Handle device unregistration on disconnect or explicit unregistration
  socket.on('unregisterDevice', (data) => {
    const { deviceId } = data;
    if (deviceId) {
      console.log(`Device unregistered: ${deviceId}`);
    }
    delete connectedClients[socket.id];
  });

  socket.on('disconnect', () => {
    const deviceId = connectedClients[socket.id];
    if (deviceId) {
      console.log(`Client disconnected: ${socket.id}, Device ID: ${deviceId}`);
    }
    delete connectedClients[socket.id];
  });

  // Listen for incoming messages from clients
  socket.on('sendMessage', (messageData) => {
    const sanitizedMessage = sanitizeHtml(messageData.message); // Sanitize message input
    const { deviceId } = messageData;

    if (sanitizedMessage && deviceId) {
      const timestamp = new Date();
      const message = {
        text: sanitizedMessage,
        deviceId,
        timestamp,
      };

      // Emit the message to all connected clients
      io.emit('message', message);

      console.log(`Message from ${deviceId}: ${sanitizedMessage}`);
    } else {
      console.warn('Invalid message or deviceId received');
    }
  });

  // Optional: handle typing indicators
  socket.on('typing', (data) => {
    const { deviceId, isTyping } = data;
    io.emit('typing', { deviceId, isTyping });
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
