const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Глобальное состояние кнопки
let buttonState = {
    clicked: false,
    winnerId: null,
    winnerName: null,
    timestamp: null
};

let onlineUsers = new Map();

// Статические файлы
app.use(express.static(path.join(__dirname)));

// API для получения состояния
app.get('/api/state', (req, res) => {
    res.json(buttonState);
});

// API для сброса состояния (для тестирования)
app.post('/api/reset', (req, res) => {
    buttonState = {
        clicked: false,
        winnerId: null,
        winnerName: null,
        timestamp: null
    };
    io.emit('buttonReset', buttonState);
    res.json({ success: true });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io соединения
io.on('connection', (socket) => {
    console.log('Новый пользователь подключен:', socket.id);
    
    // Генерируем ID пользователя
    const userId = uuidv4();
    const userName = `User_${Math.random().toString(36).substr(2, 5)}`;
    
    onlineUsers.set(socket.id, { userId, userName });
    
    // Отправляем текущее состояние новому пользователю
    socket.emit('initialState', {
        buttonState,
        userId,
        userName,
        onlineCount: onlineUsers.size
    });
    
    // Обновляем счетчик онлайн для всех
    io.emit('onlineUpdate', onlineUsers.size);
    
    // Обработка нажатия кнопки
    socket.on('buttonClick', (data) => {
        const user = onlineUsers.get(socket.id);
        
        if (!buttonState.clicked && user) {
            // Первое нажатие - устанавливаем победителя
            buttonState = {
                clicked: true,
                winnerId: user.userId,
                winnerName: user.userName,
                timestamp: Date.now()
            };
            
         // Уведомляем всех пользователей КТО победитель
io.emit('buttonClicked', buttonState);
console.log(`🎯 Победитель: ${user.userName}`);
            console.log(`Кнопка нажата пользователем: ${user.userName}`);
        }
    });
    
    // Отслеживаем отключение
    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('onlineUpdate', onlineUsers.size);
        console.log('Пользователь отключен:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Откройте: http://localhost:${PORT}`);
});
