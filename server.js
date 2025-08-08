import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';

// Load biến môi trường
dotenv.config();

// Khởi tạo app và port
const app = express();
const port = process.env.PORT || 3000;

// Middleware đọc JSON
app.use(express.json());

// Danh sách domain được phép
const allowedOrigins = [
  'http://localhost:5173',
  'https://research-frontend-henna.vercel.app',
  'https://research.neu.edu.vn'
];

// Cấu hình CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true); // Cho phép
      } else {
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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Lấy dữ liệu bài viết
async function fetchArticles() {
  try {
    const response = await axios.get('https://api.rpa4edu.shop/api_research.php');
    console.log('Dữ liệu hội thảo:', JSON.stringify(response.data, null, 2));
    if (!Array.isArray(response.data)) {
      throw new Error('Dữ liệu hội thảo không phải mảng');
    }
    return response.data;
  } catch (error) {
    console.error('Lỗi khi lấy hội thảo:', error.response?.data || error.message);
    return [];
  }
}

// Tạo prompt cho Gemini
function createPrompt(articles, question) {
  if (!articles.length) {
    return `Không có dữ liệu hội thảo. Câu hỏi: ${question}`;
  }
  let context = 'Dựa trên thông tin các hội thảo sau để trả lời câu hỏi:\n\n';
  articles.slice(0, 10).forEach((article, index) => {
    context += `Hội thảo ${index + 1}:\nHội thảo: ${article.acronym || 'Không có nội dung'}\nTên hội thảo: ${article.name || 'Không có nội dung'}\nĐịa điểm tổ chức: ${article.location || 'Không có nội dung'}\nHạn nộp bài: ${article.deadline || 'Không có nội dung'}\nNgày tổ chức hội thảo: ${article.start_date || 'Không có nội dung'}\nChủ đề: ${article.topics || 'Không có nội dung'}\nLink thông tin hội thảo: ${article.url || 'Không có nội dung'}\n\n`;
  });
  context += `Câu hỏi: ${question}\nHãy trả lời câu hỏi dựa trên nội dung các hội thảo, nếu không có thông tin liên quan, hãy nói rõ.`;
  return context;
}

// Endpoint hỏi đáp
app.post('/api/ask', async (req, res) => {
  console.log('Yêu cầu nhận được:', req.body);
  const { prompt } = req.body;
  if (!prompt) {
    console.log('Lỗi: Câu hỏi trống');
    return res.status(400).json({ error: 'Câu hỏi không được để trống' });
  }
  try {
    const articles = await fetchArticles();
    const geminiPrompt = createPrompt(articles, prompt);
    console.log('Prompt gửi đến Gemini:', geminiPrompt);
    const result = await model.generateContent(geminiPrompt);
    const responseText = await result.response.text();
    console.log('Phản hồi từ Gemini:', responseText);
    res.json({ response: responseText });
  } catch (error) {
    console.error('Lỗi server:', error.message, error.stack);
    res.status(500).json({ error: 'Lỗi server: ' + error.message });
  }
});

// Khởi động server
app.listen(port, () => {
  console.log(`Server chạy tại http://localhost:${port}`);
});
