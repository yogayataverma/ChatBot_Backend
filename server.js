const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const webpush = require('web-push');
const Message = require('./models/Message');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Web Push configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store connected clients and their push subscriptions
const connectedClients = new Map();
const pushSubscriptions = new Map();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle device registration
  socket.on('registerDevice', async ({ deviceId }) => {
    connectedClients.set(socket.id, deviceId);
    io.emit('userStatus', { status: 'online' });

    try {
      const previousMessages = await Message.find()
        .sort({ timestamp: 1 })
        .limit(100)
        .exec();
      socket.emit('previousMessages', previousMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  });

  // Handle push subscription
  socket.on('pushSubscription', ({ subscription }) => {
    pushSubscriptions.set(socket.id, subscription);
  });

  // Handle chat messages
  socket.on('chatMessage', async (messageData) => {
    try {
      const message = new Message({
        text: messageData.text,
        sender: messageData.sender,
        timestamp: new Date()
      });

      await message.save();
      io.emit('message', message);

      // Send push notifications to other clients
      for (const [clientId, subscription] of pushSubscriptions.entries()) {
        if (clientId !== socket.id) {
          try {
            await webpush.sendNotification(
              subscription,
              JSON.stringify({
                title: 'New Message in Connectify',
                body: `${messageData.sender}: ${messageData.text}`,
                icon: '/chat-icon.png'
              })
            );
          } catch (error) {
            console.error('Push notification error:', error);
            pushSubscriptions.delete(clientId);
          }
        }
      }
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const deviceId = connectedClients.get(socket.id);
    connectedClients.delete(socket.id);
    pushSubscriptions.delete(socket.id);

    if (connectedClients.size === 0) {
      io.emit('userStatus', { status: 'offline' });
    }
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});