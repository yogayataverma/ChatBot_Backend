// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store messages in memory for simplicity
let messages = [];

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send previous messages to newly connected client
  socket.emit('previousMessages', messages);

  // Handle new messages
  socket.on('chatMessage', (message) => {
    messages.push(message);
    io.emit('message', message);
  });

  // Handle device registration
  socket.on('registerDevice', ({ deviceId }) => {
    socket.deviceId = deviceId;
    socket.emit('userStatus', { status: 'online' });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});