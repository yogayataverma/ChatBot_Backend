const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",  // Frontend origin
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Message schema
const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// Handle Socket.IO connections
io.on('connection', async (socket) => {
    console.log('New client connected');

    // Fetch all previous messages from the database and send to the client
    try {
        const messages = await Message.find().sort({ timestamp: 1 });
        socket.emit('previousMessages', messages);  // Send all previous messages to the connected client
    } catch (err) {
        console.error('Error fetching messages:', err);
    }

    // Listen for incoming chat messages from clients
    socket.on('chatMessage', async (msg) => {
        const newMessage = new Message({
            sender: msg.sender,  // Sender is 'me' or 'other'
            text: msg.text
        });

        try {
            // Save message to MongoDB
            await newMessage.save();
            console.log('Message saved to DB');
        } catch (err) {
            console.error('Error saving message to DB:', err);
        }

        // Broadcast the entire message object to all connected clients except the sender
        socket.broadcast.emit('message', msg);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
