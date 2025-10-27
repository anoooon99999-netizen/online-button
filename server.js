const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Глобальное состояние
let gameState = {
    status: 'active',
    publicButtons: [],
    privateChats: new Map() // chatId -> { users: [], messages: [], buttonId }
};

let onlineUsers = new Map();

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io
io.on('connection', (socket) => {
    console.log('✅ New user connected:', socket.id);
    
    const userId = uuidv4();
    const userName = `User_${Math.random().toString(36).substr(2, 5)}`;
    
    onlineUsers.set(socket.id, { userId, userName, socketId: socket.id });
    
    // Отправляем текущее состояние
    socket.emit('initialState', {
        gameState: {
            status: gameState.status,
            publicButtons: gameState.publicButtons
        },
        userId,
        userName,
        onlineCount: onlineUsers.size
    });
    
    io.emit('onlineUpdate', onlineUsers.size);
    
    // Создание новой кнопки
    socket.on('createButton', (data) => {
        const user = onlineUsers.get(socket.id);
        if (!user) return;
        
        const buttonId = uuidv4();
        const newButton = {
            id: buttonId,
            creatorId: user.userId,
            creatorName: user.userName,
            title: data.title || `Кнопка от ${user.userName}`,
            description: data.description || 'Присоединяйтесь ко мне в чат!',
            userCount: 1,
            maxUsers: data.maxUsers || 10,
            createdAt: Date.now(),
            users: [user.userId]
        };
        
        // Создаем приватный чат для этой кнопки
        const chatId = uuidv4();
        gameState.privateChats.set(chatId, {
            buttonId: buttonId,
            users: [user.userId],
            messages: [],
            creatorId: user.userId
        });
        
        gameState.publicButtons.push(newButton);
        
        // Присоединяем создателя к комнате
        socket.join(chatId);
        
        io.emit('buttonCreated', newButton);
        console.log(`🆕 New button created by ${user.userName}: ${newButton.title}`);
    });
    
    // Присоединение к существующей кнопке
    socket.on('joinButton', (data) => {
        const user = onlineUsers.get(socket.id);
        const button = gameState.publicButtons.find(b => b.id === data.buttonId);
        
        if (!user || !button) return;
        
        // Проверяем можно ли присоединиться
        if (button.users.length >= button.maxUsers) {
            socket.emit('buttonFull', { buttonId: data.buttonId });
            return;
        }
        
        if (button.users.includes(user.userId)) {
            socket.emit('alreadyJoined', { buttonId: data.buttonId });
            return;
        }
        
        // Находим чат для этой кнопки
        let targetChat = null;
        for (let [chatId, chat] of gameState.privateChats) {
            if (chat.buttonId === data.buttonId) {
                targetChat = { chatId, chat };
                break;
            }
        }
        
        if (!targetChat) return;
        
        // Добавляем пользователя в кнопку и чат
        button.users.push(user.userId);
        button.userCount = button.users.length;
        targetChat.chat.users.push(user.userId);
        
        // Присоединяем пользователя к комнате чата
        socket.join(targetChat.chatId);
        
        // Уведомляем всех в чате о новом пользователе
        io.to(targetChat.chatId).emit('userJoined', {
            userId: user.userId,
            userName: user.userName,
            userCount: button.userCount
        });
        
        // Отправляем историю сообщений новому пользователю
        socket.emit('chatHistory', {
            buttonId: data.buttonId,
            messages: targetChat.chat.messages,
            users: button.users.map(userId => {
                const user = Array.from(onlineUsers.values()).find(u => u.userId === userId);
                return user ? user.userName : 'Unknown';
            })
        });
        
        io.emit('buttonUpdated', button);
        console.log(`👥 ${user.userName} joined button: ${button.title}`);
    });
    
    // Отправка сообщения в приватный чат
    socket.on('sendPrivateMessage', (data) => {
        const user = onlineUsers.get(socket.id);
        if (!user) return;
        
        // Находим чат где находится пользователь
        let targetChat = null;
        for (let [chatId, chat] of gameState.privateChats) {
            if (chat.users.includes(user.userId)) {
                targetChat = { chatId, chat };
                break;
            }
        }
        
        if (!targetChat) return;
        
        const message = {
            id: uuidv4(),
            userId: user.userId,
            userName: user.userName,
            text: data.text,
            timestamp: Date.now(),
            isSystem: false
        };
        
        targetChat.chat.messages.push(message);
        
        // Отправляем сообщение только участникам этого чата
        io.to(targetChat.chatId).emit('newPrivateMessage', message);
    });
    
    // Покидание кнопки/чата
    socket.on('leaveButton', (data) => {
        const user = onlineUsers.get(socket.id);
        if (!user) return;
        
        // Находим кнопку и чат
        const button = gameState.publicButtons.find(b => b.users.includes(user.userId));
        if (!button) return;
        
        let targetChat = null;
        for (let [chatId, chat] of gameState.privateChats) {
            if (chat.buttonId === button.id) {
                targetChat = { chatId, chat };
                break;
            }
        }
        
        if (!targetChat) return;
        
        // Удаляем пользователя
        button.users = button.users.filter(id => id !== user.userId);
        button.userCount = button.users.length;
        targetChat.chat.users = targetChat.chat.users.filter(id => id !== user.userId);
        
        // Покидаем комнату
        socket.leave(targetChat.chatId);
        
        // Уведомляем остальных
        io.to(targetChat.chatId).emit('userLeft', {
            userId: user.userId,
            userName: user.userName,
            userCount: button.userCount
        });
        
        // Если кнопка пустая - удаляем её
        if (button.users.length === 0) {
            gameState.publicButtons = gameState.publicButtons.filter(b => b.id !== button.id);
            gameState.privateChats.delete(targetChat.chatId);
            io.emit('buttonRemoved', { buttonId: button.id });
        } else {
            io.emit('buttonUpdated', button);
        }
        
        console.log(`🚪 ${user.userName} left button: ${button.title}`);
    });
    
    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            // Автоматически покидаем все кнопки при отключении
            const button = gameState.publicButtons.find(b => b.users.includes(user.userId));
            if (button) {
                // Эмулируем событие leaveButton
                const eventData = { buttonId: button.id };
                socket.emit('leaveButton', eventData);
                
                // Находим чат и уведомляем остальных
                for (let [chatId, chat] of gameState.privateChats) {
                    if (chat.buttonId === button.id) {
                        io.to(chatId).emit('userLeft', {
                            userId: user.userId,
                            userName: user.userName,
                            userCount: button.users.length - 1,
                            isDisconnect: true
                        });
                        break;
                    }
                }
            }
        }
        
        onlineUsers.delete(socket.id);
        io.emit('onlineUpdate', onlineUsers.size);
        console.log('❌ User disconnected:', socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
});
