import React from 'react';
import { AppMode, ChatMessage, StoredFile, SavedConcept, StepRecord, UserStats } from '../types';
import { MessageSquare, Layers, BookOpen, BookmarkPlus, ArrowRight, Calendar, Clock, CheckCircle2, PlayCircle, TrendingUp, BarChart3, Activity, Zap, Award } from 'lucide-react';

interface RecordModeProps {
  chatHistory: ChatMessage[];
  stepHistory: StepRecord[];
  files: StoredFile[];
  savedConcepts: SavedConcept[];
  stats: UserStats;
  onNavigate: (mode: AppMode, id?: string) => void;
}

const RecordMode: React.FC<RecordModeProps> = ({ chatHistory, stepHistory, files, savedConcepts, stats, onNavigate }) => {
  
  // Group Chat History by Root Topics
  const chatTopics = chatHistory
    .filter(m => m.parentId === null)
    .map(m => ({
        id: m.id,
        title: m.text,
        timestamp: m.timestamp,
        preview: chatHistory.find(child => child.parentId === m.id)?.text || "No response yet"
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // --- MOCK DATA FOR CHARTS ---
  const DAILY_GOAL_XP = 500;
  const todayProgress = Math.min(100, Math.round((stats.points / DAILY_GOAL_XP) * 100));
  
  // Generate last 7 days labels
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIndex = new Date().getDay();
  const last7Days = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return days[d.getDay()];
  });

  // Mock activity values (0-100), with the last one being based on current stats
  const weeklyActivity = [45, 60, 30, 75, 50, 20, Math.min(100, (stats.points / 200) * 100)];

  return (
    <div className="h-full bg-slate-50 dark:bg-adhd-bg p-4 md:p-8 overflow-y-auto transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
            <header className="mb-8">
                <h2 className="text-3xl font-display font-bold text-slate-800 dark:text-adhd-text mb-2">Learning Records</h2>
                <p className="text-slate-500 dark:text-adhd-muted">Track your progress across courses, readings, and conversations.</p>
            </header>

            {/* --- NEW PROGRESS TRACKER SECTION --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-in slide-in-from-bottom-4 duration-500">
                
                {/* 1. Today's Achievement (Circular Progress) */}
                <div className="bg-white dark:bg-adhd-surface rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-white/5 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Award size={80} className="text-indigo-500 dark:text-adhd-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2 mb-1">
                            <Activity size={18} className="text-indigo-500 dark:text-adhd-primary" /> Daily Goal
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-adhd-muted">XP gained today</p>
                    </div>

                    <div className="flex items-center justify-center py-4">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <svg className="w-full h-full" viewBox="0 0 128 128">
                                {/* Track */}
                                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-white/5" />
                                {/* Progress */}
                                <circle 
                                    cx="64" 
                                    cy="64" 
                                    r="56" 
                                    stroke="currentColor" 
                                    strokeWidth="8" 
                                    fill="transparent" 
                                    strokeDasharray={2 * Math.PI * 56} 
                                    strokeDashoffset={(2 * Math.PI * 56) * (1 - todayProgress / 100)} 
                                    strokeLinecap="round"
                                    className="text-indigo-500 dark:text-adhd-primary transition-all duration-1000 ease-out" 
                                    transform="rotate(-90 64 64)"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-3xl font-bold text-slate-800 dark:text-adhd-text leading-none">{todayProgress}%</span>
                                <span className="text-[10px] text-slate-400 uppercase font-bold mt-1">{stats.points}/{DAILY_GOAL_XP} XP</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-black/20 rounded-xl p-3">
                         <div className="text-center">
                             <div className="text-xs text-slate-400 uppercase font-bold mb-0.5">Streak</div>
                             <div className="flex items-center gap-1 justify-center font-bold text-amber-500">
                                 <Zap size={14} fill="currentColor" /> {stats.streak} Days
                             </div>
                         </div>
                         <div className="w-px h-8 bg-slate-200 dark:bg-white/10"></div>
                         <div className="text-center">
                             <div className="text-xs text-slate-400 uppercase font-bold mb-0.5">Focus</div>
                             <div className="font-bold text-emerald-500 dark:text-emerald-400">
                                 {Math.floor(stats.points / 10)} min
                             </div>
                         </div>
                    </div>
                </div>

                {/* 2. Weekly Report (Bar Chart) */}
                <div className="col-span-1 md:col-span-2 bg-white dark:bg-adhd-surface rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-white/5 flex flex-col">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2 mb-1">
                                <BarChart3 size={18} className="text-blue-500 dark:text-blue-400" /> Weekly Activity
                            </h3>
                            <p className="text-xs text-slate-400 dark:text-adhd-muted">Learning intensity over last 7 days</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                            <TrendingUp size={14} /> +12% vs last week
                        </div>
                     </div>

                     <div className="flex-1 flex items-end gap-3 md:gap-6 min-h-[140px] w-full px-2">
                        {weeklyActivity.map((value, idx) => {
                            const isToday = idx === 6;
                            // Dynamic height calculation
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                                     <div className="relative w-full h-full flex flex-col justify-end">
                                         {/* Tooltip */}
                                         <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                             {value} Activity
                                         </div>
                                         {/* Bar Background */}
                                         <div className="w-full bg-slate-100 dark:bg-white/5 rounded-t-lg h-[120px] relative overflow-hidden">
                                              {/* Bar Fill */}
                                              <div 
                                                style={{ height: `${value}%` }} 
                                                className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700 ease-out group-hover:brightness-110 
                                                    ${isToday ? 'bg-indigo-500 dark:bg-adhd-primary shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-slate-300 dark:bg-white/10'}`}
                                              ></div>
                                         </div>
                                     </div>
                                     <span className={`text-xs font-bold ${isToday ? 'text-indigo-600 dark:text-adhd-primary' : 'text-slate-400 dark:text-adhd-muted'}`}>
                                         {last7Days[idx]}
                                     </span>
                                </div>
                            );
                        })}
                     </div>
                </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* 1. Active Courses (Steps) */}
                <div className="col-span-1 lg:col-span-2 space-y-4">
                    <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2 mb-4">
                        <Layers className="text-indigo-500 dark:text-adhd-primary" /> Active Courses
                    </h3>
                    
                    {stepHistory.length === 0 ? (
                        <div className="bg-white dark:bg-adhd-surface p-6 rounded-xl border border-dashed border-slate-300 dark:border-white/10 text-center">
                            <p className="text-slate-400 dark:text-adhd-muted mb-2">No learning paths started yet.</p>
                            <button 
                                onClick={() => onNavigate(AppMode.STEPS)}
                                className="text-indigo-600 dark:text-adhd-primary font-bold hover:underline"
                            >
                                Start a new topic
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {stepHistory.map(record => {
                                const progress = Math.round((record.completedSteps / Math.max(1, record.totalSteps)) * 100);
                                return (
                                    <div 
                                        key={record.id}
                                        onClick={() => onNavigate(AppMode.STEPS, record.topic)}
                                        className="bg-white dark:bg-adhd-surface p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1 cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-bold text-lg text-slate-800 dark:text-adhd-text group-hover:text-indigo-600 dark:group-hover:text-adhd-primary transition-colors">
                                                    {record.topic}
                                                </h4>
                                                <p className="text-xs text-slate-400 dark:text-adhd-muted flex items-center gap-1 mt-1">
                                                    <Clock size={12} /> Last active: {formatDate(record.lastActive)}
                                                </p>
                                            </div>
                                            {record.status === 'completed' ? (
                                                <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> Done
                                                </span>
                                            ) : (
                                                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                                    <PlayCircle size={12} /> In Progress
                                                </span>
                                            )}
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="w-full bg-slate-100 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                                            <div 
                                                className="bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-adhd-primary dark:to-teal-400 h-full rounded-full transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-2 text-xs font-medium text-slate-500 dark:text-adhd-muted">
                                            <span>{record.completedSteps} / {record.totalSteps} steps</span>
                                            <span>{progress}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Library (Files) */}
                <div className="col-span-1 space-y-4">
                    <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2 mb-4">
                        <BookOpen className="text-blue-500 dark:text-blue-400" /> Library
                    </h3>
                    
                    <div className="bg-white dark:bg-adhd-surface rounded-xl border border-slate-100 dark:border-white/5 overflow-hidden">
                        {files.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 dark:text-adhd-muted text-sm">
                                No files uploaded.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-white/5">
                                {files.map(file => (
                                    <div 
                                        key={file.id}
                                        onClick={() => onNavigate(AppMode.FOCUS, file.content)}
                                        className="p-3 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
                                            <BookOpen size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 dark:text-adhd-text truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                                {file.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 dark:text-adhd-muted">
                                                {formatDate(file.timestamp)}
                                            </p>
                                        </div>
                                        <ArrowRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick Stats / Concepts */}
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-adhd-surface dark:to-adhd-sidebar rounded-xl p-5 text-white mt-6 shadow-lg">
                        <div className="flex items-center gap-2 mb-2 opacity-90">
                            <BookmarkPlus size={18} />
                            <span className="font-bold">Knowledge Bank</span>
                        </div>
                        <div className="text-3xl font-bold mb-1">{savedConcepts.length}</div>
                        <div className="text-sm opacity-80 mb-4">Concepts Saved</div>
                        <button 
                            onClick={() => onNavigate(AppMode.REVIEW)}
                            className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                            Review Now
                        </button>
                    </div>
                </div>

                {/* 3. Recent Chats */}
                <div className="col-span-1 lg:col-span-3">
                     <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2 mb-4 mt-4">
                        <MessageSquare className="text-emerald-500 dark:text-emerald-400" /> Recent Conversations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {chatTopics.slice(0, 6).map(chat => (
                            <div 
                                key={chat.id}
                                onClick={() => onNavigate(AppMode.CHAT, chat.id)}
                                className="bg-white dark:bg-adhd-surface p-4 rounded-xl border border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-adhd-primary/50 cursor-pointer transition-all hover:-translate-y-0.5 group"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="p-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                        <MessageSquare size={16} />
                                    </div>
                                    <span className="text-[10px] text-slate-400 dark:text-adhd-muted">{formatDate(chat.timestamp)}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 dark:text-adhd-text truncate mb-1 group-hover:text-indigo-600 dark:group-hover:text-adhd-primary">{chat.title}</h4>
                                <p className="text-xs text-slate-500 dark:text-adhd-muted line-clamp-2">{chat.preview}</p>
                            </div>
                        ))}
                         {chatTopics.length === 0 && (
                             <p className="text-slate-400 dark:text-adhd-muted text-sm col-span-full">No conversations yet.</p>
                         )}
                    </div>
                </div>

            </div>
        </div>
    </div>
  );
};

export default RecordMode;