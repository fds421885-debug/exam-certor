import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  // AI Studio Dev server must run on port 3000
  const PORT = 3000;

  // Data directory for shared app state (API key settings & quizzes)
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const TESTS_FILE = path.join(DATA_DIR, 'tests.json');

  function readJson(file: string, defaultVal: any) {
    try {
      if (fs.existsSync(file)) {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading JSON:', e);
    }
    return defaultVal;
  }

  function writeJson(file: string, data: any) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing JSON:', e);
    }
  }

  // Determine system injected key
  const envKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? process.env.GEMINI_API_KEY : '';
  
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeJson(SETTINGS_FILE, {
      apiKey: envKey,
      model: 'gemini-3.8-flash',
      isConnected: Boolean(envKey),
      lastTested: null,
      error: ''
    });
  } else {
    const current = readJson(SETTINGS_FILE, {});
    if ((!current.apiKey || current.apiKey === 'MY_GEMINI_API_KEY') && envKey) {
      current.apiKey = envKey;
      current.isConnected = true;
      current.error = '';
      writeJson(SETTINGS_FILE, current);
    }
  }

  if (!fs.existsSync(TESTS_FILE)) {
    writeJson(TESTS_FILE, []);
  }

  // API Routes
  app.get('/api/settings', (req, res) => {
    const settings = readJson(SETTINGS_FILE, {});
    const activeKey = settings.apiKey || process.env.GEMINI_API_KEY || '';
    const validKey = activeKey && activeKey !== 'MY_GEMINI_API_KEY';
    
    const maskedKey = validKey 
      ? activeKey.substring(0, 4) + '••••••••' + activeKey.substring(activeKey.length - 4)
      : '';

    res.json({
      hasKey: Boolean(validKey),
      maskedKey,
      model: settings.model || 'gemini-3.8-flash',
      isConnected: Boolean(settings.isConnected && validKey),
      lastTested: settings.lastTested || null,
      error: settings.error || ''
    });
  });

  app.post('/api/settings', async (req, res) => {
    const { apiKey, model } = req.body;
    const currentSettings = readJson(SETTINGS_FILE, {});
    
    let keyToTest = currentSettings.apiKey || process.env.GEMINI_API_KEY || '';
    if (apiKey !== undefined && apiKey.trim() !== '') {
      keyToTest = apiKey.trim();
    }
    
    const modelToUse = model || currentSettings.model || 'gemini-3.8-flash';

    let isConnected = false;
    let testError = '';

    if (!keyToTest || keyToTest === 'MY_GEMINI_API_KEY') {
      testError = 'مفتاح API غير موجود أو فارغ. يرجى إدخال مفتاح صالح.';
    } else {
      const modelsToTry = [modelToUse, 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      const ai = new GoogleGenAI({
        apiKey: keyToTest,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      for (const m of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: m,
            contents: 'Say "OK"',
          });

          if (response && response.text) {
            isConnected = true;
            testError = '';
            break;
          }
        } catch (err: any) {
          console.error(`Test connection failed for model ${m}:`, err?.message);
          testError = err?.message || 'فشل الاتصال بمفتاح الذكاء الاصطناعي';
        }
      }
    }

    const newSettings = {
      apiKey: keyToTest,
      model: modelToUse,
      isConnected,
      lastTested: new Date().toISOString(),
      error: testError
    };

    writeJson(SETTINGS_FILE, newSettings);

    const maskedKey = keyToTest && keyToTest !== 'MY_GEMINI_API_KEY'
      ? keyToTest.substring(0, 4) + '••••••••' + keyToTest.substring(keyToTest.length - 4)
      : '';

    res.json({
      success: isConnected,
      hasKey: Boolean(keyToTest && keyToTest !== 'MY_GEMINI_API_KEY'),
      maskedKey,
      model: modelToUse,
      isConnected,
      error: testError
    });
  });

  app.post('/api/gemini/chat', async (req, res) => {
    const { prompt, currentQuiz } = req.body;
    const settings = readJson(SETTINGS_FILE, {});
    const activeKey = settings.apiKey && settings.apiKey !== 'MY_GEMINI_API_KEY' 
      ? settings.apiKey 
      : (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? process.env.GEMINI_API_KEY : '');
    const activeModel = settings.model || 'gemini-3.8-flash';

    if (!activeKey) {
      return res.status(400).json({ error: 'مفتاح الذكاء الاصطناعي غير مسجل أو غير صالح. يرجى إدخال المفتاح في صفحة الإعدادات واختباره أولاً.' });
    }

    const modelsToTry = [activeModel, 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError = '';

    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    let systemInstruction = `أنت معلم خبير، موجه تربوي، ومساعد ذكي للأساتذة والمعلمين.
يمكنك الاستشارة معك في أي موضوع تعليمي، تربوي، طرق تدريس، شرح مفاهيم، أو تحضير الدروس، وسأرد عليك بنصائح وافية ومفيدة ومكتوبة بلغة عربية فصحى راقية.
بالإضافة إلى ذلك، إذا طلب منك المستخدم صراحةً إنشاء أو توليد "اختبار" أو "أسئلة تقييم"، قم بتضمين نصائحك الودية بالإضافة إلى كتلة بيانات JSON واضحة بالشكل التالي:
\`\`\`json
{
  "title": "عنوان الاختبار باللغة العربية",
  "description": "وصف الاختبار ومستوى الطلاب والهدف منه",
  "questions": [
    {
      "questionText": "نص السؤال الأول؟",
      "type": "MULTIPLE_CHOICE",
      "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
      "correctAnswerIndex": 0,
      "points": 5
    }
  ]
}
\`\`\`
إذا لم يطلب اختباراً، أجب على استشارته التعليمية أو سؤاله بشكل طبيعي وودي دون الحاجة لكتلة JSON.`;

    for (const m of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          }
        });

        const text = response.text || '';
        let quizData = null;
        try {
          const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            quizData = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error('JSON parse error from Gemini:', e);
        }

        return res.json({ text, quizData });
      } catch (err: any) {
        console.error(`Gemini chat error with model ${m}:`, err);
        lastError = err?.message || 'خطأ غير معروف';
      }
    }

    res.status(500).json({ error: `فشل الاتصال بنماذج الذكاء الاصطناعي: ${lastError}` });
  });

  app.get('/api/tests', (req, res) => {
    const tests = readJson(TESTS_FILE, []);
    res.json(tests);
  });

  app.post('/api/tests', (req, res) => {
    const { title, description, questions, formId, formUrl, spreadsheetId, spreadsheetUrl, createdBy } = req.body;
    const tests = readJson(TESTS_FILE, []);
    
    const newTest = {
      id: 'test_' + Date.now(),
      title: title || 'اختبار جديد',
      description: description || '',
      questions: questions || [],
      formId: formId || '',
      formUrl: formUrl || '',
      spreadsheetId: spreadsheetId || '',
      spreadsheetUrl: spreadsheetUrl || '',
      createdBy: createdBy || 'مستخدم',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    tests.unshift(newTest);
    writeJson(TESTS_FILE, tests);
    res.json(newTest);
  });

  app.put('/api/tests/:id', (req, res) => {
    const { id } = req.params;
    const { title, description, questions, formId, formUrl } = req.body;
    const tests = readJson(TESTS_FILE, []);
    
    const index = tests.findIndex((t: any) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }

    tests[index] = {
      ...tests[index],
      title: title !== undefined ? title : tests[index].title,
      description: description !== undefined ? description : tests[index].description,
      questions: questions !== undefined ? questions : tests[index].questions,
      formId: formId !== undefined ? formId : tests[index].formId,
      formUrl: formUrl !== undefined ? formUrl : tests[index].formUrl,
      updatedAt: new Date().toISOString()
    };

    writeJson(TESTS_FILE, tests);
    res.json(tests[index]);
  });

  app.delete('/api/tests/:id', (req, res) => {
    const { id } = req.params;
    let tests = readJson(TESTS_FILE, []);
    tests = tests.filter((t: any) => t.id !== id);
    writeJson(TESTS_FILE, tests);
    res.json({ success: true });
  });

  // Vite integration via middleware
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
