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

// Middleware
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
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Store connected clients and their push subscriptions
const connectedClients = new Map();
const pushSubscriptions = new Map();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('registerDevice', async ({ deviceId }) => {
    console.log(`Registering device: ${deviceId}`);
    connectedClients.set(socket.id, deviceId);
    io.emit('userStatus', { status: 'online' });

    try {
      const previousMessages = await Message.find()
        .sort({ timestamp: -1 })
        .limit(100)
        .exec();
      socket.emit('previousMessages', previousMessages.reverse());
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  });

  socket.on('pushSubscription', ({ subscription }) => {
    console.log(`Storing push subscription for client: ${socket.id}`);
    pushSubscriptions.set(socket.id, subscription);
  });

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
      const notificationPromises = [];
      for (const [clientId, subscription] of pushSubscriptions.entries()) {
        if (clientId !== socket.id) {
          const notificationPayload = JSON.stringify({
            title: 'New Message in Connectify',
            body: `${messageData.sender}: ${messageData.text.substring(0, 100)}${messageData.text.length > 100 ? '...' : ''}`,
            icon: '/chat-icon.png',
            timestamp: new Date().toISOString()
          });

          const pushPromise = webpush.sendNotification(subscription, notificationPayload)
            .catch((error) => {
              console.error(`Push notification error for client ${clientId}:`, error);
              if (error.statusCode === 410 || error.statusCode === 404) {
                pushSubscriptions.delete(clientId);
              }
              return null;
            });

          notificationPromises.push(pushPromise);
        }
      }

      await Promise.allSettled(notificationPromises);

    } catch (err) {
      console.error('Error handling chat message:', err);
    }
  });

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