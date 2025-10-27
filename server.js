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
    status: 'waiting',
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
    console.log('🚀 Starting countdown...');
    
    countdownInterval = setInterval(() => {
        gameState.countdown--;
        io.emit('gameStateUpdate', gameState);
        
        if (gameState.countdown <= 0) {
            clearInterval(countdownInterval);
            gameState.status = 'active';
            io.emit('gameStateUpdate', gameState);
            console.log('🎯 Button activated!');
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
    console.log('🔄 Game reset');
    
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
    console.log('✅ New user connected:', socket.id);
    
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
    
    // Если игра еще не началась - запускаем
    if (gameState.status === 'waiting') {
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
            console.log(`🏆 Winner: ${user.userName}`);
            
            // Автосброс через 10 секунд
            setTimeout(resetGame, 10000);
        }
    });
    
    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('onlineUpdate', onlineUsers.size);
        console.log('❌ User disconnected:', socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📱 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
});
