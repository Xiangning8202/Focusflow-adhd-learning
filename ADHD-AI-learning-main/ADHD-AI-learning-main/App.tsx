import React, { useState, useEffect, useRef } from 'react';
import { AppMode, ChatMessage, UserStats, SavedConcept, Distraction, StoredFile, StepRecord } from './types';
import ChatMode from './components/ChatMode';
import StepMode from './components/StepMode';
import FocusMode from './components/FocusMode';
import ReviewMode from './components/ReviewMode';
import RecordMode from './components/RecordMode';
import HomeMode from './components/HomeMode';
import { extractConcept } from './services/geminiService';
import { MessageSquare, Layers, BookOpen, BrainCircuit, Star, CloudLightning, Archive, X, Coffee, Send, Zap, Sun, Moon, ClipboardList, Home, Plus } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  // Theme State: Default to 'dark' per requirements
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Global State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  
  // Shared state for Step Mode
  const [stepTopic, setStepTopic] = useState<string>('');
  const [stepInitialMode, setStepInitialMode] = useState<'learn' | 'task'>('learn');
  const [stepRecords, setStepRecords] = useState<StepRecord[]>([]);

  // Shared state for Focus Mode
  const [focusFiles, setFocusFiles] = useState<StoredFile[]>([]);
  const [focusInitialText, setFocusInitialText] = useState<string>('');

  // Shared state for Review Mode
  const [reviewContext, setReviewContext] = useState<string>('');
  const [savedConcepts, setSavedConcepts] = useState<SavedConcept[]>([]);
  
  // Scratchpad / Distractions State
  const [distractions, setDistractions] = useState<Distraction[]>([]);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [scratchpadInput, setScratchpadInput] = useState('');
  const [quickCaptureInput, setQuickCaptureInput] = useState(''); // New state for modal input
  const [showDistractionsList, setShowDistractionsList] = useState(false);
  const scratchpadRef = useRef<HTMLInputElement>(null);
  const quickCaptureRef = useRef<HTMLInputElement>(null); // Ref for modal input focus

  // Energy / Nudge State
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const lastInteractionTime = useRef<number>(Date.now());
  const interactionInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [stats, setStats] = useState<UserStats>({
    points: 0,
    streak: 1,
    itemsLearned: 0
  });

  // Apply Theme Class to HTML root
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const NUDGE_MESSAGES = [
      "Feeling stuck? Take a deep breath. 🌬️",
      "Time for a quick stretch? 🧘",
      "Don't forget to blink! 👀",
      "Hydration check! 💧",
      "Great focus! Remember to rest your eyes.",
      "Shoulders relaxed? Jaw unclenched? 😌"
  ];

  // --- Interaction Monitoring for Energy Management ---
  useEffect(() => {
      const resetTimer = () => {
          lastInteractionTime.current = Date.now();
          if (showNudge) setShowNudge(false);
      };

      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);

      interactionInterval.current = setInterval(() => {
          const now = Date.now();
          const idleTime = now - lastInteractionTime.current;
          
          // If idle for more than 10 minutes (600000ms), show nudge
          if (idleTime > 10 * 60 * 1000 && !showNudge) {
              const randomMsg = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];
              setNudgeMessage(randomMsg);
              setShowNudge(true);
          }
      }, 60000); // Check every minute

      return () => {
          window.removeEventListener('mousemove', resetTimer);
          window.removeEventListener('keydown', resetTimer);
          window.removeEventListener('click', resetTimer);
          if (interactionInterval.current) clearInterval(interactionInterval.current);
      };
  }, [showNudge]);

  // --- Global Shortcut for Scratchpad (Ctrl+B) ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Ctrl+B for quick bottom overlay
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              setIsScratchpadOpen(prev => !prev);
          }
          // Ctrl+Shift+B (or similar) could toggle the main list, but user just said "any interface call out"
          // Let's assume the button is enough, or we can add another shortcut.
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus scratchpad overlay
  useEffect(() => {
      if (isScratchpadOpen && scratchpadRef.current) {
          scratchpadRef.current.focus();
      }
  }, [isScratchpadOpen]);

  // Auto-focus quick capture modal
  useEffect(() => {
      if (showDistractionsList && quickCaptureRef.current) {
          quickCaptureRef.current.focus();
      }
  }, [showDistractionsList]);

  const saveDistraction = () => {
      if (scratchpadInput.trim()) {
          setDistractions(prev => [{
              id: crypto.randomUUID(),
              text: scratchpadInput,
              timestamp: Date.now()
          }, ...prev]); // Add to top
          setScratchpadInput('');
          setIsScratchpadOpen(false);
      } else {
          setIsScratchpadOpen(false);
      }
  };

  const handleQuickCapture = () => {
      if (quickCaptureInput.trim()) {
          setDistractions(prev => [{
              id: crypto.randomUUID(),
              text: quickCaptureInput,
              timestamp: Date.now()
          }, ...prev]);
          setQuickCaptureInput('');
      }
  };

  const addPoints = (amount: number) => {
    setStats(prev => ({ ...prev, points: prev.points + amount }));
  };

  const handleAskInChat = (text: string) => {
    setPendingMessage(text);
    setMode(AppMode.CHAT);
  };

  const handleSwitchToSteps = (topic: string, mode: 'learn' | 'task' = 'learn') => {
    setStepTopic(topic);
    setStepInitialMode(mode);
    setMode(AppMode.STEPS);
  };

  const handleAddToReview = (text: string) => {
    setReviewContext(prev => (prev ? prev + "\n\n" + text : text));
  };

  const handleStepComplete = (topic: string) => {
      // Step completion logic is now handled in handleStepProgress mostly, but we can do final cleanup here if needed
  };

  const handleStepProgress = (topic: string, current: number, total: number) => {
      setStepRecords(prev => {
          const existingIndex = prev.findIndex(r => r.topic === topic);
          const timestamp = Date.now();
          
          if (existingIndex >= 0) {
              // Update existing
              const newRecords = [...prev];
              newRecords[existingIndex] = {
                  ...newRecords[existingIndex],
                  completedSteps: current,
                  totalSteps: total,
                  lastActive: timestamp,
                  status: current === total ? 'completed' : 'in-progress'
              };
              return newRecords;
          } else {
              // Create new
              return [...prev, {
                  id: crypto.randomUUID(),
                  topic,
                  timestamp,
                  totalSteps: total,
                  completedSteps: current,
                  lastActive: timestamp,
                  status: 'in-progress'
              }];
          }
      });
  };

  const handleSaveConcept = async (text: string, source: 'chat' | 'focus') => {
      try {
          const result = await extractConcept(text);
          if (result) {
              setSavedConcepts(prev => [...prev, {
                  id: crypto.randomUUID(),
                  term: result.term,
                  definition: result.definition,
                  sourceText: text,
                  sourceType: source,
                  timestamp: Date.now()
              }]);
              addPoints(5); 
          }
      } catch (e) {
          console.error("Failed to save concept", e);
      }
  };

  // Central Navigation Handler
  const handleNavigate = (targetMode: AppMode, initialInput?: string) => {
      setMode(targetMode);
      
      if (initialInput) {
          if (targetMode === AppMode.CHAT) {
              setPendingMessage(initialInput);
              setCurrentChatId(null); // Reset chat selection to start fresh/bottom
          } else if (targetMode === AppMode.STEPS) {
              setStepTopic(initialInput);
          } else if (targetMode === AppMode.FOCUS) {
              setFocusInitialText(initialInput);
          }
      }
  };

  const NavButton = ({ targetMode, icon: Icon, label }: { targetMode: AppMode, icon: any, label: string }) => (
    <button
      onClick={() => setMode(targetMode)}
      className={`flex flex-col items-center justify-center p-3 w-full rounded-xl mb-2 transition-all duration-200
        hover:-translate-y-0.5 hover:brightness-110 active:scale-95
        ${mode === targetMode 
          ? 'bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 shadow-lg shadow-indigo-200 dark:shadow-none scale-105' 
          : 'text-slate-400 dark:text-adhd-muted hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-adhd-text'
        }`}
    >
      <Icon size={24} className="mb-1" />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-adhd-bg font-sans text-slate-900 dark:text-adhd-text relative transition-colors duration-300">
      
      {/* Sidebar Navigation */}
      <nav className="w-20 bg-white dark:bg-adhd-sidebar border-r border-slate-200 dark:border-white/5 flex flex-col items-center py-6 z-20 shadow-sm transition-colors duration-300">
        <button 
            onClick={() => setMode(AppMode.HOME)}
            className="mb-8 w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-adhd-primary dark:to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-xl hover:scale-110 hover:brightness-110 transition-transform duration-300 shadow-md"
            title="Home"
        >
          F
        </button>
        
        <div className="flex-1 w-full px-2">
          {/* <NavButton targetMode={AppMode.HOME} icon={Home} label="Home" /> */}
          <NavButton targetMode={AppMode.CHAT} icon={MessageSquare} label="Chat" />
          <NavButton targetMode={AppMode.STEPS} icon={Layers} label="Steps" />
          <NavButton targetMode={AppMode.FOCUS} icon={BookOpen} label="Focus" />
          <NavButton targetMode={AppMode.REVIEW} icon={BrainCircuit} label="Review" />
          
          <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-4"></div>

          <NavButton targetMode={AppMode.RECORD} icon={ClipboardList} label="Record" />

          {/* Distractions Inbox Button - Renamed to Capture */}
          <button 
            onClick={() => setShowDistractionsList(true)}
            className="flex flex-col items-center justify-center p-3 w-full rounded-xl text-slate-400 dark:text-adhd-muted hover:bg-slate-100 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-adhd-primary transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95 relative mt-2"
            title="Quick Capture (稍后处理)"
          >
              <div className="relative">
                  <Archive size={24} className="mb-1" />
                  {distractions.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold">
                          {distractions.length}
                      </span>
                  )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Capture</span>
          </button>
        </div>

        {/* Theme Toggle */}
        <button 
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            className="mb-4 p-2 rounded-full text-slate-400 dark:text-adhd-muted hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:rotate-12"
            title="Toggle Dark Mode"
        >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        {/* User Stats Mini View */}
        <div className="mt-auto flex flex-col items-center p-2 bg-amber-50 dark:bg-white/5 rounded-xl border border-amber-100 dark:border-white/5 mx-2 hover:scale-105 transition-transform duration-200 cursor-default">
            <Star size={18} className="text-amber-500 fill-amber-500 mb-1" />
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{stats.points}</span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-hidden relative">
        {mode === AppMode.HOME && (
            <HomeMode onNavigate={handleNavigate} />
        )}
        {mode === AppMode.CHAT && (
          <ChatMode 
            messages={chatMessages} 
            setMessages={setChatMessages} 
            currentChatId={currentChatId} 
            setCurrentChatId={setCurrentChatId}
            initialMessage={pendingMessage}
            onMessageConsumed={() => setPendingMessage(null)}
            onSwitchToSteps={handleSwitchToSteps}
            onSaveConcept={handleSaveConcept}
          />
        )}
        {mode === AppMode.STEPS && (
          <StepMode 
            addPoints={addPoints} 
            initialTopic={stepTopic} 
            initialMode={stepInitialMode}
            onSessionComplete={handleStepComplete}
            onProgressUpdate={handleStepProgress}
            stepHistory={stepRecords} // Pass step history here
          />
        )}
        {mode === AppMode.FOCUS && (
          <FocusMode 
            initialText={focusInitialText}
            files={focusFiles}
            onUpdateFiles={setFocusFiles}
            onAskInChat={handleAskInChat} 
            onAddToReview={handleAddToReview} 
            onSaveConcept={handleSaveConcept}
            onTriggerScratchpad={() => setIsScratchpadOpen(true)}
          />
        )}
        {mode === AppMode.REVIEW && (
          <ReviewMode 
            chatHistory={chatMessages} 
            addPoints={addPoints} 
            externalContext={reviewContext} 
            savedConcepts={savedConcepts}
          />
        )}
        {mode === AppMode.RECORD && (
          <RecordMode 
            chatHistory={chatMessages} 
            stepHistory={stepRecords} 
            files={focusFiles}
            savedConcepts={savedConcepts} 
            onNavigate={handleNavigate}
            stats={stats} // Pass stats here
          />
        )}
      </main>

      {/* --- GLOBAL COMPONENTS --- */}

      {/* 1. Scratchpad (Brain Dump) Overlay - Shortcut Based */}
      {isScratchpadOpen && (
          <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
              <div className="bg-slate-900 dark:bg-adhd-surface text-white dark:text-adhd-text p-4 rounded-xl shadow-2xl w-80 border border-slate-700 dark:border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-indigo-300 dark:text-adhd-primary mb-1">
                      <div className="flex items-center gap-2">
                          <CloudLightning size={18} />
                          <span className="font-bold text-sm uppercase tracking-wide">Scratchpad</span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-adhd-muted">Press Enter to save</span>
                  </div>
                  <div className="relative">
                      <input
                          ref={scratchpadRef}
                          type="text"
                          value={scratchpadInput}
                          onChange={(e) => setScratchpadInput(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter') saveDistraction();
                              if (e.key === 'Escape') setIsScratchpadOpen(false);
                          }}
                          placeholder="Dump your thought here..."
                          className="w-full bg-slate-800 dark:bg-black/20 border border-slate-600 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-white dark:text-adhd-text focus:outline-none focus:border-indigo-500 dark:focus:border-adhd-primary focus:ring-1 focus:ring-indigo-500 dark:focus:ring-adhd-primary transition-all focus:shadow-lg"
                      />
                      <button 
                        onClick={saveDistraction}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white hover:scale-110 transition-transform"
                      >
                          <Send size={14} />
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 2. Quick Capture Modal (Unified List + Input) */}
      {showDistractionsList && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowDistractionsList(false)}>
              <div className="bg-white dark:bg-adhd-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-white/10" onClick={e => e.stopPropagation()}>
                  <div className="bg-slate-50 dark:bg-white/5 p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 dark:text-adhd-text flex items-center gap-2">
                          <Archive size={20} className="text-indigo-600 dark:text-adhd-primary" />
                          Quick Capture
                      </h3>
                      <button onClick={() => setShowDistractionsList(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text hover:rotate-90 transition-transform"><X size={20}/></button>
                  </div>
                  
                  {/* Minimalist Input Field at Top */}
                  <div className="p-4 bg-white dark:bg-adhd-surface border-b border-slate-100 dark:border-white/5 relative">
                      <input 
                          ref={quickCaptureRef}
                          type="text"
                          value={quickCaptureInput}
                          onChange={(e) => setQuickCaptureInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuickCapture()}
                          placeholder="What's on your mind?"
                          className="w-full bg-slate-50 dark:bg-black/20 border-0 rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-adhd-primary dark:text-white transition-all"
                      />
                      <button 
                          onClick={handleQuickCapture}
                          disabled={!quickCaptureInput.trim()}
                          className="absolute right-6 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-100 dark:bg-white/10 hover:bg-indigo-200 dark:hover:bg-white/20 text-indigo-600 dark:text-adhd-primary rounded-lg transition-colors disabled:opacity-0"
                      >
                          <Plus size={18} />
                      </button>
                  </div>

                  {/* List Content */}
                  <div className="p-4 max-h-[50vh] overflow-y-auto bg-slate-50/50 dark:bg-black/20">
                      {distractions.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 dark:text-adhd-muted">
                              <CloudLightning size={48} className="mx-auto mb-2 opacity-20" />
                              <p className="text-sm">Your mind is clear! No distractions logged.</p>
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {distractions.map(d => (
                                  <div key={d.id} className="bg-white dark:bg-adhd-bg p-3 rounded-lg border border-slate-200 dark:border-white/5 shadow-sm flex items-start gap-3 group hover:border-indigo-300 dark:hover:border-adhd-primary/50 transition-colors">
                                      <div className="mt-1 text-amber-500"><Zap size={16} /></div>
                                      <div className="flex-1">
                                          <p className="text-slate-800 dark:text-adhd-text text-sm">{d.text}</p>
                                          <p className="text-[10px] text-slate-400 dark:text-adhd-muted mt-1">{new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                      </div>
                                      <button 
                                        onClick={() => setDistractions(prev => prev.filter(x => x.id !== d.id))}
                                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                      >
                                          <X size={16} />
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 flex justify-end">
                      <button 
                          onClick={() => setDistractions([])}
                          className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 hover:-translate-y-0.5 transition-transform"
                          disabled={distractions.length === 0}
                      >
                          Clear All
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 3. Energy Nudge Toast */}
      {showNudge && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-500">
              <div className="bg-white/90 dark:bg-adhd-surface/90 backdrop-blur-md border border-indigo-100 dark:border-adhd-primary/30 shadow-xl rounded-full px-6 py-3 flex items-center gap-3 hover:-translate-y-1 transition-transform cursor-pointer" onClick={() => setShowNudge(false)}>
                  <div className="bg-indigo-100 dark:bg-adhd-primary/20 p-2 rounded-full text-indigo-600 dark:text-adhd-primary animate-pulse">
                      <Coffee size={18} />
                  </div>
                  <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-adhd-text">Energy Check</p>
                      <p className="text-xs text-slate-500 dark:text-adhd-muted">{nudgeMessage}</p>
                  </div>
                  <button onClick={(e) => {e.stopPropagation(); setShowNudge(false);}} className="ml-2 text-slate-400 hover:text-slate-600 dark:text-adhd-muted dark:hover:text-adhd-text"><X size={16}/></button>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;