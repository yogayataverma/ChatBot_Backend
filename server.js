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
        origin: "https://sweetconnectify.netlify.app",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: "https://sweetconnectify.netlify.app",
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

    // Send online status to all clients
    io.emit('userStatus', { status: 'online' });

    // Fetch all previous messages from the database and send to the client
    try {
        const messages = await Message.find().sort({ timestamp: 1 });
        socket.emit('previousMessages', messages);
    } catch (err) {
        console.error('Error fetching messages:', err);
    }

    // Listen for incoming chat messages from clients
    socket.on('chatMessage', async (msg) => {
        const newMessage = new Message({
            sender: msg.sender,
            text: msg.text,
            timestamp: new Date()
        });

        try {
            // Save message to MongoDB
            await newMessage.save();
            console.log('Message saved to DB');
            
            // Broadcast the message to all connected clients except the sender
            socket.broadcast.emit('message', {
                ...msg,
                timestamp: newMessage.timestamp
            });
        } catch (err) {
            console.error('Error saving message to DB:', err);
            socket.emit('error', 'Failed to save message');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        io.emit('userStatus', { status: 'offline' });
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));