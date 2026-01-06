import React, { useState, useEffect } from 'react';
import { AppMode } from '../types';
import { MessageSquare, Layers, BrainCircuit, Sparkles, ArrowRight, Search, Zap, BookOpen } from 'lucide-react';

interface HomeModeProps {
  onNavigate: (mode: AppMode, initialInput?: string) => void;
  userName?: string;
}

const HomeMode: React.FC<HomeModeProps> = ({ onNavigate, userName = "Friend" }) => {
  const [input, setInput] = useState('');
  const [greeting, setGreeting] = useState('Welcome back');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  const handleSmartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const text = input.trim().toLowerCase();
    const stepKeywords = ['learn', 'how to', 'plan', 'steps', 'break down', 'create', 'build', 'study', 'project', 'guide'];
    
    const isStepMode = stepKeywords.some(keyword => text.includes(keyword));

    if (isStepMode) {
        onNavigate(AppMode.STEPS, input);
    } else {
        onNavigate(AppMode.CHAT, input);
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden transition-colors duration-300 bg-slate-50 dark:bg-adhd-bg">
      
      {/* --- Aurora Background Layer --- */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep background color base */}
        <div className="absolute inset-0 bg-slate-50 dark:bg-[#0f172a]"></div>
        
        {/* Fluid Moving Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-300/30 dark:bg-purple-900/20 blur-[100px] animate-blob mix-blend-multiply dark:mix-blend-screen opacity-70"></div>
        <div className="absolute top-[10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-300/30 dark:bg-indigo-900/20 blur-[100px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen opacity-70"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-teal-300/30 dark:bg-teal-900/20 blur-[100px] animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen opacity-70"></div>
      </div>

      {/* --- Inline Styles for Custom Animations --- */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 10s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shine {
            from { transform: translateX(-100%); }
            to { transform: translateX(200%); }
        }
        .group:hover .animate-shine {
            animation: shine 1s ease-in-out;
        }
      `}</style>

      {/* --- Main Content --- */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-6 overflow-y-auto custom-scrollbar">
        
        {/* Branding Logo (Top Left) */}
        <div className="absolute top-6 left-6 md:top-8 md:left-10 flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="p-2.5 bg-indigo-600 dark:bg-white rounded-xl shadow-lg shadow-indigo-500/20 dark:shadow-none transform transition-transform hover:scale-110 hover:rotate-3 cursor-default">
                <BrainCircuit size={28} className="text-white dark:text-slate-900" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-2xl text-slate-800 dark:text-white tracking-tight cursor-default">
                FocusFlow AI
            </span>
        </div>

        {/* Hero Section */}
        <div className="w-full max-w-4xl text-center mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
             {/* Tagline Pill */}
             <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 backdrop-blur-md shadow-sm mb-8 text-sm font-semibold text-slate-600 dark:text-indigo-200/80 animate-in zoom-in duration-700 delay-100">
                <Sparkles size={14} className="text-amber-400 fill-amber-400" />
                <span>Your AI Focus Companion</span>
             </div>

            <h1 className="text-5xl md:text-7xl font-display font-bold text-slate-800 dark:text-white mb-6 tracking-tight drop-shadow-sm leading-tight">
                {greeting}, <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400">
                    {userName}
                </span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed font-light opacity-90">
                What do you want to achieve today?
            </p>
        </div>

        {/* Glassmorphic Smart Input */}
        <div className="w-full max-w-2xl mb-16 relative z-20 animate-in fade-in zoom-in-95 duration-700 delay-200">
            <form onSubmit={handleSmartSubmit} className="relative group">
                {/* Glow Behind */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500 rounded-3xl blur-xl opacity-30 group-hover:opacity-60 transition-opacity duration-500"></div>
                
                {/* Input Container */}
                <div className="relative flex items-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-2 shadow-2xl transition-all duration-300 group-hover:scale-[1.01] group-hover:bg-white/80 dark:group-hover:bg-slate-900/80">
                    <div className="pl-4 pr-2 text-slate-400 dark:text-slate-500">
                        <Search size={26} />
                    </div>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type 'How to start a garden' or 'Explain entropy'..."
                        className="flex-1 bg-transparent border-none outline-none px-2 py-4 text-lg text-slate-800 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 font-medium"
                        autoFocus
                    />
                    <button 
                        type="submit"
                        disabled={!input.trim()}
                        className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 p-4 rounded-2xl disabled:opacity-0 disabled:scale-75 opacity-100 scale-100 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                    >
                        <ArrowRight size={20} strokeWidth={3} />
                    </button>
                </div>
            </form>
            <div className="mt-4 flex justify-center gap-3 opacity-60">
                 <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    AI automatically detects if you need a Chat or a Step-by-Step guide.
                 </p>
            </div>
        </div>

        {/* Glassmorphic Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-5xl animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
            {[
                { 
                    mode: AppMode.CHAT, 
                    title: "The Clarifier", 
                    desc: "Interactive Q&A & explanations.", 
                    icon: MessageSquare, 
                    color: "bg-blue-500", 
                    gradient: "from-blue-500/20 to-cyan-500/20" 
                },
                { 
                    mode: AppMode.STEPS, 
                    title: "Chunking Engine", 
                    desc: "Break down complex tasks.", 
                    icon: Layers, 
                    color: "bg-emerald-500", 
                    gradient: "from-emerald-500/20 to-teal-500/20" 
                },
                { 
                    mode: AppMode.FOCUS, 
                    title: "Deep Reader", 
                    desc: "Distraction-free study mode.", 
                    icon: BookOpen, 
                    color: "bg-violet-500", 
                    gradient: "from-violet-500/20 to-fuchsia-500/20" 
                },
                { 
                    mode: AppMode.REVIEW, 
                    title: "Connector", 
                    desc: "Visualize & Review concepts.", 
                    icon: BrainCircuit, 
                    color: "bg-amber-500", 
                    gradient: "from-amber-500/20 to-orange-500/20" 
                },
            ].map((item, idx) => (
                <button
                    key={idx}
                    onClick={() => onNavigate(item.mode)}
                    className="group relative overflow-hidden rounded-[2rem] p-6 text-left transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl border border-white/40 dark:border-white/5 bg-white/40 dark:bg-white/5 backdrop-blur-md"
                >
                    {/* Hover Gradient Overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                    
                    {/* Shine Effect Element */}
                    <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 opacity-0 group-hover:opacity-100 animate-shine pointer-events-none"></div>

                    <div className="relative z-20 flex items-start gap-5">
                        <div className={`p-4 rounded-2xl ${item.color} text-white shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 ease-out`}>
                            <item.icon size={28} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                                {item.title}
                            </h3>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                                {item.desc}
                            </p>
                        </div>
                        <div className="ml-auto self-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 ease-out">
                             <ArrowRight size={24} className="text-slate-400 dark:text-white/70" />
                        </div>
                    </div>
                </button>
            ))}
        </div>

      </div>
    </div>
  );
};

export default HomeMode;