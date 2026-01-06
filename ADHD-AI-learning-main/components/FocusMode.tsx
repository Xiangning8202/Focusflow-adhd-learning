import React, { useState, useEffect, useRef, useMemo } from 'react';
import { askContextQuestion } from '../services/geminiService';
import { StoredFile } from '../types';
import { Highlighter, BookOpen, X, Loader2, Type, Palette, StickyNote, MessageCircle, Trash2, PanelRightOpen, PanelRightClose, Copy, Check, BrainCircuit, ScanLine, Zap, BookmarkPlus, Upload, FileText, FolderOpen, PanelLeftClose, PanelLeftOpen, File, Play, Pause, Square, Headphones, FolderPlus, Folder, FolderInput, ChevronDown, ChevronRight, Maximize, Minimize, MoveHorizontal } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF Worker with the matching version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.min.js`;

interface FocusModeProps {
  initialText?: string;
  files: StoredFile[];
  onUpdateFiles: (files: StoredFile[]) => void;
  onAskInChat: (text: string) => void;
  onAddToReview: (text: string) => void;
  onSaveConcept?: (text: string, source: 'chat' | 'focus') => void;
  onTriggerScratchpad?: () => void;
}

type FontFamily = 'sans' | 'serif' | 'mono';
type ColorTheme = 'white' | 'warm' | 'cool' | 'dark';
type WidthSetting = 'narrow' | 'standard' | 'wide' | 'full';

interface Note {
  id: string;
  text: string;
  timestamp: number;
}

const FocusMode: React.FC<FocusModeProps> = ({ initialText = '', files, onUpdateFiles, onAskInChat, onAddToReview, onSaveConcept, onTriggerScratchpad }) => {
  const [text, setText] = useState(initialText);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState({ top: 0, left: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [popupContent, setPopupContent] = useState<{ type: 'explanation' | 'loading', text: string } | null>(null);
  
  // File Handling
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Customization State
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif');
  const [theme, setTheme] = useState<ColorTheme>('white');
  const [widthSetting, setWidthSetting] = useState<WidthSetting>('wide');

  // Panels State
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Review Added State
  const [addedToReview, setAddedToReview] = useState(false);
  const [conceptSaved, setConceptSaved] = useState(false);

  // Reading Ruler State
  const [rulerEnabled, setRulerEnabled] = useState(false);
  const [mouseY, setMouseY] = useState(0);

  // TTS State
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingIndex, setReadingIndex] = useState(-1);
  const [readingLength, setReadingLength] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initialText prop to state if it changes (e.g. from Record Mode)
  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  // Load Voices for TTS
  useEffect(() => {
      const load = () => {
          setVoices(window.speechSynthesis.getVoices());
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // Monitor fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  };

  // Clean up speech on unmount
  useEffect(() => {
      return () => {
          if (utteranceRef.current) {
              window.speechSynthesis.cancel();
          }
      };
  }, []);

  // --- Group Files by Category ---
  const groupedFiles = useMemo(() => {
      const groups: Record<string, StoredFile[]> = {};
      files.forEach(file => {
          const cat = file.category || 'Uncategorized';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(file);
      });
      // Ensure Uncategorized is always there if we have files, or handle sorting
      return Object.entries(groups).sort((a, b) => {
          if (a[0] === 'Uncategorized') return 1; // Put Uncategorized last
          if (b[0] === 'Uncategorized') return -1;
          return a[0].localeCompare(b[0]);
      });
  }, [files]);

  const toggleCategory = (cat: string) => {
      const newSet = new Set(collapsedCategories);
      if (newSet.has(cat)) newSet.delete(cat);
      else newSet.add(cat);
      setCollapsedCategories(newSet);
  };

  const handleCreateCategory = () => {
      const name = prompt("Enter new collection name:");
      if (name) {
          // We don't have empty folders in this simple data model, 
          // so we prompt to create one by moving the CURRENT open file or just wait.
          // Better UX: Show it in the 'move' list later.
          // For now, let's just alert user how to use it.
          alert(`To add files to "${name}", click the folder icon on any file and select "Move to..."`);
      }
  };

  const handleMoveFile = (e: React.MouseEvent, fileId: string) => {
      e.stopPropagation();
      const cat = prompt("Enter collection name to move this file to:");
      if (cat !== null) { // If empty string, it's valid (Uncategorized if we treat empty as such, or new name)
          const newCat = cat.trim() === "" ? undefined : cat.trim();
          const updatedFiles = files.map(f => f.id === fileId ? { ...f, category: newCat } : f);
          onUpdateFiles(updatedFiles);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (rulerEnabled) {
          setMouseY(e.clientY);
      }
  };

  const handleTextSelect = () => {
    // If reading, don't show select menu to avoid conflict
    if (isReading) return;

    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
      setShowMenu(false);
      setConceptSaved(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setSelectedText(selection.toString());
    setSelectionPos({
      top: rect.top - 60 + window.scrollY, // Position above text
      left: rect.left + (rect.width / 2) - 100 // Center
    });
    setShowMenu(true);
    setPopupContent(null);
  };

  const handleAsk = async (type: 'explain' | 'summarize') => {
    setPopupContent({ type: 'loading', text: '' });
    
    const prompt = type === 'explain' 
      ? `Explain "${selectedText}" simply.` 
      : `Summarize this context: "${selectedText}"`;

    try {
      const answer = await askContextQuestion(text, prompt);
      setPopupContent({ type: 'explanation', text: answer });
    } catch (e) {
      setPopupContent({ type: 'explanation', text: "Sorry, I couldn't process that right now." });
    }
  };

  const addToNotes = () => {
      const newNote: Note = {
          id: crypto.randomUUID(),
          text: selectedText,
          timestamp: Date.now()
      };
      setNotes(prev => [...prev, newNote]);
      setShowMenu(false);
      setShowNotesPanel(true);
      window.getSelection()?.removeAllRanges();
  };

  const handleSaveConceptClick = () => {
      if (onSaveConcept) {
          onSaveConcept(selectedText, 'focus');
          setConceptSaved(true);
          setTimeout(() => {
              setShowMenu(false);
              setConceptSaved(false);
              window.getSelection()?.removeAllRanges();
          }, 1000);
      }
  };

  const startChatQuery = () => {
      onAskInChat(selectedText);
  };

  const copyAllNotes = () => {
      const allText = notes.map(n => `- ${n.text}`).join('\n');
      navigator.clipboard.writeText(allText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleAddToReviewClick = () => {
      if (!text.trim()) return;
      onAddToReview(text);
      setAddedToReview(true);
      setTimeout(() => setAddedToReview(false), 2000);
  };

  // --- TTS Logic ---
  const toggleReadAloud = () => {
      if (isReading && !isPaused) {
          window.speechSynthesis.pause();
          setIsPaused(true);
      } else if (isReading && isPaused) {
          window.speechSynthesis.resume();
          setIsPaused(false);
      } else {
          startReading();
      }
  };

  const stopReading = () => {
      window.speechSynthesis.cancel();
      setIsReading(false);
      setIsPaused(false);
      setReadingIndex(-1);
      setReadingLength(0);
  };

  const startReading = () => {
      if (!text.trim()) return;
      
      window.speechSynthesis.cancel(); // Clear previous
      
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      
      // Select English Voice
      // Prioritize "Google US English", then any "en-US", then any English
      const englishVoice = voices.find(v => v.name.includes("Google US English")) 
                        || voices.find(v => v.lang === "en-US")
                        || voices.find(v => v.lang.startsWith("en"));

      if (englishVoice) {
          utterance.voice = englishVoice;
          console.log("Using voice:", englishVoice.name);
      } else {
          console.warn("No English voice found, using default.");
      }

      utterance.lang = 'en-US'; // Strict fallback
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => {
          setIsReading(true);
          setIsPaused(false);
      };

      utterance.onend = () => {
          setIsReading(false);
          setIsPaused(false);
          setReadingIndex(-1);
          setReadingLength(0);
      };

      utterance.onboundary = (event) => {
          if (event.name === 'word' || event.name === 'sentence') {
              setReadingIndex(event.charIndex);
              setReadingLength(event.charLength || 5); 
          }
      };

      window.speechSynthesis.speak(utterance);
  };

  // --- File Processing Logic ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setIsProcessing(true);
      const file = e.target.files[0];
      const fileType = file.name.split('.').pop()?.toLowerCase();
      
      try {
          let extractedText = "";
          let type: StoredFile['type'] = 'raw';

          if (fileType === 'pdf') {
              type = 'pdf';
              const arrayBuffer = await file.arrayBuffer();
              const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
              const pdf = await loadingTask.promise;
              
              const numPages = pdf.numPages;
              const textParts = [];
              
              for (let i = 1; i <= numPages; i++) {
                  const page = await pdf.getPage(i);
                  const content = await page.getTextContent();
                  
                  const items = (content.items as any[]).sort((a, b) => {
                      const yDiff = Math.abs(a.transform[5] - b.transform[5]);
                      if (yDiff > 4) { // Threshold for "same line"
                          return b.transform[5] - a.transform[5];
                      }
                      return a.transform[4] - b.transform[4];
                  });

                  let lastY = -1;
                  let lastX = -1;
                  let lastWidth = 0;
                  let pageText = "";

                  for (const item of items) {
                      const currentY = item.transform[5];
                      const currentX = item.transform[4];
                      const fontSize = item.transform[0]; 

                      if (lastY !== -1) {
                           const dy = lastY - currentY; 
                           
                           if (dy > fontSize * 0.5) { 
                                if (dy > fontSize * 1.5) {
                                    pageText += "\n\n";
                                } else {
                                    if (!pageText.endsWith(" ")) pageText += " ";
                                }
                           } else {
                                const dx = currentX - (lastX + lastWidth);
                                if (dx > fontSize * 0.2 && !pageText.endsWith(" ")) {
                                    pageText += " ";
                                }
                           }
                      }
                      
                      pageText += item.str;
                      lastY = currentY;
                      lastX = currentX;
                      lastWidth = item.width;
                  }
                  textParts.push(pageText);
              }
              extractedText = textParts.join('\n\n');

          } else if (fileType === 'docx') {
              type = 'docx';
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              extractedText = result.value;

          } else if (fileType === 'txt') {
              type = 'txt';
              extractedText = await file.text();
          } else {
              alert("Unsupported file type. Please upload PDF, Word, or TXT.");
              setIsProcessing(false);
              return;
          }

          if (extractedText.trim()) {
              const newFile: StoredFile = {
                  id: crypto.randomUUID(),
                  name: file.name,
                  content: extractedText,
                  type: type,
                  category: 'Uncategorized',
                  timestamp: Date.now()
              };
              
              onUpdateFiles([newFile, ...files]);
              setText(extractedText);
              setShowFilePanel(true); // Open panel to show list
          } else {
              alert("Could not extract text from this file.");
          }

      } catch (error) {
          console.error("File processing failed:", error);
          alert("Error processing file. Please try another.");
      } finally {
          setIsProcessing(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const loadFile = (file: StoredFile) => {
      setText(file.content);
      stopReading(); // Stop previous reading if any
  };

  const deleteFile = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const updated = files.filter(f => f.id !== id);
      onUpdateFiles(updated);
      if (updated.length === 0) setText(''); // If deleting last file, clear text
  };

  // --- Styling Helpers ---

  const getFontClass = () => {
    switch (fontFamily) {
      case 'sans': return 'font-sans';
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      default: return 'font-serif';
    }
  };

  const getThemeClasses = () => {
    switch (theme) {
      case 'warm': return 'bg-[#fdf6e3] text-[#433422]'; 
      case 'cool': return 'bg-[#f0f9ff] text-[#334155]';
      case 'dark': return 'bg-[#1e293b] text-[#e2e8f0]'; 
      default: return 'bg-white text-slate-800';
    }
  };

  const getProseClass = () => {
      return theme === 'dark' ? 'prose-invert' : 'prose-slate';
  };

  const getWidthClass = () => {
    switch (widthSetting) {
      case 'narrow': return 'max-w-xl';
      case 'standard': return 'max-w-3xl';
      case 'wide': return 'max-w-5xl';
      case 'full': return 'max-w-full px-4 md:px-12';
      default: return 'max-w-3xl';
    }
  };

  // --- Render with Highlighting ---
  const renderTextWithHighlights = () => {
      let currentIndex = 0;
      return text.split('\n').map((para, i) => {
          const paraLength = para.length;
          const paraStart = currentIndex;
          const paraEnd = currentIndex + paraLength;
          
          currentIndex += paraLength + 1;

          if (isReading && readingIndex >= paraStart && readingIndex < paraEnd) {
              const localIndex = readingIndex - paraStart;
              let highlightEnd = localIndex + (readingLength || 5);
              if (highlightEnd > paraLength) highlightEnd = paraLength;
              
              const nextSpace = para.indexOf(' ', localIndex);
              if (nextSpace !== -1 && nextSpace < highlightEnd + 10) {
                  highlightEnd = nextSpace;
              }

              const before = para.slice(0, localIndex);
              const highlight = para.slice(localIndex, highlightEnd);
              const after = para.slice(highlightEnd);

              return (
                  <p key={i} className="mb-6 relative">
                      {before}
                      <span className="bg-yellow-300 dark:bg-yellow-600/50 text-black dark:text-white rounded px-0.5 shadow-sm transition-colors duration-100">
                          {highlight}
                      </span>
                      {after}
                  </p>
              );
          }
          
          return <p key={i} className="mb-6">{para}</p>;
      });
  };

  return (
    <div ref={containerRef} className="h-full bg-[#f8f9fa] dark:bg-adhd-bg overflow-hidden relative flex transition-colors duration-300">
      
      <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.docx,.txt" 
          onChange={handleFileUpload} 
      />

      {rulerEnabled && !isReading && (
          <div 
            className="fixed left-0 right-0 h-12 bg-yellow-300/20 pointer-events-none z-10 mix-blend-multiply border-y border-yellow-400/30 transition-none"
            style={{ top: mouseY - 24 }} // Center on cursor
          />
      )}

      {/* Left Sidebar: Library/Files with Collections */}
      <div 
        className={`bg-slate-50 dark:bg-adhd-sidebar border-r border-slate-200 dark:border-white/5 shadow-xl flex flex-col z-20 transition-all duration-300 ease-in-out overflow-hidden ${showFilePanel ? 'w-72 opacity-100' : 'w-0 opacity-0'}`}
      >
          <div className="w-72 flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-white dark:bg-white/5">
                <h3 className="font-bold text-slate-700 dark:text-adhd-text flex items-center gap-2">
                    <FolderOpen size={18} /> Library
                </h3>
                <div className="flex gap-1">
                    <button onClick={handleCreateCategory} className="text-indigo-500 hover:text-indigo-600 dark:hover:text-adhd-primary" title="New Collection">
                        <FolderPlus size={18} />
                    </button>
                    <button onClick={() => setShowFilePanel(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text"><PanelLeftClose size={18} /></button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {files.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 dark:text-adhd-muted">
                        <p className="text-xs italic">No files loaded yet.</p>
                    </div>
                ) : (
                    groupedFiles.map(([category, categoryFiles]) => (
                        <div key={category} className="mb-2">
                            {/* Category Header */}
                            <div 
                                onClick={() => toggleCategory(category)}
                                className="flex items-center gap-2 p-2 text-xs font-bold text-slate-500 dark:text-adhd-muted uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg select-none"
                            >
                                {collapsedCategories.has(category) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                                <Folder size={14} className="text-indigo-400 dark:text-adhd-primary/70" />
                                <span className="flex-1 truncate">{category}</span>
                                <span className="bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{categoryFiles.length}</span>
                            </div>

                            {/* Files List */}
                            {!collapsedCategories.has(category) && (
                                <div className="ml-2 pl-2 border-l border-slate-200 dark:border-white/5 space-y-1 mt-1">
                                    {categoryFiles.map(file => (
                                        <div 
                                            key={file.id} 
                                            onClick={() => loadFile(file)}
                                            className={`p-2 rounded-lg border cursor-pointer group flex items-center gap-2 transition-all hover:shadow-sm ${text === file.content ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-500/30' : 'bg-white border-slate-200 dark:bg-adhd-surface dark:border-white/5 hover:border-indigo-200'}`}
                                        >
                                            <div className="text-indigo-500 dark:text-adhd-primary">
                                                {file.type === 'pdf' ? <FileText size={16} /> : file.type === 'docx' ? <FileText size={16} className="text-blue-500" /> : <File size={16} />}
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className={`text-xs font-medium truncate ${text === file.content ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-adhd-text'}`}>
                                                    {file.name}
                                                </p>
                                            </div>
                                            
                                            {/* File Actions */}
                                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={(e) => handleMoveFile(e, file.id)}
                                                    className="text-slate-400 hover:text-indigo-500 p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
                                                    title="Move to Collection"
                                                >
                                                    <FolderInput size={12} />
                                                </button>
                                                <button 
                                                    onClick={(e) => deleteFile(e, file.id)} 
                                                    className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5">
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 py-2.5 rounded-lg font-bold hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Upload File
                </button>
                <p className="text-[10px] text-slate-400 dark:text-adhd-muted text-center mt-2">Supports PDF, DOCX, TXT</p>
            </div>
          </div>
      </div>

      {/* Main Reading Area */}
      <div 
        className="flex-1 overflow-y-auto relative h-full transition-all duration-300 scroll-smooth" 
        onMouseUp={handleTextSelect}
        onMouseMove={handleMouseMove}
      >
        <div 
            className={`${getWidthClass()} mx-auto py-12 px-8 min-h-full shadow-sm my-8 relative rounded-xl transition-all duration-300 ${getThemeClasses()}`}
        >
            
            {/* Appearance & TTS Controls */}
            {text && (
                <div className="absolute top-4 right-4 flex flex-col lg:flex-row gap-2 items-end lg:items-center z-20 print:hidden">
                    
                    {/* Fullscreen Toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className={`p-1.5 rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1.5 px-2 bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:text-adhd-text dark:border-white/10`}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>

                    {/* Library Toggle */}
                    <button
                        onClick={() => setShowFilePanel(!showFilePanel)}
                        className={`p-1.5 rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1.5 px-2 ${showFilePanel ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        title="Toggle Library"
                    >
                         {showFilePanel ? <PanelLeftClose size={16} /> : <FolderOpen size={16} />}
                    </button>

                    {/* TTS Player Controls */}
                    <div className="flex items-center gap-1 bg-white/90 backdrop-blur p-1 rounded-lg border border-slate-200 shadow-sm">
                         <button 
                            onClick={toggleReadAloud}
                            className={`p-1.5 rounded-md transition-colors ${isReading && !isPaused ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-700'}`}
                            title={isReading && !isPaused ? "Pause" : "Listen to Text (English)"}
                         >
                             {isReading && !isPaused ? <Pause size={16} /> : <Play size={16} />}
                         </button>
                         {isReading && (
                             <button 
                                onClick={stopReading}
                                className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                                title="Stop Reading"
                             >
                                 <Square size={14} fill="currentColor" />
                             </button>
                         )}
                    </div>

                    {/* Reading Ruler Toggle */}
                    <button
                        onClick={() => setRulerEnabled(!rulerEnabled)}
                        className={`p-1.5 rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1.5 px-2 ${rulerEnabled ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        title="Toggle Reading Ruler"
                    >
                        <ScanLine size={16} />
                    </button>

                    {/* Brain Dump Trigger */}
                    <button
                        onClick={onTriggerScratchpad}
                        className="p-1.5 rounded-lg border border-slate-200 shadow-sm bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all duration-200 hover:-translate-y-0.5"
                        title="Brain Dump (Ctrl+B) - Log distractions"
                    >
                        <Zap size={16} />
                    </button>

                    {/* Add to Review Button */}
                    <button
                        onClick={handleAddToReviewClick}
                        className={`p-1.5 rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1.5 px-2 ${addedToReview ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        title="Add text to Review Mode generator"
                    >
                        {addedToReview ? <Check size={16} /> : <BrainCircuit size={16} />}
                        <span className="text-xs font-bold hidden md:inline">Review</span>
                    </button>

                    {/* Font & Theme & Width Toggles */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Width Controls */}
                        <div className="flex items-center gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-sm">
                            <MoveHorizontal size={14} className="text-slate-400 ml-1 mr-2" />
                            <button 
                                onClick={() => setWidthSetting('narrow')}
                                className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${widthSetting === 'narrow' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                title="Narrow Width"
                            >
                                S
                            </button>
                            <button 
                                onClick={() => setWidthSetting('standard')}
                                className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${widthSetting === 'standard' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                title="Standard Width"
                            >
                                M
                            </button>
                            <button 
                                onClick={() => setWidthSetting('wide')}
                                className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${widthSetting === 'wide' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                title="Wide Width"
                            >
                                L
                            </button>
                             <button 
                                onClick={() => setWidthSetting('full')}
                                className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${widthSetting === 'full' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                title="Full Width"
                            >
                                XL
                            </button>
                        </div>

                        {/* Font Family Controls */}
                        <div className="flex items-center gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-sm">
                            <Type size={14} className="text-slate-400 ml-1 mr-2" />
                            <button 
                                onClick={() => setFontFamily('sans')}
                                className={`px-2 py-1 rounded text-xs font-sans hover:bg-slate-100 transition-colors ${fontFamily === 'sans' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500'}`}
                            >
                                Sans
                            </button>
                            <button 
                                onClick={() => setFontFamily('serif')}
                                className={`px-2 py-1 rounded text-xs font-serif hover:bg-slate-100 transition-colors ${fontFamily === 'serif' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500'}`}
                            >
                                Serif
                            </button>
                            <button 
                                onClick={() => setFontFamily('mono')}
                                className={`px-2 py-1 rounded text-xs font-mono hover:bg-slate-100 transition-colors ${fontFamily === 'mono' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500'}`}
                            >
                                Mono
                            </button>
                        </div>

                        {/* Theme Controls */}
                        <div className="flex items-center gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-sm">
                            <Palette size={14} className="text-slate-400 ml-1 mr-2" />
                            <button 
                                onClick={() => setTheme('white')} 
                                className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-125 hover:shadow-md ${theme === 'white' ? 'ring-2 ring-indigo-400 ring-offset-1' : 'border-slate-200'}`}
                                style={{ backgroundColor: '#ffffff' }}
                                title="White"
                            />
                            <button 
                                onClick={() => setTheme('warm')} 
                                className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-125 hover:shadow-md ${theme === 'warm' ? 'ring-2 ring-indigo-400 ring-offset-1' : 'border-amber-100'}`}
                                style={{ backgroundColor: '#fdf6e3' }}
                                title="Warm"
                            />
                            <button 
                                onClick={() => setTheme('cool')} 
                                className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-125 hover:shadow-md ${theme === 'cool' ? 'ring-2 ring-indigo-400 ring-offset-1' : 'border-blue-100'}`}
                                style={{ backgroundColor: '#f0f9ff' }}
                                title="Cool"
                            />
                            <button 
                                onClick={() => setTheme('dark')} 
                                className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-125 hover:shadow-md ${theme === 'dark' ? 'ring-2 ring-indigo-400 ring-offset-1' : 'border-slate-600'}`}
                                style={{ backgroundColor: '#1e293b' }}
                                title="Dark"
                            />
                        </div>
                    </div>

                    {/* Notes Toggle */}
                    <button 
                        onClick={() => setShowNotesPanel(!showNotesPanel)}
                        className={`p-2 rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-0.5 ${showNotesPanel ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        title="Toggle Notes"
                    >
                         {showNotesPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                    </button>
                </div>
            )}

            {!text ? (
            <div className="flex flex-col items-center justify-center text-slate-400 dark:text-adhd-muted min-h-[50vh] transition-colors gap-8">
                {/* Upload Zone */}
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        w-full max-w-lg border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                        ${isProcessing ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-adhd-primary hover:bg-slate-50 dark:hover:bg-white/5'}
                    `}
                >
                    {isProcessing ? (
                        <>
                            <Loader2 size={48} className="text-indigo-500 dark:text-adhd-primary animate-spin mb-4" />
                            <p className="font-bold text-slate-600 dark:text-adhd-text">Processing Document...</p>
                            <p className="text-sm text-slate-400">Extracting text, please wait.</p>
                        </>
                    ) : (
                        <>
                            <div className="bg-indigo-100 dark:bg-adhd-primary/20 p-4 rounded-full mb-4">
                                <Upload size={32} className="text-indigo-600 dark:text-adhd-primary" />
                            </div>
                            <h3 className="text-xl font-display font-bold text-slate-700 dark:text-adhd-text mb-2">Upload Document</h3>
                            <p className="text-sm text-center mb-1">Click to select PDF or Word files</p>
                            <p className="text-xs text-slate-300 dark:text-adhd-muted">Maximum file size: 10MB</p>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4 w-full max-w-lg">
                    <div className="h-px bg-slate-200 dark:bg-white/10 flex-1"></div>
                    <span className="text-xs font-bold uppercase text-slate-300 dark:text-adhd-muted">OR</span>
                    <div className="h-px bg-slate-200 dark:bg-white/10 flex-1"></div>
                </div>

                {/* Manual Text Input */}
                <div className="w-full max-w-lg">
                    <p className="mb-2 text-sm font-bold text-slate-500 dark:text-adhd-muted flex items-center gap-2">
                        <FileText size={16} /> Paste Text Directly
                    </p>
                    <textarea 
                        className="w-full p-4 border border-slate-300 dark:border-white/10 dark:bg-adhd-surface dark:text-adhd-text rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none text-slate-900 transition-colors shadow-sm"
                        rows={4}
                        placeholder="Paste article, email, or notes here..."
                        onBlur={(e) => setText(e.target.value)}
                    />
                </div>
            </div>
            ) : (
                <div className={`prose prose-lg mx-auto leading-loose mt-8 ${getFontClass()} ${getProseClass()}`}>
                    {renderTextWithHighlights()}
                </div>
            )}
        </div>
      </div>

      {/* Collapsible Notes Sidebar */}
      <div 
        className={`bg-white dark:bg-adhd-sidebar border-l border-slate-200 dark:border-white/5 shadow-xl flex flex-col z-20 transition-all duration-300 ease-in-out overflow-hidden ${showNotesPanel ? 'w-80 opacity-100' : 'w-0 opacity-0'}`}
      >
          <div className="w-80 flex flex-col h-full"> {/* Inner fixed width container */}
            <div className="p-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-700 dark:text-adhd-text">Study Notes</h3>
                    <div className="flex items-center gap-1">
                        {notes.length > 0 && (
                            <button 
                                onClick={copyAllNotes} 
                                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-white/10 transition-colors hover:scale-110"
                                title="Copy notes"
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        )}
                        <button onClick={() => setShowNotesPanel(false)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text rounded-md hover:bg-slate-200 dark:hover:bg-white/10 hover:rotate-90 transition-transform">
                            <X size={18} />
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-adhd-bg">
                {notes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-adhd-muted text-center px-4">
                        <StickyNote size={32} className="mb-2 opacity-30" />
                        <p className="text-sm italic">Highlight text to add study notes.</p>
                    </div>
                ) : (
                    notes.map((note) => (
                        <div 
                            key={note.id} 
                            className="p-4 rounded-lg border shadow-sm relative group animate-in slide-in-from-right-2 fade-in duration-300 bg-yellow-50 dark:bg-adhd-surface border-yellow-200 dark:border-white/5 hover:-translate-y-0.5 transition-transform"
                        >
                            <p className="text-sm text-slate-800 dark:text-adhd-text font-medium font-handwriting leading-relaxed">
                                {note.text}
                            </p>
                            <span className="text-[10px] text-slate-400 dark:text-adhd-muted mt-2 block">
                                {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button 
                            onClick={() => setNotes(notes.filter(n => n.id !== note.id))}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 bg-white/50 dark:bg-black/50 p-1 rounded-full hover:scale-110"
                            title="Delete"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
          </div>
      </div>

      {/* Floating Action Menu */}
      {showMenu && (
        <div 
            className="fixed bg-slate-900 dark:bg-adhd-surface text-white dark:text-adhd-text rounded-lg shadow-xl p-2 flex gap-2 z-50 transition-opacity animate-in zoom-in-95 duration-200 border dark:border-white/10"
            style={{ top: selectionPos.top, left: selectionPos.left }}
        >
            {popupContent ? (
                <div className="max-w-xs p-2">
                    <div className="flex justify-between items-start mb-2">
                         <span className="text-xs font-bold text-indigo-300 dark:text-adhd-primary uppercase">AI Help</span>
                         <button onClick={() => {setShowMenu(false); setPopupContent(null);}}><X size={14}/></button>
                    </div>
                    {popupContent.type === 'loading' ? (
                        <Loader2 className="animate-spin mx-auto text-slate-400" size={20} />
                    ) : (
                        <p className="text-sm leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">{popupContent.text}</p>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => handleSaveConceptClick()}
                        className={`flex items-center gap-1 hover:bg-slate-700 dark:hover:bg-white/10 px-3 py-1.5 rounded-md text-sm font-medium border-r border-slate-700 dark:border-white/10 pr-3 mr-1 transition-all duration-200 hover:-translate-y-0.5 ${conceptSaved ? 'text-emerald-400 dark:text-adhd-accent' : 'text-yellow-400 dark:text-adhd-primary'}`}
                        title="Save as Concept Card for Review"
                    >
                        {conceptSaved ? <Check size={14} /> : <BookmarkPlus size={14} />}
                        {conceptSaved ? "Saved" : "Save Concept"}
                    </button>
                    <button 
                        onClick={() => addToNotes()}
                        className="flex items-center gap-1 hover:bg-slate-700 dark:hover:bg-white/10 px-3 py-1.5 rounded-md text-sm font-medium border-r border-slate-700 dark:border-white/10 pr-3 mr-1 transition-all duration-200 hover:-translate-y-0.5"
                        title="Add to Notes"
                    >
                        <StickyNote size={14} className="text-slate-300" /> Note
                    </button>
                    <button 
                        onClick={() => startChatQuery()}
                        className="flex items-center gap-1 hover:bg-slate-700 dark:hover:bg-white/10 px-3 py-1.5 rounded-md text-sm font-medium border-r border-slate-700 dark:border-white/10 pr-3 mr-1 transition-all duration-200 hover:-translate-y-0.5"
                        title="Ask AI in Chat"
                    >
                        <MessageCircle size={14} className="text-blue-400 dark:text-adhd-primary" /> Chat
                    </button>
                    <button 
                        onClick={() => handleAsk('explain')}
                        className="flex items-center gap-1 hover:bg-slate-700 dark:hover:bg-white/10 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <Highlighter size={14} /> Explain
                    </button>
                    <button 
                        onClick={() => handleAsk('summarize')}
                         className="flex items-center gap-1 hover:bg-slate-700 dark:hover:bg-white/10 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <BookOpen size={14} /> Simplify
                    </button>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default FocusMode;