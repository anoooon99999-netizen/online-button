const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Простое логирование
console.log('🚀 Starting Online Button Server...');

// Раздаем статические файлы
app.use(express.static(__dirname));

// Главная страница - ПРОСТОЙ HTML
app.get('/', (req, res) => {
  console.log('📨 Serving main page');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>🎯 Онлайн Кнопка</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0;
            }
            .container {
                background: white;
                color: black;
                padding: 40px;
                border-radius: 20px;
                max-width: 500px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            h1 {
                color: #2c3e50;
                margin-bottom: 20px;
            }
            button {
                padding: 20px 40px;
                font-size: 20px;
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                margin: 20px 0;
            }
            #status {
                margin: 20px 0;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎯 Онлайн Кнопка</h1>
            <p>Тестовая версия - работает!</p>
            
            <button onclick="this.innerHTML='🎉 Нажато!'">Нажми меня</button>
            
            <div id="status">
                <p>✅ Сервер запущен успешно</p>
                <p>Ссылка: https://online-button-1.onrender.com</p>
            </div>
            
            <p><strong>Следующий шаг:</strong> Добавим онлайн-синхронизацию</p>
        </div>
    </body>
    </html>
  `);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server started on port', PORT);
  console.log('📱 URL:', process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`);
});
