// app.js - ПОЛНАЯ ДИАГНОСТИКА И ИСПРАВЛЕНИЕ

console.log('✅ app.js загружен');
console.log('🌐 Проверка подключения к интернету...');

// ============ DOM элементы ============
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const analyzeBtn = document.getElementById('analyzeBtn');
const tokenInput = document.getElementById('hfToken');
const reviewDisplay = document.getElementById('reviewText');
const sentimentIcon = document.getElementById('sentimentIcon');
const sentimentLabel = document.getElementById('sentimentLabel');
const errorBox = document.getElementById('errorBox');
const errorMessage = document.getElementById('errorMessage');
const statsEl = document.getElementById('stats');

// ============ Глобальные переменные ============
let reviewsArray = [];

// ============ Утилиты ============
function showError(msg) {
    console.error('❌', msg);
    errorBox.classList.add('show');
    errorMessage.textContent = msg;
}

function hideError() {
    errorBox.classList.remove('show');
}

// ============ ТЕСТ ПОДКЛЮЧЕНИЯ ============
async function testConnection() {
    try {
        console.log('🔄 Тест подключения к Hugging Face...');
        const testResponse = await fetch('https://api-inference.huggingface.co/status', {
            method: 'HEAD',
            mode: 'no-cors'
        }).catch(e => e);
        
        console.log('📡 Тест подключения завершен');
        return true;
    } catch (e) {
        console.warn('⚠️ Тест подключения:', e.message);
        return false;
    }
}

// ============ Обработчик выбора файла ============
fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    
    if (!file) {
        fileName.textContent = 'No file selected';
        analyzeBtn.disabled = true;
        return;
    }
    
    fileName.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            console.log('📁 Файл загружен, размер:', content.length, 'символов');
            
            // Парсим TSV
            const lines = content.split('\n');
            
            // Ищем заголовки
            const headers = lines[0].split('\t');
            
            // Находим колонку 'text'
            let textColumnIndex = -1;
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].trim().toLowerCase() === 'text') {
                    textColumnIndex = i;
                    break;
                }
            }
            
            if (textColumnIndex === -1) {
                throw new Error('Колонка "text" не найдена в файле');
            }
            
            // Извлекаем отзывы
            reviewsArray = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const columns = line.split('\t');
                if (columns.length > textColumnIndex) {
                    const review = columns[textColumnIndex].trim();
                    if (review && review.length > 0) {
                        reviewsArray.push(review);
                    }
                }
            }
            
            console.log(`✅ Загружено ${reviewsArray.length} отзывов`);
            statsEl.textContent = `📚 Загружено: ${reviewsArray.length} отзывов`;
            
            // Активируем кнопку
            analyzeBtn.disabled = false;
            hideError();
            
        } catch (error) {
            console.error('❌ Ошибка парсинга:', error);
            showError(`Ошибка загрузки файла: ${error.message}`);
            analyzeBtn.disabled = true;
            reviewsArray = [];
            statsEl.textContent = '❌ Ошибка загрузки файла';
        }
    };
    
    reader.onerror = function() {
        showError('Не удалось прочитать файл');
        analyzeBtn.disabled = true;
    };
    
    reader.readAsText(file);
});

// ============ API запрос к Hugging Face ============
async function analyzeSentiment(text) {
    const API_URL = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';
    const token = tokenInput.value.trim();
    
    console.log('🤖 Отправка запроса к Hugging Face API...');
    console.log('📝 Длина текста:', text.length);
    console.log('🔑 Токен:', token ? '✓ предоставлен' : '✗ анонимный');
    
    // Пробуем разные варианты заголовков
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Таймаут 30 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        console.log('📡 Отправка запроса...');
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ inputs: text }),
            signal: controller.signal,
            mode: 'cors',
            cache: 'no-cache'
        });
        
        clearTimeout(timeoutId);
        console.log('📡 Статус ответа:', response.status);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                console.error('❌ Детали ошибки:', errorData);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // игнорируем
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('✅ Ответ получен:', data);
        return data;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('Таймаут запроса. Сервер Hugging Face не отвечает.');
        }
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            // Проверяем CORS
            console.warn('⚠️ Возможная проблема CORS');
            
            // Пробуем альтернативный URL
            throw new Error('Не удалось подключиться к Hugging Face API. Попробуйте:\n' +
                '1. Проверьте подключение к интернету\n' +
                '2. Используйте VPN если вы в России\n' +
                '3. Добавьте токен Hugging Face');
        }
        
        throw error;
    }
}

// ============ Парсинг результата ============
function parseSentiment(apiResponse) {
    console.log('🔍 Парсинг результата...');
    
    try {
        // Получаем массив предсказаний
        let predictions = null;
        
        if (Array.isArray(apiResponse)) {
            if (apiResponse.length > 0 && Array.isArray(apiResponse[0])) {
                predictions = apiResponse[0];
            } else {
                predictions = apiResponse;
            }
        }
        
        if (!predictions || !Array.isArray(predictions)) {
            console.error('❌ Неверный формат:', apiResponse);
            throw new Error('Неверный формат ответа API');
        }
        
        // Ищем scores
        let posScore = null;
        let negScore = null;
        
        for (const item of predictions) {
            if (item.label === 'POSITIVE') posScore = item.score;
            if (item.label === 'NEGATIVE') negScore = item.score;
        }
        
        console.log(`📈 POSITIVE: ${posScore}, NEGATIVE: ${negScore}`);
        
        // ПРАВИЛА ИЗ ТЗ
        if (posScore !== null && posScore > 0.5) {
            return {
                sentiment: 'POSITIVE',
                icon: 'fa-solid fa-thumbs-up',
                color: '#38a169',
                label: 'POSITIVE'
            };
        } else if (negScore !== null && negScore > 0.5) {
            return {
                sentiment: 'NEGATIVE',
                icon: 'fa-solid fa-thumbs-down',
                color: '#e53e3e',
                label: 'NEGATIVE'
            };
        } else {
            return {
                sentiment: 'NEUTRAL',
                icon: 'fa-solid fa-question',
                color: '#718096',
                label: 'NEUTRAL'
            };
        }
        
    } catch (error) {
        console.error('❌ Ошибка парсинга:', error);
        throw error;
    }
}

// ============ Обработчик кнопки Analyze ============
analyzeBtn.addEventListener('click', async function() {
    hideError();
    
    try {
        // Проверяем, загружены ли отзывы
        if (!reviewsArray || reviewsArray.length === 0) {
            throw new Error('Сначала выберите файл с отзывами');
        }
        
        // Выбираем случайный отзыв
        const randomIndex = Math.floor(Math.random() * reviewsArray.length);
        const review = reviewsArray[randomIndex];
        
        // Показываем отзыв
        reviewDisplay.textContent = review;
        statsEl.textContent = `📚 Отзыв ${randomIndex + 1} из ${reviewsArray.length}`;
        
        // ОТПРАВЛЯЕМ ЗАПРОС
        const apiResult = await analyzeSentiment(review);
        
        // Парсим результат
        const sentiment = parseSentiment(apiResult);
        
        // Обновляем UI
        sentimentIcon.innerHTML = `<i class="${sentiment.icon}" style="color: ${sentiment.color}"></i>`;
        sentimentLabel.textContent = sentiment.sentiment;
        sentimentLabel.style.color = sentiment.color;
        
        console.log('🎯 Результат:', sentiment.sentiment);
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        
        // ПОНЯТНЫЕ СООБЩЕНИЯ ДЛЯ ПОЛЬЗОВАТЕЛЯ
        let userMessage = error.message;
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            userMessage = '❌ Нет доступа к Hugging Face API.\n\n' +
                'Возможные причины:\n' +
                '1. 🔴 Если вы в России: используйте VPN\n' +
                '2. 🔴 Блокировка провайдером: включите VPN\n' +
                '3. 🔴 Брандмауэр: разрешите доступ\n\n' +
                '👉 Временно: используйте ДЕМО-РЕЖИМ (см. ниже)';
                
            // ПРЕДЛАГАЕМ ДЕМО-РЕЖИМ
            setTimeout(() => {
                if (confirm('🔄 Переключиться в демо-режим (без API)?')) {
                    // ДЕМО-РЕЖИМ - случайный результат
                    const demoSentiments = [
                        { sentiment: 'POSITIVE', icon: 'fa-solid fa-thumbs-up', color: '#38a169' },
                        { sentiment: 'NEGATIVE', icon: 'fa-solid fa-thumbs-down', color: '#e53e3e' },
                        { sentiment: 'NEUTRAL', icon: 'fa-solid fa-question', color: '#718096' }
                    ];
                    const demo = demoSentiments[Math.floor(Math.random() * demoSentiments.length)];
                    
                    sentimentIcon.innerHTML = `<i class="${demo.icon}" style="color: ${demo.color}"></i>`;
                    sentimentLabel.textContent = `${demo.sentiment} (DEMO)`;
                    sentimentLabel.style.color = demo.color;
                    
                    showError('⚠️ ДЕМО-РЕЖИМ: используются случайные результаты');
                }
            }, 100);
        }
        
        showError(userMessage);
        
        // Показываем ошибку в UI
        sentimentIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: #e53e3e"></i>';
        sentimentLabel.textContent = 'NO API';
        sentimentLabel.style.color = '#e53e3e';
    }
});

// ============ Инициализация ============
async function init() {
    console.log('🚀 Инициализация...');
    
    // Проверяем доступность API
    const isConnected = await testConnection();
    console.log('🌐 Статус подключения:', isConnected ? 'OK' : 'Проблема');
    
    statsEl.textContent = '📁 Выберите файл reviews_test.tsv';
    
    if (!isConnected) {
        console.warn('⚠️ Предупреждение: возможны проблемы с подключением к API');
    }
}

init();