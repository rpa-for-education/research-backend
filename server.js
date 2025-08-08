import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Danh sách domain được phép
const allowedOrigins = [
  'http://localhost:5173',
  'https://research-frontend-henna.vercel.app',
  'https://research.neu.edu.vn'
];

// Bắt preflight thủ công
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200); // Trả OK ngay cho preflight
  }
  next();
});

app.use(express.json());

// --- Khởi tạo Gemini ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- Khởi tạo Qwen ---
const qwenClient = new OpenAI({
  apiKey: process.env.QWEN_API_KEY || '',
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
});

// --- Lấy dữ liệu hội thảo ---
async function fetchArticles() {
  try {
    const response = await axios.get('https://api.rpa4edu.shop/api_research.php');
    if (!Array.isArray(response.data)) throw new Error('Dữ liệu hội thảo không phải mảng');
    return response.data;
  } catch (error) {
    console.error('Lỗi khi lấy hội thảo:', error.message);
    return [];
  }
}

function createPrompt(articles, question) {
  if (!articles.length) return `Không có dữ liệu hội thảo. Câu hỏi: ${question}`;
  let context = 'Dựa trên thông tin các hội thảo sau để trả lời câu hỏi:\n\n';
  articles.slice(0, 10).forEach((a, i) => {
    context += `Hội thảo ${i + 1}:
Hội thảo: ${a.acronym || 'Không có'}
Tên: ${a.name || 'Không có'}
Địa điểm: ${a.location || 'Không có'}
Hạn nộp: ${a.deadline || 'Không có'}
Ngày tổ chức: ${a.start_date || 'Không có'}
Chủ đề: ${a.topics || 'Không có'}
Link: ${a.url || 'Không có'}\n\n`;
  });
  context += `Câu hỏi: ${question}`;
  return context;
}

// --- Endpoint hỏi đáp ---
app.post('/api/ask', async (req, res) => {
  const { prompt, modelType } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Câu hỏi không được để trống' });

  try {
    const articles = await fetchArticles();
    const finalPrompt = createPrompt(articles, prompt);

    let responseText = '';

    if (modelType === 'qwen') {
      const completion = await qwenClient.chat.completions.create({
        model: 'qwen-plus',
        messages: [{ role: 'user', content: finalPrompt }]
      });
      responseText = completion.choices[0].message.content;
    } else {
      const result = await geminiModel.generateContent(finalPrompt);
      responseText = await result.response.text();
    }

    res.json({ response: responseText });
  } catch (error) {
    console.error('Lỗi server:', error.message);
    res.status(500).json({ error: 'Lỗi server: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Server chạy tại http://localhost:${port}`);
});
