const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Состояние игры
let gameState = {
    status: 'waiting', // waiting, countdown, active, finished, chat
    countdown: 10,
    buttons: [],
    correctButtonId: null,
    winner: null,
    messages: []
};

let onlineUsers = new Map();
let countdownInterval = null;

// Генерируем кнопки
function generateButtons() {
    const buttons = [];
    const correctIndex = Math.floor(Math.random() * 6); // 0-5
    
    for (let i = 0; i < 6; i++) {
        buttons.push({
            id: `btn_${i}`,
            text: i === correctIndex ? '🎯 Верная кнопка' : `Кнопка ${i + 1}`,
            isCorrect: i === correctIndex,
            visible: true
        });
    }
    
    return { buttons, correctButtonId: `btn_${correctIndex}` };
}

// Старт игры
function startGame() {
    const { buttons, correctButtonId } = generateButtons();
    gameState = {
        status: 'countdown',
        countdown: 10,
        buttons,
        correctButtonId,
        winner: null,
        messages: []
    };
    
    io.emit('gameStateUpdate', gameState);
    console.log('🎮 New game started! Correct button:', correctButtonId);
    
    countdownInterval = setInterval(() => {
        gameState.countdown--;
        io.emit('gameStateUpdate', gameState);
        
        if (gameState.countdown <= 0) {
            clearInterval(countdownInterval);
            gameState.status = 'active';
            io.emit('gameStateUpdate', gameState);
            console.log('🎯 Buttons activated!');
        }
    }, 1000);
}

// Сброс игры
function resetGame() {
    clearInterval(countdownInterval);
    setTimeout(startGame, 5000);
}

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
    
    onlineUsers.set(socket.id, { userId, userName });
    
    // Отправляем текущее состояние
    socket.emit('initialState', {
        gameState,
        userId,
        userName,
        onlineCount: onlineUsers.size
    });
    
    // Если игра не активна - запускаем
    if (gameState.status === 'waiting') {
        startGame();
    }
    
    io.emit('onlineUpdate', onlineUsers.size);
    
    // Обработка нажатия кнопки
    socket.on('buttonClick', (data) => {
        const user = onlineUsers.get(socket.id);
        const button = gameState.buttons.find(btn => btn.id === data.buttonId);
        
        if (gameState.status === 'active' && button && button.visible && user) {
            if (button.isCorrect) {
                // Правильная кнопка!
                gameState.status = 'chat';
                gameState.winner = {
                    userId: user.userId,
                    userName: user.userName,
                    timestamp: Date.now()
                };
                
                // Скрываем верную кнопку
                button.visible = false;
                
                io.emit('correctButtonClicked', {
                    winner: gameState.winner,
                    updatedButtons: gameState.buttons
                });
                
                console.log(`🏆 Winner found: ${user.userName}`);
                
                // Автосброс через 30 секунд
                setTimeout(resetGame, 30000);
            } else {
                // Неправильная кнопка
                socket.emit('wrongButton');
                console.log(`❌ Wrong button clicked by: ${user.userName}`);
            }
        }
    });
    
    // Обработка сообщений чата
    socket.on('sendMessage', (data) => {
        const user = onlineUsers.get(socket.id);
        if (user && gameState.status === 'chat') {
            const message = {
                id: uuidv4(),
                userId: user.userId,
                userName: user.userName,
                text: data.text,
                timestamp: Date.now()
            };
            
            gameState.messages.push(message);
            io.emit('newMessage', message);
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
});
