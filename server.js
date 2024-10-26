const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
});

app.use(cors());
app.use(express.json());

// Store messages in memory (consider using a database in production)
let messages = [];
const connectedClients = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle device registration
  socket.on('registerDevice', (data) => {
    const { deviceId } = data;
    connectedClients[socket.id] = deviceId;
    console.log(`Device registered: ${deviceId}`);
    
    // Send online status to all clients
    io.emit('userStatus', { status: 'online' });
    
    // Send previous messages to newly connected client
    socket.emit('previousMessages', messages);
  });

  // Handle chat messages
  socket.on('chatMessage', (messageData) => {
    const sanitizedText = sanitizeHtml(messageData.text);
    const timestamp = new Date();
    
    const message = {
      text: sanitizedText,
      sender: messageData.sender,
      timestamp: timestamp
    };

    // Store the message
    messages.push(message);
    
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages = messages.slice(-100);
    }

    // Broadcast message to all clients
    io.emit('message', message);
    console.log(`Message from ${message.sender}: ${message.text}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const deviceId = connectedClients[socket.id];
    if (deviceId) {
      console.log(`Client disconnected: ${socket.id}, Device ID: ${deviceId}`);
      delete connectedClients[socket.id];
      
      // If no clients left, emit offline status
      if (Object.keys(connectedClients).length === 0) {
        io.emit('userStatus', { status: 'offline' });
      }
    }
  });

  // Handle explicit device unregistration
  socket.on('unregisterDevice', (data) => {
    const { deviceId } = data;
    if (deviceId) {
      console.log(`Device unregistered: ${deviceId}`);
      delete connectedClients[socket.id];
      
      // If no clients left, emit offline status
      if (Object.keys(connectedClients).length === 0) {
        io.emit('userStatus', { status: 'offline' });
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
