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
    status: 'waiting', // waiting, countdown, active, finished
    countdown: 30,
    buttonState: {
        clicked: false,
        winnerId: null,
        winnerName: null,
        timestamp: null
    }
};

let onlineUsers = new Map();
let countdownInterval = null;

// Статические файлы
app.use(express.static(path.join(__dirname)));

// Функция старта обратного отсчета
function startCountdown() {
    gameState.status = 'countdown';
    gameState.countdown = 30;
    
    io.emit('gameStateUpdate', gameState);
    
    countdownInterval = setInterval(() => {
        gameState.countdown--;
        io.emit('gameStateUpdate', gameState);
        
        if (gameState.countdown <= 0) {
            clearInterval(countdownInterval);
            gameState.status = 'active';
            io.emit('gameStateUpdate', gameState);
        }
    }, 1000);
}

// Функция сброса игры
function resetGame() {
    clearInterval(countdownInterval);
    gameState = {
        status: 'waiting',
        countdown: 30,
        buttonState: {
            clicked: false,
            winnerId: null,
            winnerName: null,
            timestamp: null
        }
    };
    io.emit('gameStateUpdate', gameState);
    
    // Автоматически запускаем новый отсчет через 5 секунд
    setTimeout(startCountdown, 5000);
}

// API
app.get('/api/state', (req, res) => {
    res.json(gameState);
});

app.post('/api/reset', (req, res) => {
    resetGame();
    res.json({ success: true });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io
io.on('connection', (socket) => {
    console.log('Новый пользователь:', socket.id);
    
    const userId = uuidv4();
    const userName = `User_${Math.random().toString(36).substr(2, 5)}`;
    
    onlineUsers.set(socket.id, { userId, userName });
    
    // Отправляем текущее состояние
    socket.emit('initialState', {
        gameState,
        userId,
        userName,
        onlineCount: onlineUsers.size
    });
    
    // Если игра еще не началась и есть минимум 2 игрока - запускаем
    if (gameState.status === 'waiting' && onlineUsers.size >= 1) {
        startCountdown();
    }
    
    io.emit('onlineUpdate', onlineUsers.size);
    
    // Обработка нажатия кнопки
    socket.on('buttonClick', (data) => {
        const user = onlineUsers.get(socket.id);
        
        if (gameState.status === 'active' && !gameState.buttonState.clicked && user) {
            gameState.buttonState = {
                clicked: true,
                winnerId: user.userId,
                winnerName: user.userName,
                timestamp: Date.now()
            };
            gameState.status = 'finished';
            
            io.emit('buttonClicked', gameState.buttonState);
            console.log(`🏆 Победитель: ${user.userName}`);
            
            // Автосброс через 10 секунд
            setTimeout(resetGame, 10000);
        }
    });
    
    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('onlineUpdate', onlineUsers.size);
        console.log('Пользователь отключен:', socket.id);
    });
});

// Автозапуск при старте сервера
setTimeout(() => {
    if (gameState.status === 'waiting') {
        startCountdown();
    }
}, 2000);

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
