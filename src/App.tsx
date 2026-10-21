import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Bot, FileText, BarChart2, Settings, User as UserIcon, 
  LogOut, CheckCircle2, AlertCircle, Plus, Send, Edit3, Trash2, 
  ExternalLink, Sparkles, RefreshCw, Layers, Check, ChevronDown, 
  ShieldCheck, HelpCircle, FileSpreadsheet, Award, Users, Flame, Trophy,
  Zap, CornerDownLeft
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/forms.body');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App Navigation
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'tests' | 'results'>('home');

  // Shared Settings & Gemini API Status
  const [settings, setSettings] = useState({
    hasKey: false,
    maskedKey: '',
    model: 'gemini-3.8-flash',
    isConnected: false,
    lastTested: null,
    error: ''
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('gemini-3.8-flash');
  const [testingKey, setTestingKey] = useState(false);
  const [testResultFeedback, setTestResultFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; quizData?: any }>>([
    { 
      role: 'assistant', 
      text: 'أهلاً بك يا بطل! 🌟 أنا مساعد جيميناي الذكي للاختبارات التعليمية.\n\nيمكنك كتابة ما تريد في صندوق الدردشة بالأسفل، أو اختيار أحد الاقتراحات السريعة لإنشاء اختبار فوري، وسأقوم بتحويله مباشرة إلى نموذج Google Form وحفظه لديك!' 
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingQuiz, setPendingQuiz] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Saved Tests
  const [tests, setTests] = useState<any[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);

  // Edit Test Modal
  const [editingTest, setEditingTest] = useState<any>(null);

  // Results & Responses State
  const [selectedTestForResult, setSelectedTestForResult] = useState<any>(null);
  const [formResponses, setFormResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [sheetResultUrl, setSheetResultUrl] = useState('');

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setAccessToken(null);
      }
    });

    fetchSettings();
    fetchTests();

    return () => unsubscribe();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
      if (data.model) setModelInput(data.model);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchTests = async () => {
    setLoadingTests(true);
    try {
      const res = await fetch('/api/tests');
      const data = await res.json();
      setTests(data);
    } catch (err) {
      console.error('Failed to fetch tests:', err);
    } finally {
      setLoadingTests(false);
    }
  };

  const handleGoogleLogin = async (): Promise<string | null> => {
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setCurrentUser(result.user);
        return credential.accessToken;
      }
      setCurrentUser(result.user);
      return null;
    } catch (err: any) {
      alert('فشل تسجيل الدخول بحساب جوجل: ' + (err.message || 'خطأ غير معروف'));
      return null;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setAccessToken(null);
    setCurrentUser(null);
  };

  const handleTestAndSaveKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTestingKey(true);
    setTestResultFeedback(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim() || undefined,
          model: modelInput
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      setSettings(data);
      if (data.success) {
        setTestResultFeedback({
          success: true,
          message: 'تم التحقق من الاتصال بمفتاح الذكاء الاصطناعي بنجاح وهو جاهز للعمل!'
        });
        setApiKeyInput('');
      } else {
        setTestResultFeedback({
          success: false,
          message: data.error || 'فشل الاتصال: تأكد من صحة المفتاح وصلاحيته'
        });
      }
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      setTestResultFeedback({
        success: false,
        message: isTimeout ? 'انتهت مهلة الاتصال (Timeout). يرجى التحقق من سرعة الإنترنت والمحاولة مرة أخرى.' : ('حدث خطأ في الاتصال: ' + (err.message || 'خطأ غير معروف'))
      });
    } finally {
      setTestingKey(false);
    }
  };

  const executeSendChat = async (promptText: string) => {
    if (!promptText.trim() || isChatLoading) return;

    const userMsg = promptText.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg,
          currentQuiz: pendingQuiz
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: data.text, 
          quizData: data.quizData 
        }]);
        if (data.quizData) {
          setPendingQuiz(data.quizData);
        }
      } else {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          text: '⚠️ ' + (data.error || 'حدث خطأ أثناء معالجة الطلب. يرجى التأكد من تفعيل مفتاح الذكاء الاصطناعي في صفحة الإعدادات.') 
        }]);
      }
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: isTimeout 
          ? '⚠️ انتهت مهلة الرد من الذكاء الاصطناعي (Timeout). يرجى المحاولة مرة أخرى.' 
          : ('⚠️ خطأ في الاتصال بالخادم: ' + (err.message || 'خطأ غير معروف')) 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCreateGoogleForm = async (quiz: any) => {
    let currentToken = accessToken;

    if (!currentToken) {
      // Prompt user to connect Google Account directly
      const confirmed = confirm('لإنشاء النموذج في Google Forms، يحتاج التطبيق إلى ربط حساب جوجل الخاص بك. هل تود ربط الحساب الآن؟');
      if (confirmed) {
        currentToken = await handleGoogleLogin();
        if (!currentToken) {
          alert('يرجى إكمال تسجيل الدخول بحساب جوجل أولاً للمتابعة.');
          return;
        }
      } else {
        return;
      }
    }

    setCreatingForm(true);
    try {
      // 1. Create Google Form
      const formCreateRes = await fetch('https://forms.googleapis.com/v1/forms', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          info: {
            title: quiz.title || 'اختبار جديد',
            documentTitle: quiz.title || 'اختبار جديد'
          }
        })
      });

      if (!formCreateRes.ok) {
        const errText = await formCreateRes.text();
        throw new Error('فشل إنشاء النموذج في جوجل: ' + errText);
      }

      const formData = await formCreateRes.json();
      const formId = formData.formId;
      const formUrl = formData.responderUri || `https://docs.google.com/forms/d/${formId}/viewform`;

      // 2. Add description and questions
      if (quiz.questions && quiz.questions.length > 0) {
        const requests = [];
        if (quiz.description) {
          requests.push({
            updateFormInfo: {
              info: { description: quiz.description },
              updateMask: 'description'
            }
          });
        }

        quiz.questions.forEach((q: any, idx: number) => {
          const options = q.options && q.options.length > 0 ? q.options : ['الخيار 1', 'الخيار 2', 'الخيار 3', 'الخيار 4'];
          requests.push({
            createItem: {
              item: {
                title: `${idx + 1}. ${q.questionText}`,
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: options.map((opt: string) => ({ value: opt }))
                    }
                  }
                }
              },
              location: { index: idx }
            }
          });
        });

        await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests })
        });
      }

      // 3. Save to database
      const saveRes = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quiz.title,
          description: quiz.description,
          questions: quiz.questions,
          formId,
          formUrl,
          createdBy: currentUser?.email || 'مستخدم'
        })
      });

      if (saveRes.ok) {
        alert('🎉 تم إنشاء نموذج Google Form وحفظ الاختبار بنجاح!');
        fetchTests();
        setActiveTab('tests');
        setPendingQuiz(null);
      } else {
        throw new Error('فشل حفظ الاختبار في قاعدة البيانات');
      }

    } catch (err: any) {
      console.error('Create Google Form error:', err);
      alert('❌ حدث خطأ أثناء إنشاء النموذج: ' + err.message);
    } finally {
      setCreatingForm(false);
    }
  };

  const handleDeleteTest = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاختبار؟')) return;
    try {
      await fetch(`/api/tests/${id}`, { method: 'DELETE' });
      fetchTests();
    } catch (err) {
      alert('فشل الحذف');
    }
  };

  const fetchFormResponses = async (test: any) => {
    setSelectedTestForResult(test);
    if (!test.formId) {
      setFormResponses([]);
      return;
    }
    if (!accessToken) {
      alert('⚠️ يرجى تسجيل الدخول بحساب جوجل لجلب الإجابات والدرجات.');
      return;
    }

    setLoadingResponses(true);
    try {
      const res = await fetch(`https://forms.googleapis.com/v1/forms/${test.formId}/responses`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormResponses(data.responses || []);
      } else {
        setFormResponses([]);
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
      setFormResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  };

  const handleExportToSheets = async (test: any) => {
    if (!accessToken) {
      alert('⚠️ يرجى تسجيل الدخول بحساب جوجل أولاً');
      return;
    }
    setExportingSheet(true);
    setSheetResultUrl('');

    try {
      const sheetCreateRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title: `نتائج اختبار: ${test.title}` }
        })
      });

      if (!sheetCreateRes.ok) throw new Error('فشل إنشاء جدول بيانات Google Sheets');
      const sheetData = await sheetCreateRes.json();
      const spreadsheetId = sheetData.spreadsheetId;
      const spreadsheetUrl = sheetData.spreadsheetUrl;

      const rows = [
        ['اسم الطالب / البريد', 'تاريخ الإجابة', ...(test.questions?.map((q: any, i: number) => `سؤال ${i+1}`) || [])]
      ];

      formResponses.forEach((resp: any) => {
        const email = resp.respondentEmail || 'مجهول';
        const time = resp.createTime || '';
        const answers = test.questions?.map((q: any, i: number) => {
          const ansObj = resp.answers ? resp.answers[Object.keys(resp.answers)[i]] : null;
          return ansObj?.textAnswers?.answers?.[0]?.value || '-';
        }) || [];
        rows.push([email, time, ...answers]);
      });

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: 'A1',
          majorDimension: 'ROWS',
          values: rows
        })
      });

      setSheetResultUrl(spreadsheetUrl);
      alert('🎉 تم تصدير النتائج إلى Google Sheets بنجاح!');
    } catch (err: any) {
      console.error('Export sheet error:', err);
      alert('❌ فشل تصدير النتائج: ' + err.message);
    } finally {
      setExportingSheet(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col selection:bg-purple-200 selection:text-purple-900" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-r from-violet-700 via-indigo-600 to-purple-800 text-white shadow-xl sticky top-0 z-30 border-b-4 border-indigo-950">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border-2 border-white/20 flex items-center justify-center text-white shadow-inner">
              <Sparkles className="w-7 h-7 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                معلم الاختبارات الذكي 🚀
              </h1>
              <p className="text-xs text-indigo-200 font-medium">Google Workspace (Forms & Sheets) + Gemini AI</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 space-x-reverse">
            {currentUser ? (
              <div className="flex items-center space-x-3 space-x-reverse bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-white/20 shadow-sm">
                <img 
                  src={currentUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-xl object-cover border-2 border-white"
                />
                <span className="text-sm font-bold text-white hidden sm:inline">{currentUser.displayName || currentUser.email}</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-xl text-xs font-black bg-emerald-400 text-emerald-950 shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1" /> متصل بجوجل
                </span>
                <button 
                  onClick={handleLogout}
                  title="تسجيل الخروج"
                  className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleGoogleLogin()}
                disabled={isLoggingIn}
                className="bg-white text-indigo-950 font-black px-5 py-3 rounded-2xl shadow-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer hover:bg-indigo-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                {isLoggingIn ? 'جاري الاتصال...' : 'ربط حساب جوجل'}
              </button>
            )}
          </div>
        </div>

        {/* Duolingo Navigation Tabs */}
        <div className="bg-indigo-950/40 backdrop-blur-md px-4 border-t border-indigo-800/50">
          <div className="max-w-7xl mx-auto flex space-x-3 space-x-reverse overflow-x-auto py-2">
            {[
              { id: 'home', label: 'الرئيسية ومفتاح AI', icon: Settings },
              { id: 'chat', label: 'محادثة جيميناي والإنشاء', icon: Bot },
              { id: 'tests', label: 'الاختبارات المحفوظة', icon: FileText, count: tests.length },
              { id: 'results', label: 'النتائج وجداول Sheets', icon: BarChart2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 space-x-reverse px-5 py-2.5 rounded-2xl font-black text-sm transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-white text-indigo-950 shadow-lg border-b-4 border-indigo-300 scale-105'
                      : 'bg-indigo-900/60 text-indigo-200 hover:bg-indigo-900 hover:text-white border-2 border-indigo-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-indigo-300'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="mr-1.5 bg-amber-400 text-amber-950 text-xs px-2 py-0.5 rounded-full font-black">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* TAB 1: HOME & SETTINGS */}
        {activeTab === 'home' && (
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-indigo-700 via-violet-600 to-purple-800 text-white rounded-3xl p-8 sm:p-10 shadow-2xl border-4 border-indigo-400/30 relative overflow-hidden">
              <div className="max-w-2xl relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-400 text-amber-950 font-black text-xs shadow-md">
                  <Trophy className="w-4 h-4" /> نظام مشترك وموحد للجميع
                </div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight">صمم اختباراتك التعليمية بذكاء مع جيميناي!</h2>
                <p className="text-indigo-100 text-sm sm:text-base leading-relaxed font-medium">
                  قاعدة البيانات مشتركة لجميع المستخدمين. قم بربط حساب جوجل لتمكين نشر النماذج في Google Forms، وتأكد من تفعيل مفتاح Gemini للبدء بإنشاء الاختبارات وتعديلها.
                </p>
                <div className="flex flex-wrap gap-4 pt-2">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black px-6 py-3.5 rounded-2xl shadow-xl border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer text-base"
                  >
                    <Sparkles className="w-5 h-5 text-amber-950" />
                    انتقل للمحادثة والإنشاء الآن
                  </button>
                  <button
                    onClick={() => setActiveTab('tests')}
                    className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold px-6 py-3.5 rounded-2xl border-2 border-white/30 transition-all flex items-center gap-2 cursor-pointer text-base"
                  >
                    <FileText className="w-5 h-5" />
                    استعراض الاختبارات ({tests.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Google Workspace Card */}
              <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 shadow-xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <UserIcon className="w-6 h-6 text-indigo-600" />
                      حساب Google Workspace
                    </h3>
                    <span className={`px-4 py-1.5 rounded-2xl text-xs font-black ${currentUser ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300' : 'bg-amber-100 text-amber-800 border-2 border-amber-300'}`}>
                      {currentUser ? '✨ مربوط بنجاح' : '⚠️ غير مربوط'}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed font-medium">
                    {currentUser 
                      ? `تم ربط حسابك بنجاح (${currentUser.email}). يمكنك الآن إنشاء نماذج Google Forms واستخراج النتائج إلى Google Sheets.`
                      : 'يرجى ربط حساب جوجل لمنح التطبيق الإذن بإنشاء نماذج الاختبارات وجداول الدرجات.'}
                  </p>
                </div>

                <div className="pt-6">
                  {currentUser ? (
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <img 
                          src={currentUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                          alt="Avatar" 
                          className="w-10 h-10 rounded-xl object-cover border-2 border-emerald-400"
                        />
                        <div>
                          <p className="text-sm font-black text-emerald-950">{currentUser.displayName || 'مستخدم جوجل'}</p>
                          <p className="text-xs text-emerald-700 font-medium">{currentUser.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="text-xs font-black text-red-600 hover:text-red-800 bg-white border-2 border-red-200 px-4 py-2 rounded-xl shadow-xs cursor-pointer hover:bg-red-50 transition-all"
                      >
                        قطع الاتصال
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGoogleLogin()}
                      disabled={isLoggingIn}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-6 rounded-2xl shadow-lg border-b-4 border-indigo-900 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer text-base"
                    >
                      ربط حساب جوجل الآن 🔗
                    </button>
                  )}
                </div>
              </div>

              {/* Gemini AI Key Card */}
              <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 shadow-xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <Bot className="w-6 h-6 text-indigo-600" />
                      مفتاح الذكاء الاصطناعي المشترك
                    </h3>
                    <span className={`px-4 py-1.5 rounded-2xl text-xs font-black ${settings.isConnected ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300' : 'bg-rose-100 text-rose-800 border-2 border-rose-300'}`}>
                      {settings.isConnected ? '🟢 مربوط (شغال مية بالمية)' : '🔴 ليس مربوطاً'}
                    </span>
                  </div>

                  <p className="text-slate-600 text-sm leading-relaxed font-medium">
                    هذا المفتاح مشترك لجميع المستخدمين. إذا لم يكن مربوطاً، اكتب المفتاح هنا واضغط على "اختبار وحفظ".
                  </p>

                  <div className="bg-indigo-50/70 rounded-2xl p-4 text-xs font-mono text-indigo-950 border-2 border-indigo-100 flex items-center justify-between font-bold">
                    <span>المفتاح الحالي: {settings.hasKey ? settings.maskedKey : 'غير مسجل'}</span>
                    <span className="bg-indigo-600 text-white px-2.5 py-1 rounded-xl text-xs">النموذج: {settings.model}</span>
                  </div>

                  {testResultFeedback && (
                    <div className={`p-4 rounded-2xl text-xs font-bold border-2 ${testResultFeedback.success ? 'bg-emerald-50 text-emerald-950 border-emerald-300' : 'bg-rose-50 text-rose-950 border-rose-300'}`}>
                      {testResultFeedback.success ? '✅ ' : '❌ '}
                      {testResultFeedback.message}
                    </div>
                  )}
                </div>

                <form onSubmit={handleTestAndSaveKey} className="space-y-4 pt-4">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">مفتاح API جديد (إذا أردت تغييره)</label>
                    <input
                      type="password"
                      placeholder="أدخل مفتاح Gemini API هنا..."
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm focus:outline-hidden focus:border-indigo-600 font-medium"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-black text-slate-700 mb-1">النموذج المختار</label>
                      <select
                        value={modelInput}
                        onChange={e => setModelInput(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm focus:outline-hidden focus:border-indigo-600 font-bold"
                      >
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (الأساسي فائق السرعة)</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                        <option value="gemini-flash-latest">Gemini Flash Latest</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={testingKey}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3.5 rounded-2xl text-sm shadow-md border-b-4 border-indigo-900 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
                      >
                        {testingKey ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-amber-300" />}
                        اختبار وحفظ المفتاح
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CHAT & QUIZ GENERATION */}
        {activeTab === 'chat' && (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Chat Window Container */}
            <div className="w-full lg:w-2/3 bg-white rounded-3xl border-4 border-slate-100 flex flex-col shadow-xl min-h-[560px] h-[680px] overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-900 to-violet-900 text-white px-6 py-4 flex items-center justify-between border-b-4 border-indigo-950 shrink-0">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border-2 border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-base">مساعد جيميناي الذكي للاختبارات</h3>
                    <p className="text-xs text-indigo-200 font-medium">اطلب إنشاء أي اختبار وسيقوم بتوليده وتجهيزه لـ Google Forms</p>
                  </div>
                </div>
                <span className="text-xs font-black px-3 py-1 bg-amber-400 text-amber-950 rounded-xl shadow-xs">
                  {settings.model}
                </span>
              </div>

              {/* Quick Prompts Bar */}
              <div className="px-4 py-2.5 bg-indigo-50/80 border-b border-indigo-100 flex items-center gap-2 overflow-x-auto shrink-0">
                <span className="text-xs font-black text-indigo-900 whitespace-nowrap">اقتراحات سريعة:</span>
                {[
                  'أنشئ لي اختبار في أحكام التجويد للصف الثاني متوسط (5 أسئلة)',
                  'أنشئ اختبار رياضيات في المعادلات الخطية للصف الأول متوسط',
                  'أنشئ اختبار علوم عن دورة حياة الخلية للصف الثاني متوسط',
                ].map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => executeSendChat(prompt)}
                    disabled={isChatLoading}
                    className="text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 px-3 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer shadow-xs"
                  >
                    {prompt.length > 35 ? prompt.substring(0, 35) + '...' : prompt}
                  </button>
                ))}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-3xl px-5 py-4 text-sm leading-relaxed font-medium shadow-md ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tl-sm border-b-4 border-indigo-800' 
                        : 'bg-white text-slate-800 rounded-tr-sm border-2 border-slate-200'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      
                      {msg.quizData && (
                        <div className="mt-4 pt-4 border-t-2 border-indigo-100">
                          <div className="bg-indigo-50 rounded-2xl p-4 border-2 border-indigo-200 shadow-sm">
                            <h4 className="font-black text-indigo-950 text-base mb-1">{msg.quizData.title}</h4>
                            <p className="text-xs text-slate-600 mb-3">{msg.quizData.description}</p>
                            <span className="inline-block bg-indigo-600 text-white text-xs px-3 py-1 rounded-xl font-black mb-3">
                              عدد الأسئلة: {msg.quizData.questions?.length || 0} أسئلة
                            </span>
                            <button
                              onClick={() => handleCreateGoogleForm(msg.quizData)}
                              disabled={creatingForm}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-4 rounded-2xl text-xs shadow-lg border-b-4 border-emerald-900 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {creatingForm ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                              إنشاء النموذج في Google Forms وحفظه
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white text-slate-600 rounded-3xl rounded-tr-sm px-5 py-4 text-sm font-bold border-2 border-slate-200 shadow-sm flex items-center space-x-3 space-x-reverse">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>جاري التفكير وتوليد أسئلة الاختبار مع جيميناي...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Pinned At Bottom */}
              <div className="p-4 bg-white border-t-2 border-slate-100 shrink-0">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeSendChat(chatInput);
                  }} 
                  className="flex items-center gap-3"
                >
                  <input
                    type="text"
                    placeholder="اكتب هنا طلبك للذكاء الاصطناعي (مثال: أنشئ لي اختبار في أحكام التجويد للصف الثاني متوسط)..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    disabled={isChatLoading}
                    className="flex-1 px-5 py-3.5 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-2xl text-sm font-bold focus:outline-hidden transition-all shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={isChatLoading || !chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black px-6 py-3.5 rounded-2xl transition-all shadow-lg border-b-4 border-indigo-900 active:border-b-0 active:translate-y-1 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <span>إرسال</span>
                    <Send className="w-4 h-4 rotate-180" />
                  </button>
                </form>
              </div>
            </div>

            {/* Quiz Preview Sidebar */}
            <div className="w-full lg:w-1/3 bg-white rounded-3xl border-4 border-slate-100 flex flex-col shadow-xl min-h-[560px] h-[680px] overflow-hidden">
              <div className="bg-slate-100 border-b-2 border-slate-200 px-6 py-4 shrink-0">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  معاينة الاختبار المتولد
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {pendingQuiz ? (
                  <div className="space-y-4">
                    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 shadow-xs">
                      <h4 className="font-black text-indigo-950 text-base">{pendingQuiz.title}</h4>
                      <p className="text-xs text-slate-600 mt-1 font-medium">{pendingQuiz.description}</p>
                    </div>

                    <div className="space-y-3">
                      {pendingQuiz.questions?.map((q: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 space-y-2">
                          <p className="text-xs font-black text-slate-900">{idx + 1}. {q.questionText}</p>
                          <div className="space-y-1.5 pr-2">
                            {q.options?.map((opt: string, oIdx: number) => (
                              <div key={oIdx} className={`text-xs p-2 rounded-xl font-bold ${oIdx === q.correctAnswerIndex ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-white text-slate-600 border border-slate-200'}`}>
                                • {opt} {oIdx === q.correctAnswerIndex && ' ✨ (الصحيحة)'}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleCreateGoogleForm(pendingQuiz)}
                      disabled={creatingForm}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-4 rounded-2xl text-xs shadow-lg border-b-4 border-emerald-900 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {creatingForm ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                      إنشاء النموذج في Google Forms
                    </button>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
                    <Layers className="w-14 h-14 stroke-1 text-slate-300" />
                    <p className="text-sm font-black text-slate-600">لا يوجد اختبار قيد المعاينة حالياً</p>
                    <p className="text-xs text-slate-400 font-medium">اطلب من المساعد في الدردشة تصميم اختبار وسيظهر هنا قبل إنشائه في جوجل.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SAVED TESTS LIST */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">قائمة الاختبارات المحفوظة</h2>
                <p className="text-sm text-slate-500 font-medium">إدارة وتعديل الاختبارات المرتبطة بنماذج Google Forms</p>
              </div>
              <button
                onClick={() => setActiveTab('chat')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-3 rounded-2xl text-sm shadow-lg border-b-4 border-indigo-900 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                إنشاء اختبار جديد
              </button>
            </div>

            {loadingTests ? (
              <div className="text-center py-16 text-slate-400 font-bold">جاري تحميل الاختبارات...</div>
            ) : tests.length === 0 ? (
              <div className="bg-white rounded-3xl border-4 border-slate-100 p-12 text-center space-y-4 shadow-xl">
                <FileText className="w-16 h-16 mx-auto text-slate-300" />
                <h3 className="font-black text-slate-800 text-lg">لا توجد اختبارات محفوظة بعد</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">ابدأ باستخدام مساعد جيميناي لإنشاء اختبارك التعليمي الأول.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tests.map((test) => (
                  <div key={test.id} className="bg-white rounded-3xl border-4 border-slate-100 p-6 shadow-xl flex flex-col justify-between hover:border-indigo-200 transition-all">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-black px-3 py-1 bg-indigo-100 text-indigo-900 rounded-xl border border-indigo-200">
                          {test.questions?.length || 0} أسئلة
                        </span>
                        <span className="text-xs text-slate-400 font-bold">
                          {new Date(test.createdAt).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                      <h3 className="font-black text-slate-900 text-base">{test.title}</h3>
                      <p className="text-slate-600 text-xs line-clamp-2 font-medium">{test.description}</p>
                    </div>

                    <div className="space-y-3 pt-6 border-t-2 border-slate-100 mt-4">
                      <div className="flex items-center justify-between gap-2">
                        {test.formUrl && (
                          <a
                            href={test.formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-2.5 px-3 rounded-xl text-xs text-center transition-all flex items-center justify-center gap-1.5"
                          >
                            <ExternalLink className="w-4 h-4" />
                            فتح النموذج
                          </a>
                        )}
                        <button
                          onClick={() => {
                            setSelectedTestForResult(test);
                            setActiveTab('results');
                            fetchFormResponses(test);
                          }}
                          className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-black py-2.5 px-3 rounded-xl text-xs text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <BarChart2 className="w-4 h-4" />
                          النتائج
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={() => setEditingTest(test)}
                          className="text-xs text-slate-600 hover:text-indigo-600 flex items-center gap-1 font-black cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                          تعديل الاختبار
                        </button>
                        <button
                          onClick={() => handleDeleteTest(test.id)}
                          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 font-black cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          حذف
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: RESULTS & GOOGLE SHEETS EXPORT */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900">النتائج والتقارير الذكية</h2>
              <p className="text-sm text-slate-500 font-medium">جلب إجابات ودرجات الطلاب من Google Forms وتصديرها إلى Google Sheets</p>
            </div>

            <div className="bg-white rounded-3xl border-4 border-slate-100 p-8 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="w-full sm:w-96">
                  <label className="block text-xs font-black text-slate-700 mb-1.5">اختر الاختبار لعرض نتائجه</label>
                  <select
                    value={selectedTestForResult?.id || ''}
                    onChange={(e) => {
                      const t = tests.find(item => item.id === e.target.value);
                      if (t) fetchFormResponses(t);
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold focus:outline-hidden focus:border-indigo-600"
                  >
                    <option value="">-- اختر اختباراً --</option>
                    {tests.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>

                {selectedTestForResult && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchFormResponses(selectedTestForResult)}
                      disabled={loadingResponses}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-3 rounded-2xl text-xs shadow-md border-b-4 border-indigo-900 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingResponses ? 'animate-spin' : ''}`} />
                      تحديث الإجابات
                    </button>
                    <button
                      onClick={() => handleExportToSheets(selectedTestForResult)}
                      disabled={exportingSheet}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl text-sm shadow-lg border-b-4 border-emerald-900 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {exportingSheet ? <RefreshCw className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-amber-300" />}
                      استخراج النتائج إلى Google Sheets 📊
                    </button>
                  </div>
                )}
              </div>

              {sheetResultUrl && (
                <div className="bg-emerald-50 border-3 border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <span className="text-sm font-black text-emerald-950">تم إنشاء جدول بيانات Google Sheets وتصدير النتائج بنجاح!</span>
                  </div>
                  <a
                    href={sheetResultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-5 py-2.5 rounded-xl shadow-md flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    فتح الجدول الآن
                  </a>
                </div>
              )}

              {/* Responses Table */}
              <div className="border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="bg-slate-50 px-6 py-4 border-b-2 border-slate-200 flex items-center justify-between">
                  <h3 className="font-black text-slate-800 text-sm">إجابات الطلاب المستلمة من Google Forms</h3>
                  <span className="text-xs font-black bg-indigo-100 text-indigo-900 px-3 py-1 rounded-xl">
                    {formResponses.length} إجابة
                  </span>
                </div>

                {loadingResponses ? (
                  <div className="p-12 text-center text-slate-400 font-bold">جاري جلب الإجابات من Google Forms...</div>
                ) : formResponses.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 space-y-2">
                    <Users className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
                    <p className="text-sm font-black text-slate-700">لا توجد إجابات مسجلة لهذا الاختبار بعد</p>
                    <p className="text-xs font-medium text-slate-400">تأكد من اختيار الاختبار وأن الطلاب قد قاموا بالإجابة على نموذج Google Form.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-200 font-black">
                        <tr>
                          <th className="px-6 py-3.5">المستجيب / البريد</th>
                          <th className="px-6 py-3.5">وقت الإرسال</th>
                          <th className="px-6 py-3.5">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {formResponses.map((resp, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-bold text-slate-900">{resp.respondentEmail || 'مجهول'}</td>
                            <td className="px-6 py-4 text-slate-500">{new Date(resp.createTime).toLocaleString('ar-SA')}</td>
                            <td className="px-6 py-4 text-emerald-700 font-black flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> تم استلام الإجابة بنجاح
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Edit Test Modal */}
      {editingTest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 shadow-2xl space-y-6 border-4 border-indigo-100">
            <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4">
              <h3 className="font-black text-slate-900 text-xl">تعديل الاختبار يدوياً 📝</h3>
              <button 
                onClick={() => setEditingTest(null)}
                className="text-slate-400 hover:text-slate-600 font-black text-xl cursor-pointer bg-slate-100 w-8 h-8 rounded-xl flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">عنوان الاختبار</label>
                <input
                  type="text"
                  value={editingTest.title}
                  onChange={e => setEditingTest({ ...editingTest, title: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold focus:outline-hidden focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">وصف الاختبار</label>
                <textarea
                  value={editingTest.description}
                  onChange={e => setEditingTest({ ...editingTest, description: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-medium h-24 focus:outline-hidden focus:border-indigo-600"
                />
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-slate-800 text-sm">الأسئلة والخيارات</h4>
                {editingTest.questions?.map((q: any, qIdx: number) => (
                  <div key={qIdx} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <input
                      type="text"
                      value={q.questionText}
                      onChange={e => {
                        const newQ = [...editingTest.questions];
                        newQ[qIdx].questionText = e.target.value;
                        setEditingTest({ ...editingTest, questions: newQ });
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-black"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {q.options?.map((opt: string, oIdx: number) => (
                        <input
                          key={oIdx}
                          type="text"
                          value={opt}
                          onChange={e => {
                            const newQ = [...editingTest.questions];
                            newQ[qIdx].options[oIdx] = e.target.value;
                            setEditingTest({ ...editingTest, questions: newQ });
                          }}
                          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t-2 border-slate-100">
              <button
                onClick={() => setEditingTest(null)}
                className="px-6 py-3 border-2 border-slate-200 rounded-2xl text-sm font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/tests/${editingTest.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(editingTest)
                    });
                    fetchTests();
                    setEditingTest(null);
                    alert('🎉 تم حفظ التعديلات بنجاح!');
                  } catch (err) {
                    alert('❌ فشل حفظ التعديلات');
                  }
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black shadow-lg border-b-4 border-indigo-900 active:border-b-0 active:translate-y-1 transition-all cursor-pointer"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
