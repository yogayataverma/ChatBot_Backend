const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sanitizeHtml = require('sanitize-html');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
});

// Use the MongoDB connection URI (replace with your actual URI)
const MONGO_URI = 'your-mongodb-connection-string';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Define a message schema
const messageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  sender: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// Create a message model
const Message = mongoose.model('Message', messageSchema);

app.use(cors());
app.use(express.json());

// Store connected clients and statuses
const connectedClients = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle device registration
  socket.on('registerDevice', async (data) => {
    const { deviceId } = data;
    connectedClients[socket.id] = deviceId;
    console.log(`Device registered: ${deviceId}`);

    // Send user online status to all clients
    io.emit('userStatus', { status: 'online' });

    // Fetch and send previous messages from MongoDB
    try {
      const previousMessages = await Message.find().sort({ timestamp: 1 }).limit(100).exec();
      socket.emit('previousMessages', previousMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  });

  // Handle chat messages
  socket.on('chatMessage', async (messageData) => {
    const sanitizedText = sanitizeHtml(messageData.text);

    const message = new Message({
      text: sanitizedText,
      sender: messageData.sender,
    });

    try {
      // Save the message to the database
      await message.save();

      // Broadcast the message to all clients
      io.emit('message', message);
      console.log(`Message from ${message.sender}: ${message.text}`);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const deviceId = connectedClients[socket.id];
    if (deviceId) {
      console.log(`Client disconnected: ${socket.id}, Device ID: ${deviceId}`);
      delete connectedClients[socket.id];

      // Emit offline status if no clients left
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
