/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Rocket, 
  Trophy, 
  RotateCcw, 
  ChevronRight, 
  Moon, 
  Sun, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Volume2, 
  VolumeX,
  History,
  Star
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuizState, LeaderboardEntry } from './types';

// Gemini Initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const TOTAL_QUESTIONS = 20;

const THEMES = ['Andromeda', 'Orion', 'Supernova', 'Pulsar', 'Nebula'];

const AUDIO_URLS = {
  success: 'https://cdn.pixabay.com/audio/2021/08/04/audio_bb63084330.mp3',
  failure: 'https://cdn.pixabay.com/audio/2022/03/24/audio_3d168d37a8.mp3',
  click: 'https://cdn.pixabay.com/audio/2022/03/24/audio_3497d3e098.mp3'
};

export default function App() {
  const [state, setState] = useState<QuizState>({
    currentQuestionIndex: 0,
    score: 0,
    history: [],
    status: 'start',
    playerName: '',
  });

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Audio handling
  const playSound = useCallback((type: keyof typeof AUDIO_URLS) => {
    if (!isAudioEnabled) return;
    const audio = new Audio(AUDIO_URLS[type]);
    audio.play().catch(() => {/* Handle browser block */});
  }, [isAudioEnabled]);

  // Fetch Leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Generate next question using Gemini
  const generateQuestion = async (currentHistory: Question[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const historyTexts = currentHistory.map(q => q.question).join(', ');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Izgeneriši unikatno i zanimljivo kviz pitanje o svemiru, astronomiji ili kosmičkoj istoriji na srpskom jeziku. 
        Pitanje NE SME biti slično ovim prethodnim: [${historyTexts}].
        Vrati isključivo validan JSON u sledećem formatu:
        {
          "question": "Tekst pitanja...",
          "options": ["Opcija 1", "Opcija 2", "Opcija 3", "Opcija 4"],
          "correctIndex": 0,
          "explanation": "Kratko i poučno objašnjenje zašto je taj odgovor tačan.",
          "themeKeyword": "Jedna od: Andromeda, Orion, Supernova, Pulsar, Nebula",
          "soundType": "neutral"
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              themeKeyword: { type: Type.STRING },
              soundType: { type: Type.STRING },
            },
            required: ["question", "options", "correctIndex", "explanation", "themeKeyword"]
          }
        }
      });

      const newQuestion = JSON.parse(response.text) as Question;
      return newQuestion;
    } catch (err: any) {
      console.error('Gemini error:', err);
      setError('Kosmička veza je prekinuta. Pokušaj ponovo.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startQuiz = async () => {
    if (!state.playerName || state.playerName.length > 15) return;
    const firstQ = await generateQuestion([]);
    if (firstQ) {
      setState(prev => ({
        ...prev,
        status: 'playing',
        history: [firstQ],
        currentQuestionIndex: 0,
        score: 0
      }));
    }
  };

  const handleAnswer = async (index: number) => {
    const currentQ = state.history[state.currentQuestionIndex];
    const isCorrect = index === currentQ.correctIndex;

    if (isCorrect) {
      playSound('success');
    } else {
      playSound('failure');
    }

    const nextIndex = state.currentQuestionIndex + 1;
    const newScore = isCorrect ? state.score + 1 : state.score;

    if (nextIndex < TOTAL_QUESTIONS) {
      const nextQ = await generateQuestion(state.history);
      if (nextQ) {
        setState(prev => ({
          ...prev,
          score: newScore,
          history: [...prev.history, nextQ],
          currentQuestionIndex: nextIndex
        }));
      }
    } else {
      // Quiz Finished
      finishQuiz(newScore);
    }
  };

  const finishQuiz = async (finalScore: number) => {
    setIsLoading(true);
    try {
      // Get AI Rank
      const rankRes = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Na osnovu rezultata od ${finalScore} od ${TOTAL_QUESTIONS} tačnih odgovora u Galaktičkom Kvizu za igrača "${state.playerName}", izmisli mu unikatni kosmički čin/titulu (npr. "Zapovednik Magline", "Čuvar Crne Rupe", "Lutajući Foton") i napiši kratku motivacionu poruku na srpskom jeziku. Vrati format: Titula - Poruka.`
      });

      // Submit score
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: state.playerName, score: finalScore })
      });
      
      await fetchLeaderboard();

      setState(prev => ({
        ...prev,
        status: 'review',
        score: finalScore,
        rank: rankRes.text
      }));
    } catch (err) {
      console.error('Rank generation/Score submission error:', err);
      setState(prev => ({ ...prev, status: 'review', score: finalScore }));
    } finally {
      setIsLoading(false);
    }
  };

  const resetQuiz = () => {
    setState({
      currentQuestionIndex: 0,
      score: 0,
      history: [],
      status: 'start',
      playerName: '',
    });
  };

  const currentQuestion = state.history[state.currentQuestionIndex];
  const themeClass = currentQuestion ? `theme-${currentQuestion.themeKeyword.toLowerCase()}` : '';

  return (
    <div className={`min-h-screen transition-all duration-700 bg-bg-deep text-text-main`}>
      {/* Background Layer with theme-specific gradients */}
      <div className={`fixed inset-0 pointer-events-none transition-all duration-1000 opacity-30 ${themeClass}`} />

      {/* Header */}
      <header className="relative z-10 p-10 flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-6">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-serif italic font-bold tracking-tight text-gradient">Galaktički Kviz</h1>
        </div>
        
        {state.status === 'playing' && (
          <div className="w-full md:w-80 space-y-2">
            <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-text-dim">
              <span>Pitanje {state.currentQuestionIndex + 1} od {TOTAL_QUESTIONS}</span>
              <span>{Math.round(((state.currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100)}% završen</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                className="bg-nebula-teal h-full shadow-[0_0_10px_#00d2d3]"
                initial={{ width: 0 }}
                animate={{ width: `${((state.currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-dim"
          >
            {isAudioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-10 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-start">
          
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {/* Home Screen */}
              {state.status === 'start' && (
                <motion.div 
                  key="start"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass p-12 rounded-[2rem] space-y-10"
                >
                  <div className="space-y-4">
                    <h2 className="text-5xl font-serif leading-tight">Započni svoju odiseju</h2>
                    <p className="text-text-dim text-lg max-w-md">
                      Testiraj svoje granice znanja kroz AI generisane izazove u dubokom svemiru.
                    </p>
                  </div>

                  <div className="space-y-4 max-w-md">
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Vaše kosmičko ime (max 15)"
                        maxLength={15}
                        value={state.playerName}
                        onChange={(e) => setState(prev => ({ ...prev, playerName: e.target.value }))}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-nebula-purple focus:ring-1 focus:ring-nebula-purple transition-all text-lg"
                      />
                    </div>
                    <button 
                      onClick={startQuiz}
                      disabled={!state.playerName || isLoading}
                      className="group w-full bg-nebula-purple hover:bg-opacity-90 disabled:opacity-30 disabled:cursor-not-allowed py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-xl shadow-nebula-purple/20"
                    >
                      {isLoading ? <Loader2 className="animate-spin" /> : <Rocket size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
                      Lansiraj Misiju
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Quiz Screen */}
              {state.status === 'playing' && currentQuestion && (
                <motion.div 
                  key={`question-${state.currentQuestionIndex}`}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  className="glass p-12 rounded-[2rem] space-y-10"
                >
                  <div className="space-y-2">
                    <div className="text-nebula-teal text-xs font-bold uppercase tracking-[0.2em]">
                      Kategorija: Kosmologija • Bodovi: {state.score}
                    </div>
                    <h3 className="text-3xl font-serif leading-snug">
                      {currentQuestion.question}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentQuestion.options.map((option, idx) => (
                      <button 
                        key={idx}
                        disabled={isLoading}
                        onClick={() => handleAnswer(idx)}
                        className="group flex items-center bg-white/[0.03] hover:bg-nebula-purple/10 border border-white/10 hover:border-nebula-purple p-6 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="w-10 h-10 rounded-full border border-text-dim flex items-center justify-center text-xs text-text-dim group-hover:border-nebula-teal group-hover:text-nebula-teal transition-colors mr-4 shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-lg">{option}</span>
                      </button>
                    ))}
                  </div>

                  {isLoading && (
                    <div className="flex items-center justify-center gap-3 text-nebula-teal text-sm font-medium animate-pulse">
                      <Loader2 className="animate-spin" size={18} />
                      Skeniranje podataka...
                    </div>
                  )}
                </motion.div>
              )}

              {/* Review Screen */}
              {state.status === 'review' && (
                <motion.div 
                  key="review"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-8"
                >
                  <div className="glass p-12 rounded-[2rem] space-y-8">
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="w-20 h-20 bg-nebula-teal/20 rounded-full flex items-center justify-center outline outline-1 outline-nebula-teal outline-offset-4">
                        <Trophy className="w-10 h-10 text-nebula-teal" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-4xl font-serif font-bold">Misija Završena</h2>
                        <div className="text-nebula-purple text-xs border border-nebula-purple/30 px-3 py-1 rounded-full uppercase tracking-widest inline-block">
                          AI Evaluacija Uspeha
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 px-8 py-8 border-y border-white/10">
                      <div className="text-center space-y-1">
                        <p className="text-[10px] text-text-dim uppercase tracking-[0.2em]">Rezultat</p>
                        <p className="text-5xl font-serif">{state.score}</p>
                      </div>
                      <div className="text-center space-y-1 border-l border-white/10">
                        <p className="text-[10px] text-text-dim uppercase tracking-[0.2em]">Uspeh</p>
                        <p className="text-5xl font-serif">{Math.round((state.score / TOTAL_QUESTIONS) * 100)}%</p>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 pt-4">
                      <button 
                        onClick={resetQuiz}
                        className="flex-1 bg-transparent hover:bg-white/5 border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all text-sm uppercase tracking-widest font-bold"
                      >
                        <RotateCcw size={18} /> Nova Misija
                      </button>
                    </div>
                  </div>

                  {/* History Review */}
                  <div className="space-y-6">
                    <h4 className="text-xl font-serif italic px-2">Hronika odgovora</h4>
                    <div className="grid gap-4">
                      {state.history.map((q, idx) => (
                        <div key={idx} className="glass p-8 rounded-2xl space-y-4 border-l-4 border-l-nebula-teal">
                          <div className="flex justify-between items-start">
                            <p className="text-xl font-medium leading-relaxed">{idx + 1}. {q.question}</p>
                            <span className="shrink-0 ml-4 px-3 py-1 rounded-lg bg-nebula-teal/10 text-nebula-teal text-xs font-bold border border-nebula-teal/20">
                              Tačno
                            </span>
                          </div>
                          <div className="pl-6 border-l border-white/10 py-1">
                            <p className="text-text-dim text-sm leading-relaxed italic">
                              "{q.explanation}"
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-10">
            {/* Current Rank Display */}
            <div className="glass p-8 rounded-2xl text-center space-y-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-text-dim block">Vaš Trenutni Čin</span>
              <div className="py-2">
                <p className="text-2xl font-serif text-white">{state.rank?.split('-')[0] || (state.status === 'playing' ? 'Kadet u letu' : 'Civili na tlu')}</p>
                <div className="text-[10px] text-nebula-purple uppercase tracking-widest mt-1">AI Status</div>
              </div>
            </div>

            {/* Global Leaderboard */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                <span className="text-[10px] uppercase tracking-[0.2em] text-text-dim">Globalni Top 100</span>
                <Trophy size={14} className="text-nebula-teal" />
              </div>
              <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <ul className="space-y-4">
                  {leaderboard.length === 0 ? (
                    <li className="text-center text-text-dim text-xs italic py-10">Skeniranje baze podataka...</li>
                  ) : (
                    leaderboard.slice(0, 10).map((entry, idx) => (
                      <li key={idx} className="flex justify-between items-center text-sm border-b border-white/5 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center">
                          <span className="text-nebula-teal font-black mr-4 text-xs italic">{(idx + 1).toString().padStart(2, '0')}</span>
                          <span className="font-medium truncate max-w-[120px]">{entry.name}</span>
                        </div>
                        <span className="font-serif text-nebula-purple">{entry.score.toLocaleString()}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </aside>

        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="relative z-10 max-w-7xl mx-auto px-10 pb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/5 pt-10 mt-10">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-text-dim">
          <div className="w-2 h-2 rounded-full bg-nebula-teal shadow-[0_0_8px_#00d2d3]" />
          <span>Tema: {currentQuestion?.themeKeyword || 'Deep Void'}</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={resetQuiz} className="px-6 py-2 rounded-full border border-white/10 text-[10px] uppercase tracking-[0.2em] text-text-dim hover:bg-white/5 transition-all">
            Resetuj Kviz
          </button>
        </div>
      </footer>

      {/* Decorative Stars */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        {[...Array(20)].map((_, i) => (
          <Star 
            key={i}
            size={Math.random() * 10}
            className="absolute animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              color: ['#fff', '#6366f1', '#a855f7'][Math.floor(Math.random() * 3)]
            }}
          />
        ))}
      </div>
    </div>
  );
}
