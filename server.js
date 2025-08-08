import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import OpenAI from 'openai'; // Dùng SDK OpenAI để gọi Qwen

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware đọc JSON
app.use(express.json());

// Danh sách domain được phép
const allowedOrigins = [
  'http://localhost:5173',
  'https://research-frontend-henna.vercel.app',
  'https://www.research-frontend-henna.vercel.app',
  'https://research.neu.edu.vn'
];

// Cấu hình CORS (đặt trước tất cả routes)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS bị chặn từ origin: ${origin}`);
        callback(new Error('Không được phép truy cập bởi CORS'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// Xử lý preflight request
app.options('*', cors());

// Khởi tạo Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Khởi tạo Qwen API (dùng OpenAI SDK với base_url Qwen)
const qwenClient = new OpenAI({
  apiKey: process.env.QWEN_API_KEY || '',
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' // Singapore endpoint
});

// Lấy dữ liệu hội thảo
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

// Tạo prompt
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
  context += `Câu hỏi: ${question}\nHãy trả lời dựa trên nội dung trên, nếu không có thông tin hãy nói rõ.`;
  return context;
}

// Endpoint hỏi đáp
app.post('/api/ask', async (req, res) => {
  const { prompt, modelType } = req.body; // modelType = 'gemini' hoặc 'qwen'
  if (!prompt) return res.status(400).json({ error: 'Câu hỏi không được để trống' });

  try {
    const articles = await fetchArticles();
    const finalPrompt = createPrompt(articles, prompt);

    let responseText = '';

    if (modelType === 'qwen') {
      // Gọi Qwen
      const completion = await qwenClient.chat.completions.create({
        model: 'qwen-plus',
        messages: [{ role: 'user', content: finalPrompt }]
      });
      responseText = completion.choices[0].message.content;
    } else {
      // Mặc định gọi Gemini
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
