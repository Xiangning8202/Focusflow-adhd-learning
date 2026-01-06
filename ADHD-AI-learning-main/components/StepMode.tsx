import React, { useState, useEffect, useRef, useMemo } from 'react';
import { generateSteps, generateLearningImage } from '../services/geminiService';
import { StepSession, StepRecord } from '../types';
import { ChevronRight, ChevronLeft, Play, Award, HelpCircle, CheckCircle, Sparkles, Clock, Target, AlertCircle, Image as ImageIcon, Youtube, Layers, Plus, PlayCircle, CheckCircle2, Compass, Upload, FileText, Loader2, Video, Link as LinkIcon, Trash2, File, Mic, Volume2, ArrowRight, ThumbsUp, Lightbulb, PanelRightOpen, PanelRightClose, PenTool, Check, Circle, List } from 'lucide-react';
import confetti from 'canvas-confetti';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.min.js`;

interface StepModeProps {
  addPoints: (amount: number) => void;
  initialTopic?: string;
  initialMode?: 'learn' | 'task';
  onSessionComplete?: (topic: string) => void;
  onProgressUpdate: (topic: string, current: number, total: number) => void;
  stepHistory: StepRecord[];
}

interface Resource {
    id: string;
    type: 'text' | 'video' | 'url';
    name: string;
    content?: string; // Text content
    data?: string; // Base64 for video
    mimeType?: string;
    url?: string;
}

const StepMode: React.FC<StepModeProps> = ({ addPoints, initialTopic = '', initialMode = 'learn', onSessionComplete, onProgressUpdate, stepHistory }) => {
  const [topicInput, setTopicInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<StepSession | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  // Resources State
  const [resources, setResources] = useState<Resource[]>([]);
  
  // Task Mode State
  const [modeType, setModeType] = useState<'learn' | 'task'>('learn');
  const [taskInput, setTaskInput] = useState(''); // Current step input
  const [showTaskFeedback, setShowTaskFeedback] = useState(false);
  
  // Scratchpad State (Right Panel)
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(true);
  const [scratchpadText, setScratchpadText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskFeedbackRef = useRef<HTMLDivElement>(null);
  
  // Visual Media State
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  // Quiz State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isQuizCorrect, setIsQuizCorrect] = useState<boolean>(false);
  const [showQuizFeedback, setShowQuizFeedback] = useState(false);

  // Auto-start if initialTopic provided
  useEffect(() => {
    if (initialTopic && !session && !isLoading) {
        const targetMode = initialMode || 'learn';
        setModeType(targetMode);
        setTopicInput(initialTopic);
        // Default to learn mode unless specified otherwise
        startSession(initialTopic, undefined, undefined, targetMode === 'task');
    }
  }, [initialTopic, initialMode]);

  // Reset state on step change & Trigger Image Generation & Report Progress
  useEffect(() => {
      if (session) {
          const currentStep = session.steps[session.currentStep];
          setTimeLeft((currentStep.estimatedMinutes || 2) * 60);
          setIsTimerPaused(false);
          setSelectedOption(null);
          setIsQuizCorrect(false);
          setShowQuizFeedback(false);
          setShowExample(false);
          setTaskInput(currentStep.userResponse || ''); // Load previous response if exists
          setShowTaskFeedback(false);
          
          // Report Progress
          onProgressUpdate(session.topic, session.currentStep, session.steps.length);

          // Reset Image
          setCurrentImage(null);
          
          // Image Generation Logic (For Learning Mode OR Task Mode if Feedback is shown later)
          // In Task Mode, we might delay this until they complete the step, or pre-load.
          if (currentStep.imagePrompt && !session.isTaskMode) {
              triggerImageGen(currentStep.imagePrompt);
          }
      }
  }, [session?.currentStep, session?.steps]);

  // Scroll to feedback when shown
  useEffect(() => {
      if (showTaskFeedback && taskFeedbackRef.current) {
          setTimeout(() => {
              taskFeedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
      }
  }, [showTaskFeedback]);

  // Derive Phases from Steps
  const phases = useMemo(() => {
    if (!session?.steps) return [];
    
    const uniquePhases: { title: string, startIndex: number, endIndex: number, steps: any[] }[] = [];
    let currentPhase: any = null;

    session.steps.forEach((step, index) => {
        const pTitle = step.phaseTitle || "General Tasks";
        if (!currentPhase || currentPhase.title !== pTitle) {
            if (currentPhase) {
                currentPhase.endIndex = index - 1;
                uniquePhases.push(currentPhase);
            }
            currentPhase = { title: pTitle, startIndex: index, endIndex: index, steps: [] };
        }
        currentPhase.steps.push(step);
    });
    if (currentPhase) {
        currentPhase.endIndex = session.steps.length - 1;
        uniquePhases.push(currentPhase);
    }
    return uniquePhases;
  }, [session?.steps]);

  // Determine Current Phase Index
  const currentPhaseIndex = useMemo(() => {
      if (!session) return 0;
      return phases.findIndex(p => session.currentStep >= p.startIndex && session.currentStep <= p.endIndex);
  }, [phases, session?.currentStep]);


  const triggerImageGen = (prompt: string) => {
      setIsImageLoading(true);
      generateLearningImage(prompt)
          .then(img => {
              if (img) setCurrentImage(img);
          })
          .finally(() => setIsImageLoading(false));
  };

  // Timer Tick
  useEffect(() => {
      if (!session || isTimerPaused || timeLeft <= 0) return;
      const timer = setInterval(() => {
          setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
  }, [session, isTimerPaused, timeLeft]);

  // Updated startSession to accept optional context text or video data
  const startSession = async (
      topic: string = topicInput, 
      contextText?: string, 
      videoData?: { mimeType: string, data: string },
      forceTaskMode?: boolean
    ) => {
    // If no explicit topic but we have resources, try to name it
    let finalTopic = topic.trim();
    if (!finalTopic && resources.length > 0) {
        finalTopic = resources[0].name;
    }
    if (!finalTopic) return;

    setIsLoading(true);
    setTopicInput(finalTopic); 
    setSession(null); 
    
    // Determine isTask from override or state
    const isTask = forceTaskMode !== undefined ? forceTaskMode : (modeType === 'task');

    try {
        // 1. Aggregate Text Context (Docs + URLs)
        let aggregatedText = contextText || "";
        
        // Add existing resources content if not passed directly
        if (!contextText) {
            const textResources = resources.filter(r => r.type === 'text');
            if (textResources.length > 0) {
                aggregatedText += "\n\n--- Document Content ---\n" + textResources.map(r => r.content).join("\n\n");
            }
        }

        const urlResources = resources.filter(r => r.type === 'url');
        if (urlResources.length > 0) {
            aggregatedText += "\n\n--- Reference Links ---\nPlease analyze the content at these URLs if possible:\n" + urlResources.map(r => r.url).join("\n");
        }

        // 2. Determine Video Data
        // We currently only support sending one video file to the API via this helper
        let finalVideoData = videoData;
        if (!finalVideoData) {
            const videoResource = resources.find(r => r.type === 'video');
            if (videoResource && videoResource.data && videoResource.mimeType) {
                finalVideoData = {
                    data: videoResource.data,
                    mimeType: videoResource.mimeType
                };
            }
        }

      const steps = await generateSteps(finalTopic, aggregatedText, finalVideoData, isTask);
      const newSession: StepSession = {
        id: crypto.randomUUID(),
        topic: finalTopic,
        steps,
        currentStep: 0,
        completed: false,
        isTaskMode: isTask
      };
      setSession(newSession);
      // Initial progress report
      onProgressUpdate(finalTopic, 0, steps.length);
    } catch (e) {
      console.error(e);
      alert("Failed to generate steps. Please try a simpler topic or shorter file.");
    } finally {
      setIsLoading(false);
      setIsProcessingFile(false);
    }
  };

  const handleAddLink = () => {
      if (!urlInput.trim()) return;
      const newResource: Resource = {
          id: crypto.randomUUID(),
          type: 'url',
          name: urlInput, // Or try to parse a cleaner name
          url: urlInput
      };
      setResources(prev => [...prev, newResource]);
      setUrlInput('');
  };

  const removeResource = (id: string) => {
      setResources(prev => prev.filter(r => r.id !== id));
  };

  // --- File Processing Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setIsProcessingFile(true);
      const file = e.target.files[0];
      const fileType = file.name.split('.').pop()?.toLowerCase();
      
      // Video Check
      if (file.type.startsWith('video/')) {
          if (file.size > 20 * 1024 * 1024) { // 20MB limit for inline base64 safety
               alert("Video is too large. Please upload a video smaller than 20MB for this demo.");
               setIsProcessingFile(false);
               return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
              const base64String = reader.result as string;
              // Remove "data:video/mp4;base64," prefix for API
              const base64Data = base64String.split(',')[1];
              
              const newResource: Resource = {
                  id: crypto.randomUUID(),
                  type: 'video',
                  name: file.name,
                  data: base64Data,
                  mimeType: file.type
              };
              setResources(prev => [...prev, newResource]);
              setIsProcessingFile(false);
          };
          reader.onerror = () => {
              alert("Error reading video file.");
              setIsProcessingFile(false);
          };
          reader.readAsDataURL(file);
          return;
      }

      // Document Check
      try {
          let extractedText = "";

          if (fileType === 'pdf') {
              const arrayBuffer = await file.arrayBuffer();
              const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
              const pdf = await loadingTask.promise;
              const numPages = pdf.numPages;
              const textParts = [];
              
              for (let i = 1; i <= Math.min(numPages, 10); i++) { // Limit to first 10 pages for step generation speed
                  const page = await pdf.getPage(i);
                  const content = await page.getTextContent();
                  const strings = content.items.map((item: any) => item.str);
                  textParts.push(strings.join(" "));
              }
              extractedText = textParts.join('\n\n');

          } else if (fileType === 'docx') {
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              extractedText = result.value;

          } else if (fileType === 'txt') {
              extractedText = await file.text();
          } else {
              alert("Unsupported file type. Please upload PDF, Word, TXT, or Video.");
              setIsProcessingFile(false);
              return;
          }

          if (extractedText.trim()) {
               const newResource: Resource = {
                  id: crypto.randomUUID(),
                  type: 'text',
                  name: file.name,
                  content: extractedText
              };
              setResources(prev => [...prev, newResource]);
          } else {
              alert("Could not extract text from this file.");
          }

      } catch (error) {
          console.error("File processing failed:", error);
          alert("Error processing file. Please try another.");
      } finally {
          setIsProcessingFile(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const triggerCompletionConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#5F9EA0', '#FFA07A', '#F0E68C']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#5F9EA0', '#FFA07A', '#F0E68C']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  const triggerMicroConfetti = () => {
      confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#8FBC8F', '#FFD700'],
          disableForReducedMotion: true
      });
  };

  const triggerPhaseConfetti = () => {
      confetti({
          particleCount: 80,
          spread: 80,
          origin: { x: 0.2, y: 0.6 },
          colors: ['#6366f1', '#a855f7'],
      });
  };

  const speakText = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const saveTaskInput = () => {
      if (!session) return;
      const updatedSteps = [...session.steps];
      updatedSteps[session.currentStep].userResponse = taskInput;
      setSession({...session, steps: updatedSteps});
  };

  const selectTaskSuggestion = (suggestion: string) => {
      setTaskInput(suggestion);
      // Trigger positive reinforcement immediately
      triggerMicroConfetti();
      // Show resources/feedback immediately
      handleTaskInteraction();
  };

  const handleTaskInteraction = () => {
      if (!session) return;
      setShowTaskFeedback(true);
      const currentStep = session.steps[session.currentStep];
      // Lazy load the image if we haven't yet and it exists
      if (currentStep.imagePrompt && !currentImage) {
          triggerImageGen(currentStep.imagePrompt);
      }
  };

  const nextStep = () => {
    if (!session) return;
    
    // Validate Quiz
    if (session.steps[session.currentStep].type === 'quiz' && !isQuizCorrect) {
        setShowQuizFeedback(true);
        return;
    }

    if (session.isTaskMode) {
        saveTaskInput();
        // If feedback wasn't shown yet (user just clicked next), treat as interaction complete
        if (!showTaskFeedback) {
            triggerMicroConfetti();
        }
        
        // Check if we are completing a PHASE
        const currentPhase = phases.find(p => session.currentStep >= p.startIndex && session.currentStep <= p.endIndex);
        if (currentPhase && session.currentStep === currentPhase.endIndex) {
            triggerPhaseConfetti(); // Phase Complete celebration
            addPoints(50);
        }
    }
    
    if (session.currentStep < session.steps.length - 1) {
      setSession({ ...session, currentStep: session.currentStep + 1 });
      addPoints(10); // Reward for small progress
    } else {
      const updatedSession = { ...session, completed: true };
      setSession(updatedSession);
      addPoints(100); // Big reward for completion
      onProgressUpdate(session.topic, session.steps.length, session.steps.length); // 100%
      triggerCompletionConfetti();
      if (onSessionComplete) onSessionComplete(session.topic);
    }
  };

  const prevStep = () => {
    if (!session || session.currentStep === 0) return;
    if (session.isTaskMode) saveTaskInput();
    setSession({ ...session, currentStep: session.currentStep - 1 });
  };

  const handleOptionSelect = (index: number) => {
      if (!session) return;
      setSelectedOption(index);
      setShowQuizFeedback(true);
      const isCorrect = index === session.steps[session.currentStep].correctOptionIndex;
      setIsQuizCorrect(isCorrect);
      if (isCorrect) {
          addPoints(20);
          triggerMicroConfetti();
      }
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to safely extract Video ID from URL or raw ID
  const extractVideoId = (input: string | undefined): string | null => {
      if (!input) return null;
      // If it looks like a URL (youtube.com or youtu.be), extract ID
      const urlRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
      const match = input.match(urlRegex);
      if (match) return match[1];
      // Otherwise assume it's already an ID if length is approx 11
      if (input.length === 11) return input;
      return null;
  };

  // --- Layout & Render Helpers ---

  const renderSidebar = () => (
      <div className="w-72 bg-white dark:bg-adhd-sidebar border-r border-slate-200 dark:border-white/5 flex flex-col hidden md:flex z-10">
          <div className="p-4 border-b border-slate-100 dark:border-white/5 font-display font-semibold text-slate-500 dark:text-adhd-muted flex justify-between items-center bg-white dark:bg-adhd-sidebar">
              <span className="flex items-center gap-2"><Layers size={18}/> Learning Paths</span>
              <button 
                  onClick={() => { setSession(null); setTopicInput(''); setResources([]); }} 
                  className="p-1.5 bg-indigo-100 dark:bg-white/10 hover:bg-indigo-200 dark:hover:bg-white/20 rounded-lg text-indigo-600 dark:text-adhd-primary transition-all hover:scale-105 flex items-center gap-1.5" 
                  title="New Topic"
              >
                  <Plus size={14} />
                  <span className="text-xs font-bold">New</span>
              </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-4">
              
              {/* History Section */}
              {stepHistory.length > 0 ? (
                  <div>
                      <h4 className="px-2 text-xs font-bold text-slate-400 dark:text-adhd-muted uppercase tracking-wider mb-2 flex justify-between items-center">
                        History
                        <span className="bg-slate-100 dark:bg-white/10 px-1.5 rounded text-[10px] text-slate-500 dark:text-adhd-muted">{stepHistory.length}</span>
                      </h4>
                      <div className="space-y-2">
                        {stepHistory.map(record => {
                            const isActive = session?.topic === record.topic;
                            const progress = Math.round((record.completedSteps / Math.max(1, record.totalSteps)) * 100);
                            return (
                                <div 
                                    key={record.id}
                                    onClick={() => startSession(record.topic)}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all group hover:shadow-sm ${isActive ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-500/30' : 'bg-white border-slate-100 dark:bg-adhd-surface dark:border-white/5 hover:border-indigo-200'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className={`font-bold text-sm truncate flex-1 ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-adhd-text'}`}>
                                            {record.topic}
                                        </h4>
                                        {record.status === 'completed' ? (
                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                        ) : (
                                            <PlayCircle size={14} className="text-amber-500" />
                                        )}
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mb-1">
                                        <div 
                                            className={`h-full rounded-full ${record.status === 'completed' ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-adhd-muted flex justify-between">
                                        <span>{record.completedSteps}/{record.totalSteps} steps</span>
                                        <span>{new Date(record.lastActive).toLocaleDateString()}</span>
                                    </p>
                                </div>
                            );
                        })}
                      </div>
                  </div>
              ) : (
                 <div className="p-4 text-center text-slate-400 dark:text-adhd-muted text-sm italic">
                      No learning paths yet. Start one to see it here!
                 </div>
              )}
          </div>
      </div>
  );

  const renderTaskSidebar = () => {
    if (!session) return null;
    return (
        <div className="w-72 bg-white dark:bg-adhd-sidebar border-r border-slate-200 dark:border-white/5 flex flex-col hidden md:flex z-10">
            <div className="p-4 border-b border-slate-100 dark:border-white/5 font-display font-semibold text-slate-800 dark:text-adhd-text flex items-center gap-2 bg-white dark:bg-adhd-sidebar">
                <List size={18}/> {session.topic}
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-6">
                    {phases.map((phase, pIdx) => {
                        const isCompleted = session.currentStep > phase.endIndex;
                        const isActive = session.currentStep >= phase.startIndex && session.currentStep <= phase.endIndex;
                        
                        return (
                            <div key={pIdx} className={`relative pl-4 ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                                {/* Connecting Line */}
                                {pIdx < phases.length - 1 && (
                                    <div className="absolute left-[27px] top-8 bottom-[-24px] w-0.5 bg-slate-200 dark:bg-white/10"></div>
                                )}
                                
                                <div className="flex items-start gap-3 mb-2">
                                    {/* Level 1 Indicator */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 font-bold transition-all z-10 relative
                                        ${isCompleted 
                                            ? 'bg-emerald-100 border-emerald-500 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-400' 
                                            : isActive 
                                                ? 'bg-indigo-100 border-indigo-500 text-indigo-600 dark:bg-indigo-900/20 dark:border-adhd-primary dark:text-adhd-primary ring-2 ring-indigo-200 dark:ring-white/5' 
                                                : 'bg-white border-slate-300 text-slate-400 dark:bg-adhd-bg dark:border-white/10 dark:text-adhd-muted'}
                                    `}>
                                        {isCompleted ? <Check size={16} /> : <span>{pIdx + 1}</span>}
                                    </div>
                                    <h4 className={`font-bold mt-1 text-sm ${isActive ? 'text-indigo-700 dark:text-adhd-primary' : 'text-slate-600 dark:text-adhd-text'}`}>
                                        {phase.title}
                                    </h4>
                                </div>

                                {/* Level 2 Steps (Visible if active or completed) */}
                                <div className="ml-4 space-y-1">
                                    {phase.steps.map((step, sIdx) => {
                                        const globalIndex = phase.startIndex + sIdx;
                                        const isStepCompleted = session.currentStep > globalIndex;
                                        const isStepActive = session.currentStep === globalIndex;

                                        return (
                                            <div key={sIdx} className="flex items-center gap-2 py-1 px-2 rounded-lg transition-colors">
                                                <div className={`w-2 h-2 rounded-full shrink-0 
                                                    ${isStepCompleted ? 'bg-emerald-400' : isStepActive ? 'bg-indigo-500 dark:bg-adhd-primary animate-pulse' : 'bg-slate-200 dark:bg-white/10'}`
                                                }></div>
                                                <span className={`text-xs truncate ${isStepActive ? 'font-bold text-slate-800 dark:text-adhd-text' : 'text-slate-500 dark:text-adhd-muted'}`}>
                                                    {step.title}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
             <div className="p-3 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                <button 
                  onClick={() => { setSession(null); setTopicInput(''); setResources([]); }} 
                  className="w-full py-2 bg-white dark:bg-adhd-surface border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-adhd-muted dark:hover:text-adhd-text shadow-sm hover:shadow transition-all"
                >
                    Start New Task
                </button>
            </div>
        </div>
    );
  };

  const renderTaskView = () => {
    if (!session) return null;
    const currentStepData = session.steps[session.currentStep];
    const totalSteps = session.steps.length;
    // Circular progress calculation
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - ((session.currentStep + 1) / totalSteps) * circumference;
    
    // Segment logic
    const isFirstSegment = session.currentStep < totalSteps / 3;
    const videoId = extractVideoId(currentStepData.videoId);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* 1. Left Sidebar: Task Tree */}
            {renderTaskSidebar()}

            {/* 2. Center: Card */}
            <div className="flex-1 flex flex-col items-center justify-center h-full p-4 overflow-y-auto bg-slate-50 dark:bg-adhd-bg relative">
                
                {/* Main Card */}
                <div className="w-full max-w-2xl bg-white dark:bg-adhd-surface rounded-3xl shadow-2xl border-2 border-slate-100 dark:border-white/10 relative my-auto animate-in fade-in zoom-in-95 duration-300">
                    
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/5 rounded-t-3xl">
                        <div>
                            <span className="text-xs font-bold text-indigo-500 dark:text-adhd-primary uppercase tracking-wider mb-1 block">
                                Phase {currentPhaseIndex + 1}: {phases[currentPhaseIndex]?.title}
                            </span>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-adhd-text leading-tight">{currentStepData.title}</h2>
                        </div>
                        
                        <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
                                <circle cx="30" cy="30" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100 dark:text-white/10" />
                                <circle 
                                    cx="30" 
                                    cy="30" 
                                    r={radius} 
                                    stroke="currentColor" 
                                    strokeWidth="4" 
                                    fill="transparent" 
                                    strokeDasharray={circumference} 
                                    strokeDashoffset={strokeDashoffset} 
                                    className={`transition-all duration-500 ${isFirstSegment ? 'text-emerald-400' : 'text-indigo-500 dark:text-adhd-primary'}`} 
                                    strokeLinecap="round"
                                />
                            </svg>
                             <span className="absolute text-[10px] font-bold text-slate-500 dark:text-adhd-muted">
                                {Math.round(((session.currentStep + 1) / totalSteps) * 100)}%
                            </span>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-6 md:p-8 flex flex-col items-center text-center">
                        <div className="mb-6 w-20 h-20 rounded-full bg-indigo-50 dark:bg-adhd-primary/20 flex items-center justify-center text-indigo-600 dark:text-adhd-primary shadow-sm animate-in zoom-in">
                            <span className="text-4xl">{currentStepData.icon || "✨"}</span>
                        </div>

                        <div className="mb-8 w-full">
                            <div className="flex items-start justify-center gap-2 mb-2">
                                <span className="text-sm font-bold text-slate-400 dark:text-adhd-muted uppercase mt-1">Current Step</span>
                                <button onClick={() => speakText(currentStepData.explanation || "")} className="text-slate-400 hover:text-indigo-500 transition-colors">
                                    <Volume2 size={16} />
                                </button>
                            </div>
                            <h3 className="text-2xl md:text-3xl font-display font-bold text-slate-800 dark:text-[#E0E0E0] leading-snug">
                                {currentStepData.explanation}
                            </h3>
                        </div>

                        <div className="w-full max-w-lg mb-4">
                            <textarea 
                                value={taskInput}
                                onChange={(e) => {
                                    setTaskInput(e.target.value);
                                    if (!showTaskFeedback && e.target.value.length > 5) handleTaskInteraction();
                                }}
                                placeholder={currentStepData.example || "Type your thoughts here..."}
                                className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 text-slate-800 dark:text-adhd-text text-lg focus:border-indigo-400 focus:ring-0 outline-none transition-all resize-none min-h-[80px]"
                            />
                        </div>

                        {currentStepData.suggestedAnswers && currentStepData.suggestedAnswers.length > 0 && !showTaskFeedback && (
                            <div className="w-full max-w-lg mb-4">
                                <p className="text-xs font-bold text-slate-400 dark:text-adhd-muted uppercase mb-2 text-left w-full pl-1">Quick Responses</p>
                                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                                    {currentStepData.suggestedAnswers.map((ans, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => selectTaskSuggestion(ans)}
                                            className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-600 dark:text-adhd-text hover:text-emerald-700 dark:hover:text-emerald-400 rounded-full text-sm font-semibold border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all active:scale-95 flex items-center gap-2"
                                        >
                                            <ThumbsUp size={14} /> {ans}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showTaskFeedback && (
                            <div ref={taskFeedbackRef} className="w-full max-w-lg mt-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
                                 <div className="bg-indigo-50 dark:bg-white/5 border border-indigo-100 dark:border-white/10 rounded-2xl p-5 text-left shadow-inner">
                                    <h4 className="flex items-center gap-2 text-indigo-700 dark:text-adhd-primary font-bold mb-3">
                                        <Lightbulb size={18} /> Helpful Info
                                    </h4>
                                    
                                    {currentStepData.feedback && (
                                        <p className="text-slate-700 dark:text-adhd-text text-sm mb-4 leading-relaxed">
                                            {currentStepData.feedback}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {isImageLoading ? (
                                            <div className="h-32 bg-white dark:bg-black/20 rounded-lg flex flex-col items-center justify-center text-xs text-slate-400 animate-pulse border border-indigo-100 dark:border-white/5">
                                                <ImageIcon size={20} className="mb-2 opacity-50"/>
                                                Drawing visual...
                                            </div>
                                        ) : currentImage ? (
                                            <div className="h-32 bg-white dark:bg-black/20 rounded-lg border border-indigo-100 dark:border-white/5 overflow-hidden group relative">
                                                <img src={currentImage} alt="Visual Aid" className="w-full h-full object-contain p-2" />
                                            </div>
                                        ) : null}

                                        {videoId && (
                                            <div className="h-32 bg-black rounded-lg overflow-hidden border border-slate-800 relative group">
                                                <img 
                                                    src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} 
                                                    alt="Video Thumbnail" 
                                                    className="w-full h-full object-cover opacity-80"
                                                />
                                                <a 
                                                    href={`https://www.youtube.com/watch?v=${videoId}`} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors"
                                                >
                                                    <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                                                        <Play size={16} fill="currentColor" />
                                                    </div>
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                 </div>
                            </div>
                        )}

                    </div>

                    {/* Footer Controls */}
                    <div className="p-6 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 flex justify-between items-center rounded-b-3xl">
                        <button 
                            onClick={prevStep}
                            disabled={session.currentStep === 0}
                            className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30 transition-all font-semibold"
                        >
                            Back
                        </button>
                        
                        <button 
                            onClick={nextStep}
                            className="px-8 py-3 rounded-xl bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 animate-pulse hover:animate-none"
                        >
                            {session.currentStep === session.steps.length - 1 ? 'Finish!' : 'Done! Next'}
                            <ArrowRight size={20} />
                        </button>
                    </div>

                </div>
            </div>

            {/* 3. Right Sidebar: Scratchpad */}
            <div className={`bg-white dark:bg-adhd-sidebar border-l border-slate-200 dark:border-white/5 shadow-xl flex flex-col z-20 transition-all duration-300 ease-in-out ${isScratchpadOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                <div className="w-80 flex flex-col h-full">
                    <div className="p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                        <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2">
                            <PenTool size={16} /> Scratchpad
                        </h3>
                        <button onClick={() => setIsScratchpadOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text"><PanelRightClose size={18} /></button>
                    </div>
                    <div className="flex-1 p-4 bg-slate-50 dark:bg-adhd-bg">
                         <textarea
                            value={scratchpadText}
                            onChange={(e) => setScratchpadText(e.target.value)}
                            placeholder="Jot down loose thoughts, distractions, or ideas here..."
                            className="w-full h-full bg-white dark:bg-adhd-surface border border-slate-200 dark:border-white/10 rounded-xl p-4 resize-none focus:ring-2 focus:ring-indigo-400 focus:outline-none dark:text-adhd-text text-sm leading-relaxed"
                         />
                    </div>
                </div>
            </div>
             
             {/* Toggle Button for Right Sidebar if closed */}
             {!isScratchpadOpen && (
                 <button 
                    onClick={() => setIsScratchpadOpen(true)}
                    className="absolute right-4 top-4 p-2 bg-white dark:bg-adhd-surface border border-slate-200 dark:border-white/10 rounded-lg shadow-sm text-slate-500 hover:text-indigo-600 dark:text-adhd-muted dark:hover:text-adhd-primary z-10"
                    title="Open Scratchpad"
                 >
                     <PanelRightOpen size={20} />
                 </button>
             )}
        </div>
    );
  };

  const renderContent = () => {
    if (isLoading || isProcessingFile) {
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 border-4 border-indigo-200 dark:border-white/20 border-t-indigo-600 dark:border-t-adhd-primary rounded-full animate-spin mb-4"></div>
            <p className="font-display text-xl text-slate-600 dark:text-adhd-text animate-pulse">
                {isProcessingFile ? `Reading "${fileInputRef.current?.files?.[0]?.name || 'video'}"...` : `Designing your path...`}
            </p>
          </div>
        );
    }

    if (!session) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 animate-in fade-in zoom-in-95 duration-300 overflow-y-auto">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".pdf,.docx,.txt,video/*" 
                onChange={handleFileUpload} 
            />
            <div className="max-w-xl w-full text-center">
                
                {/* Mode Switcher */}
                <div className="inline-flex bg-slate-100 dark:bg-white/10 p-1 rounded-full mb-8 shadow-inner">
                    <button 
                        onClick={() => setModeType('learn')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${modeType === 'learn' ? 'bg-white dark:bg-adhd-primary text-indigo-600 dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-adhd-muted hover:text-slate-700'}`}
                    >
                        Learn Topic
                    </button>
                    <button 
                        onClick={() => setModeType('task')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${modeType === 'task' ? 'bg-white dark:bg-adhd-primary text-indigo-600 dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-adhd-muted hover:text-slate-700'}`}
                    >
                        Task Breakdown
                    </button>
                </div>

                <div className="mb-6 bg-amber-100 dark:bg-amber-900/40 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-amber-500 dark:text-amber-400 shadow-md">
                    {modeType === 'learn' ? <Play size={40} className="ml-1"/> : <Target size={40} />}
                </div>
                
                <h2 className="text-3xl font-display font-bold text-slate-800 dark:text-adhd-text mb-3">
                    {modeType === 'learn' ? 'Step-by-Step Learning' : 'Task Breakdown Assistant'}
                </h2>
                <p className="text-slate-500 dark:text-adhd-muted mb-8">
                    {modeType === 'learn' 
                        ? 'Break down any complex topic, video, or document into bite-sized chunks.' 
                        : 'Overwhelmed? Let\'s break that big scary task into tiny, easy steps.'}
                </p>
                
                {/* Topic Input */}
                <div className="relative group mb-8">
                    <input 
                        type="text" 
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        placeholder={modeType === 'learn' ? "What do you want to learn today?" : "I need to..."}
                        className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-white/10 dark:bg-adhd-surface dark:text-adhd-text focus:border-indigo-500 dark:focus:border-adhd-primary focus:ring-0 outline-none text-lg transition-all"
                        onKeyDown={(e) => e.key === 'Enter' && startSession()}
                    />
                </div>
                
                {/* Resources Section (Only for Learn Mode usually, but kept for flexibility) */}
                {modeType === 'learn' && (
                <div className="bg-white dark:bg-adhd-surface border border-slate-200 dark:border-white/5 rounded-2xl p-6 text-left shadow-sm mb-6">
                    <h4 className="text-xs font-bold uppercase text-slate-400 dark:text-adhd-muted mb-4 flex items-center gap-2">
                         <Layers size={14} /> Add Study Materials
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {/* Upload Button */}
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 border border-dashed border-slate-300 dark:border-white/10 hover:border-indigo-400 dark:hover:border-adhd-primary bg-slate-50 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 p-3 rounded-xl transition-all"
                        >
                            <Upload size={18} className="text-indigo-500 dark:text-adhd-primary"/>
                            <span className="text-sm font-semibold text-slate-600 dark:text-adhd-text">Upload File</span>
                        </button>
                        
                        {/* Link Input */}
                        <div className="flex gap-2">
                             <input 
                                type="text" 
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="Paste YouTube Link..."
                                className="flex-1 min-w-0 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 text-sm focus:border-indigo-400 outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                             />
                             <button 
                                onClick={handleAddLink}
                                disabled={!urlInput.trim()}
                                className="bg-indigo-100 dark:bg-white/10 hover:bg-indigo-200 dark:hover:bg-white/20 text-indigo-600 dark:text-adhd-primary p-3 rounded-xl transition-colors disabled:opacity-50"
                             >
                                 <Plus size={18} />
                             </button>
                        </div>
                    </div>

                    {/* Added List */}
                    {resources.length > 0 && (
                        <div className="space-y-2 mt-4">
                            {resources.map(res => (
                                <div key={res.id} className="flex items-center justify-between bg-slate-50 dark:bg-black/20 p-2 rounded-lg border border-slate-100 dark:border-white/5 animate-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-1.5 bg-white dark:bg-white/10 rounded-md shrink-0">
                                            {res.type === 'video' ? <Video size={14} className="text-pink-500" /> : 
                                             res.type === 'url' ? <LinkIcon size={14} className="text-blue-500" /> : 
                                             <FileText size={14} className="text-indigo-500" />}
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 dark:text-adhd-text truncate">{res.name}</span>
                                    </div>
                                    <button 
                                        onClick={() => removeResource(res.id)}
                                        className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-white dark:hover:bg-white/10 rounded transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                )}

                <button 
                    onClick={() => startSession()}
                    disabled={!topicInput.trim() && resources.length === 0}
                    className="w-full bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 py-3 rounded-xl font-bold hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95 shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {modeType === 'learn' ? <PlayCircle size={20} /> : <Target size={20} />}
                    {modeType === 'learn' ? 'Start Learning' : 'Start Task Breakdown'}
                </button>
            </div>
          </div>
        );
    }

    if (session.completed) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-adhd-surface dark:to-black text-white p-6 animate-in fade-in duration-500">
                <Award size={80} className="mb-6 text-yellow-300 dark:text-adhd-accent animate-bounce" />
                <h2 className="text-4xl font-display font-bold mb-4">Mission Complete!</h2>
                <p className="text-indigo-100 dark:text-adhd-muted text-lg mb-8 max-w-md text-center">
                    {session.isTaskMode ? "You crushed it! That big task wasn't so scary after all." : `You've mastered the basics of ${session.topic}. Great focus!`}
                </p>
                <button 
                    onClick={() => {setSession(null); setTopicInput(''); setResources([]);}}
                    className="bg-white dark:bg-adhd-primary text-indigo-600 dark:text-slate-900 px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-transform hover:brightness-110"
                >
                    Start New Session
                </button>
            </div>
        )
    }

    // --- Task Mode View ---
    if (session.isTaskMode) {
        return renderTaskView();
    }

    // --- Standard Learning Mode View ---
    const currentStepData = session.steps[session.currentStep];
    const isQuiz = currentStepData.type === 'quiz';
    const cleanVideoId = extractVideoId(currentStepData.videoId);

    return (
        <div className="flex h-full bg-slate-100 dark:bg-adhd-bg transition-colors duration-300">
            {renderSidebar()}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header: Visual Progress Blocks */}
                <div className="max-w-3xl mx-auto w-full mb-8 pt-4 md:pt-8 px-4 md:px-0">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-bold text-slate-500 dark:text-adhd-muted uppercase tracking-wider">{session.topic}</span>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${timeLeft <= 0 ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-600 dark:bg-adhd-primary/20 dark:text-adhd-primary'}`}>
                            <Clock size={14} />
                            {timeLeft > 0 ? `Suggested: ${formatTime(timeLeft)}` : "Take your time"}
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        {session.steps.map((s, idx) => {
                            let statusClass = "bg-slate-200 dark:bg-white/10"; // Upcoming
                            if (idx < session.currentStep) statusClass = "bg-emerald-400 dark:bg-emerald-600"; // Completed
                            if (idx === session.currentStep) statusClass = "bg-indigo-500 dark:bg-adhd-primary ring-4 ring-indigo-200 dark:ring-adhd-primary/30"; // Current

                            return (
                                <div 
                                    key={idx} 
                                    className={`h-3 flex-1 rounded-full transition-all duration-300 ${statusClass}`}
                                    title={s.title}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Main Card */}
                <div className="flex-1 flex items-start justify-center overflow-y-auto pb-8 px-4">
                    <div className={`max-w-3xl w-full bg-white dark:bg-adhd-surface rounded-3xl shadow-xl dark:shadow-none overflow-hidden border-b-8 min-h-[450px] flex flex-col relative transition-all duration-300 ${isQuiz ? 'border-amber-100 dark:border-amber-900/30' : 'border-indigo-100 dark:border-white/5'}`}>
                        
                        {/* Step Title Header */}
                        <div className={`${isQuiz ? 'bg-amber-500 dark:bg-amber-700' : 'bg-indigo-600 dark:bg-adhd-primary'} p-6 text-white dark:text-slate-900 flex items-center gap-4 transition-colors`}>
                            <span className="text-4xl bg-white/20 w-12 h-12 flex items-center justify-center rounded-xl backdrop-blur-sm">
                                {currentStepData.icon || (session.currentStep + 1)}
                            </span>
                            <div className="flex-1">
                                <span className="text-xs font-bold uppercase opacity-80 mb-1 block">
                                    {isQuiz ? 'Interactive Checkpoint' : `Step ${session.currentStep + 1}`}
                                </span>
                                <h3 className="text-2xl font-display font-bold leading-tight">{currentStepData.title}</h3>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="p-8 flex-1 flex flex-col">
                            <div className="flex-1">
                                
                                {/* Generated Image Section */}
                                {!isQuiz && currentStepData.imagePrompt && (
                                    <div className="mb-6 flex justify-center">
                                        {isImageLoading ? (
                                            <div className="w-full h-48 bg-slate-100 dark:bg-white/5 rounded-xl flex flex-col items-center justify-center text-slate-400 dark:text-adhd-muted animate-pulse">
                                                <ImageIcon size={32} className="mb-2 opacity-50"/>
                                                <span className="text-xs font-medium">Drawing diagram...</span>
                                            </div>
                                        ) : currentImage ? (
                                            <img 
                                                src={currentImage} 
                                                alt="AI generated diagram" 
                                                className="w-full h-auto max-h-64 object-contain rounded-xl border border-slate-100 dark:border-white/10 shadow-sm bg-white dark:bg-white/5"
                                            />
                                        ) : null}
                                    </div>
                                )}

                                {isQuiz ? (
                                        <div className="animate-in fade-in slide-in-from-right-4">
                                            <p className="text-xl text-slate-800 dark:text-adhd-text font-bold mb-6">{currentStepData.question}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                {currentStepData.options && currentStepData.options.length > 0 ? (
                                                    currentStepData.options.map((option, idx) => {
                                                        const isSelected = selectedOption === idx;
                                                        const isCorrect = idx === currentStepData.correctOptionIndex;
                                                        
                                                        let btnClass = "border-2 border-slate-200 dark:border-white/10 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-adhd-text";
                                                        if (showQuizFeedback) {
                                                            if (isCorrect) btnClass = "border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300";
                                                            else if (isSelected && !isCorrect) btnClass = "border-2 border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 opacity-60";
                                                            else btnClass = "border-2 border-slate-100 dark:border-white/5 text-slate-400 dark:text-adhd-muted";
                                                        } else if (isSelected) {
                                                            btnClass = "border-2 border-indigo-600 dark:border-adhd-primary bg-indigo-50 dark:bg-adhd-primary/10 text-indigo-700 dark:text-adhd-primary";
                                                        }

                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handleOptionSelect(idx)}
                                                                disabled={showQuizFeedback && isCorrect} 
                                                                className={`p-4 rounded-xl text-left font-medium text-lg transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] ${btnClass}`}
                                                            >
                                                                {option}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-red-500 dark:text-red-400 p-4 border border-red-200 rounded-lg">
                                                        Error: Quiz options failed to load. Please skip this step.
                                                    </div>
                                                )}
                                            </div>
                                            {showQuizFeedback && !isQuizCorrect && (
                                                <div className="mt-4 flex items-center gap-2 text-red-500 font-medium animate-pulse">
                                                    <AlertCircle size={18} />
                                                    <span>Not quite. Try again!</span>
                                                </div>
                                            )}
                                            {showQuizFeedback && isQuizCorrect && (
                                                <div className="mt-4 flex items-center gap-2 text-emerald-600 dark:text-adhd-accent font-bold animate-in zoom-in">
                                                    <CheckCircle size={18} />
                                                    <span>Correct! You nailed it.</span>
                                                </div>
                                            )}
                                        </div>
                                ) : (
                                    <div className="animate-in fade-in slide-in-from-right-4">
                                        <p className="text-xl text-slate-700 dark:text-adhd-text leading-relaxed mb-6 font-medium">
                                            {currentStepData.explanation}
                                        </p>
                                        
                                        {/* Video Section with Validation */}
                                        {cleanVideoId && (
                                            <div className="mb-6 rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-white/10 bg-black aspect-video">
                                                <iframe
                                                    width="100%"
                                                    height="100%"
                                                    src={`https://www.youtube.com/embed/${cleanVideoId}`}
                                                    title="YouTube video player"
                                                    frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                    className="w-full h-full"
                                                ></iframe>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-3">
                                            {/* Example Toggle with Fallback */}
                                            {showExample ? (
                                                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-600 p-6 rounded-r-lg animate-in fade-in slide-in-from-bottom-2 w-full">
                                                    <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
                                                        <Sparkles size={18} className="text-amber-600 dark:text-amber-500" /> Example
                                                    </h4>
                                                    <p className="text-amber-900 dark:text-amber-200">
                                                        {currentStepData.example || "No specific example provided, but think about how this applies to your daily life!"}
                                                    </p>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setShowExample(true)}
                                                    className="text-indigo-600 dark:text-adhd-primary font-semibold flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-white/10 px-4 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 border border-indigo-100 dark:border-white/10"
                                                >
                                                    <HelpCircle size={18} />
                                                    Show me an example
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Controls */}
                        <div className="p-6 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <button 
                                onClick={prevStep}
                                disabled={session.currentStep === 0}
                                className="flex items-center gap-2 text-slate-500 dark:text-adhd-muted hover:text-slate-800 dark:hover:text-adhd-text disabled:opacity-30 disabled:hover:text-slate-500 font-semibold px-4 py-2 hover:-translate-x-1 transition-transform"
                            >
                                <ChevronLeft /> Previous
                            </button>

                            <button 
                                onClick={nextStep}
                                disabled={isQuiz && !isQuizCorrect}
                                className={`
                                    px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95 shadow-lg dark:shadow-none
                                    ${isQuiz && !isQuizCorrect 
                                        ? 'bg-slate-300 dark:bg-white/10 text-slate-500 dark:text-adhd-muted cursor-not-allowed shadow-none hover:translate-y-0 hover:brightness-100' 
                                        : 'bg-indigo-600 dark:bg-adhd-primary hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 text-white dark:text-slate-900 shadow-indigo-200'
                                    }
                                `}
                            >
                                {session.currentStep === session.steps.length - 1 ? 'Finish!' : 'Next Step'}
                                {session.currentStep === session.steps.length - 1 ? <CheckCircle size={20} /> : <ChevronRight size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  return (
      <div className="h-full w-full">
         {renderContent()}
      </div>
  );
};

export default StepMode;