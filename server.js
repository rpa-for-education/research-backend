import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import corsMiddleware from 'cors';
import axios from 'axios';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình CORS để cho phép frontend cục bộ 
app.use(corsMiddleware({ origin: ['http://localhost:5173', 'https://research-frontend-henna.vercel.app', 'https://research.neu.edu.vn'] }));
app.use(express.json());

// Khởi tạo Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Lấy dữ liệu bài viết
async function fetchArticles() {
  try {
    const response = await axios.get('https://api.rpa4edu.shop/api_research.php');
    console.log('Dữ liệu hội thảo:', JSON.stringify(response.data, null, 2)); // Log chi tiết
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
  // Giới hạn 10 bài viết để tránh vượt token
  articles.slice(0, 10).forEach((article, index) => {
    context += `Hội thảo ${index + 1}:\nHội thảo: ${article.acronym || 'Không có nội dung'}\nTên hội thảo: ${article.name || 'Không có nội dung'}\nĐịa điểm tổ chức: ${article.location || 'Không có nội dung'}\nHạn nộp bài: ${article.deadline || 'Không có nội dung'}\nNgày tổ chức hội thảo: ${article.start_date || 'Không có nội dung'}\nChủ đề: ${article.topics || 'Không có nội dung'}\nLink thông tin hội thảo: ${article.url || 'Không có nội dung'}\n\n`;
  });
  context += `Câu hỏi: ${question}\nHãy trả lời câu hỏi dựa trên nội dung các hội thảo, nếu không có thông tin liên quan, hãy nói rõ.`;
  return context;
}

// Endpoint hỏi đáp
app.post('/api/ask', async (req, res) => {
  console.log('Yêu cầu nhận được:', req.body); // Log yêu cầu từ frontend
  const { prompt } = req.body;
  if (!prompt) {
    console.log('Lỗi: Câu hỏi trống');
    return res.status(400).json({ error: 'Câu hỏi không được để trống' });
  }
  try {
    const articles = await fetchArticles();
    const geminiPrompt = createPrompt(articles, prompt);
    console.log('Prompt gửi đến Gemini:', geminiPrompt); // Log prompt
    const result = await model.generateContent(geminiPrompt);
    const responseText = await result.response.text();
    console.log('Phản hồi từ Gemini:', responseText); // Log phản hồi
    res.json({ response: responseText });
  } catch (error) {
    console.error('Lỗi server:', error.message, error.stack); // Log lỗi chi tiết
    res.status(500).json({ error: 'Lỗi server: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`Server chạy tại http://localhost:${port}`);
});