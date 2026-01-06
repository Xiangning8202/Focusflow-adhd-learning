import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ChatMessage } from '../types';
import { streamChatResponse } from '../services/geminiService';
import { Send, MessageSquare, ChevronRight, ChevronDown, Sparkles, Layers, FileText, BookmarkPlus, Check, Hash, Network, X, CornerDownRight, Plus, Minus, User, Bot, Maximize, Minimize, Target } from 'lucide-react';
import { GenerateContentResponse } from '@google/genai';

interface ChatModeProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentChatId: string | null;
  setCurrentChatId: (id: string) => void;
  initialMessage?: string | null;
  onMessageConsumed?: () => void;
  onSwitchToSteps: (topic: string, mode?: 'learn' | 'task') => void;
  onSaveConcept: (text: string, source: 'chat' | 'focus') => void;
}

// --- VISUAL GRAPH MODAL COMPONENT (TREE LAYOUT) ---
interface ChatGraphModalProps {
  rootId: string;
  messages: ChatMessage[];
  onClose: () => void;
  onBranch: (parentId: string, text: string) => void;
}

const ChatGraphModal: React.FC<ChatGraphModalProps> = ({ rootId, messages, onClose, onBranch }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Monitor fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          wrapperRef.current?.requestFullscreen();
      } else {
          document.exitFullscreen();
      }
  };

  // Helper to clean filler text for concise cards (Summary Mode)
  const cleanAnswerText = (text: string) => {
      if (!text) return "Thinking...";

      // 1. Remove Markdown syntax (headers, bold, italic, code blocks)
      let clean = text
        .replace(/#{1,6}\s?/g, '') // Headers
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
        .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
        .replace(/`{1,3}(.*?)`{1,3}/gs, '$1') // Code
        .replace(/\[\[.*?\]\]/g, '') // System tags
        .replace(/\n/g, ' '); // Flatten to single line for regex checks

      // 2. Normalize whitespace
      clean = clean.replace(/\s+/g, ' ').trim();

      // 3. Regex for conversational fillers to STRIP from the START
      const fillers = [
        // English
        /^(sure|certainly|absolutely|of course|okay|ok|alright|great|cool|nice|hello|hi|hey|wow|thanks|greetings|welcome).{0,50}?[.!?]/i,
        /^(here is|here's|here are|i can help|let me explain|that's a great question|good question|great question|to answer|regarding|in response).{0,50}?[.!?]/i,
        /^(i'd be happy to|happy to help|let's dive in|let's explore|i understand|as an ai|based on).{0,50}?[.!?]/i,
        // Chinese
        /^(好的|没问题|当然|太好了|这是一个好问题|这个嘛|你好|嘿|哈喽|非常棒的问题|关于这个|为了回答|我明白).{0,30}?[.!?。！？]/,
        /^(下面是|这里是|让我们来看看|我来解释一下|正如你所问|根据你的|答案是).{0,30}?[.!?。！？]/
      ];

      // Iteratively remove fillers until clean
      let hasMatch = true;
      let iterations = 0;
      while (hasMatch && clean.length > 0 && iterations < 5) {
          hasMatch = false;
          iterations++;
          for (const regex of fillers) {
              const match = clean.match(regex);
              // Only remove if it matches at the very beginning
              if (match && match.index === 0) {
                  clean = clean.substring(match[0].length).trim();
                  hasMatch = true;
              }
          }
      }

      // 4. Final Polish: Cap length if still massive (visual summary)
      // Note: CSS line-clamp handles display, but we want the *content* to be the meat.
      return clean;
  };

  // Helper: Build Hierarchy Data (Merge Question + Answer into one node)
  const buildTreeData = (msgId: string): any => {
      const userMsg = messages.find(m => m.id === msgId);
      if (!userMsg) return null;

      // Find the AI response associated with this user message (direct child)
      // In this app structure: User -> AI -> User (User is child of AI)
      const aiMsg = messages.find(m => m.parentId === userMsg.id && m.role === 'model');
      
      const node = {
          id: userMsg.id, // Node ID is the User Message ID
          question: userMsg.text,
          // Clean the answer text for the visualization
          answer: aiMsg ? cleanAnswerText(aiMsg.text) : "Thinking...",
          aiId: aiMsg ? aiMsg.id : null,
          children: [] as any[]
      };

      // Find follow-up user questions. 
      // They are children of the AI message (if it exists), or the user message (rare case)
      const parentForNext = aiMsg ? aiMsg.id : userMsg.id;
      const childUserMsgs = messages.filter(m => m.parentId === parentForNext && m.role === 'user');

      node.children = childUserMsgs.map(child => buildTreeData(child.id)).filter(Boolean);

      return node;
  };

  // Handle Input Event Delegation
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLInputElement;
          if (target && target.classList.contains('branch-input') && e.key === 'Enter') {
              // Note: We branch from the AI ID because the new user message answers the AI
              const parentAiId = target.getAttribute('data-ai-id'); 
              // Fallback: if no AI ID (unanswered node), branch from User ID
              const parentUserId = target.getAttribute('data-user-id');
              const parentId = parentAiId || parentUserId;

              const text = target.value.trim();
              if (parentId && text) {
                  onBranch(parentId, text);
                  target.value = '';
                  onClose();
              }
          }
      };

      const stopPropagation = (e: Event) => {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON')) {
              e.stopPropagation();
          }
      };

      const wrapper = wrapperRef.current;
      if (wrapper) {
          wrapper.addEventListener('keydown', handleKeyDown);
          wrapper.addEventListener('mousedown', stopPropagation); 
          wrapper.addEventListener('touchstart', stopPropagation);
      }

      return () => {
          if (wrapper) {
              wrapper.removeEventListener('keydown', handleKeyDown);
              wrapper.removeEventListener('mousedown', stopPropagation);
              wrapper.removeEventListener('touchstart', stopPropagation);
          }
      };
  }, [onBranch, onClose]);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current) return;

    const width = wrapperRef.current.clientWidth;
    const height = wrapperRef.current.clientHeight;
    const isDark = document.documentElement.classList.contains('dark');

    // Constants
    const CARD_WIDTH = 280;
    const CARD_HEIGHT = 160; 
    const HORIZONTAL_GAP = 100; // Gap between levels
    const VERTICAL_GAP = 40;   // Gap between siblings

    // 1. Prepare Data
    const rawData = buildTreeData(rootId);
    if (!rawData) return;

    const root = d3.hierarchy(rawData);

    // Collapse logic: initially expand all, but we can set logic here if needed
    // root.descendants().forEach((d, i) => {
    //    if (d.depth > 1) d.children = null; // Example: collapse after depth 1
    // });

    // 2. Setup D3 Tree Layout
    const treeLayout = d3.tree()
        .nodeSize([CARD_HEIGHT + VERTICAL_GAP, CARD_WIDTH + HORIZONTAL_GAP])
        .separation((a, b) => a.parent === b.parent ? 1.1 : 1.2);

    // 3. SVG Setup
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 2])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom as any);

    // Center the root initially
    const initialTransform = d3.zoomIdentity.translate(50, height / 2).scale(0.8);
    svg.call(zoom.transform as any, initialTransform);


    // --- UPDATE FUNCTION (Handles Expand/Collapse) ---
    const update = (source: any) => {
        const treeData = treeLayout(root);
        const nodes = treeData.descendants();
        const links = treeData.links();

        // Normalize for fixed-depth (horizontal layout)
        // Switch X and Y because d3.tree is vertical by default, we want horizontal
        nodes.forEach((d: any) => {
            const oldX = d.x;
            d.x = d.y; // Swap for horizontal: depth (y) becomes x position
            d.y = oldX;
        });

        // --- NODES ---
        const node = g.selectAll<SVGForeignObjectElement, any>("foreignObject.node")
            .data(nodes, (d: any) => d.data.id);

        // Enter
        const nodeEnter = node.enter().append("foreignObject")
            .attr("class", "node")
            .attr("width", CARD_WIDTH)
            .attr("height", CARD_HEIGHT + 40) // Extra space for input
            .attr("x", (d: any) => source.x0 || d.x) // Start at parent position
            .attr("y", (d: any) => (source.y0 || d.y) - CARD_HEIGHT / 2)
            .style("opacity", 0);

        // Render Card HTML
        nodeEnter.append("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .html((d: any) => {
                const qText = d.data.question.length > 60 ? d.data.question.substring(0, 60) + '...' : d.data.question;
                // Note: aText is already cleaned by cleanAnswerText
                const aText = d.data.answer;
                
                // Colors
                const headerBg = "bg-indigo-600 dark:bg-adhd-primary";
                const bodyBg = "bg-white dark:bg-adhd-surface";
                const borderColor = "border-slate-200 dark:border-white/10";
                
                // Expand Button Logic
                const hasChildren = d._children || (d.children && d.children.length > 0);
                const isCollapsed = !!d._children;
                const expandBtn = hasChildren ? `
                    <button class="expand-btn absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-adhd-bg border-2 border-indigo-400 dark:border-adhd-primary rounded-full flex items-center justify-center text-indigo-600 dark:text-adhd-primary shadow-sm hover:scale-110 transition-transform z-30" data-id="${d.data.id}">
                        ${isCollapsed ? 
                            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M12 5v14M5 12h14"/></svg>' : 
                            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M5 12h14"/></svg>'
                        }
                    </button>
                ` : '';

                return `
                    <div class="relative group h-full pr-4"> <!-- pr-4 for expand button space -->
                        <div class="flex flex-col h-[${CARD_HEIGHT}px] rounded-xl shadow-md overflow-hidden border ${borderColor} transition-all hover:shadow-xl hover:-translate-y-1">
                            
                            <!-- Question (Top) -->
                            <div class="${headerBg} p-3 text-white dark:text-slate-900 flex items-start gap-2 h-[40%]">
                                <div class="mt-0.5 opacity-80"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                                <div class="text-xs font-bold leading-tight line-clamp-2">${qText}</div>
                            </div>

                            <!-- Answer (Bottom) -->
                            <div class="${bodyBg} p-3 text-slate-600 dark:text-adhd-text flex items-start gap-2 h-[60%] relative">
                                <div class="mt-0.5 text-indigo-500 dark:text-adhd-primary opacity-80">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7v-1.27A2 2 0 0 1 12 2z"></path></svg>
                                </div>
                                <div class="text-[11px] leading-relaxed line-clamp-4 flex-1">
                                    ${aText}
                                </div>
                            </div>
                        </div>
                        
                        ${expandBtn}

                        <!-- Hover Input Branch -->
                        <div class="absolute -bottom-2 left-0 w-[${CARD_WIDTH-20}px] opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0 z-20">
                            <div class="bg-white dark:bg-adhd-sidebar rounded-full shadow-lg border border-indigo-200 dark:border-adhd-primary/50 flex items-center p-1 h-8">
                                <div class="pl-2 pr-1 text-indigo-500 dark:text-adhd-primary">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
                                </div>
                                <input 
                                type="text" 
                                class="branch-input bg-transparent border-0 outline-none text-[10px] w-full text-slate-700 dark:text-white placeholder-slate-400"
                                placeholder="Branch off..."
                                data-ai-id="${d.data.aiId || ''}"
                                data-user-id="${d.data.id}"
                                />
                            </div>
                        </div>
                    </div>
                `;
            });

        // Add Click Listener for Expand/Collapse to the rendered buttons
        nodeEnter.each(function(d: any) {
            d3.select(this).selectAll(".expand-btn").on("mousedown", (e) => {
                e.stopPropagation();
                if (d.children) {
                    d._children = d.children;
                    d.children = null;
                } else {
                    d.children = d._children;
                    d._children = null;
                }
                update(d);
            });
        });

        // Update positions
        const nodeUpdate = nodeEnter.merge(node as any);
        nodeUpdate.transition().duration(500)
            .attr("x", (d: any) => d.x)
            .attr("y", (d: any) => d.y - CARD_HEIGHT / 2)
            .style("opacity", 1);
        
        // Re-render HTML content to update +/- icon state on collapse/expand
        nodeUpdate.select("xhtml\\:div").html((d: any) => {
             // Re-run HTML gen
             const qText = d.data.question.length > 60 ? d.data.question.substring(0, 60) + '...' : d.data.question;
             const aText = d.data.answer;
             const headerBg = "bg-indigo-600 dark:bg-adhd-primary";
             const bodyBg = "bg-white dark:bg-adhd-surface";
             const borderColor = "border-slate-200 dark:border-white/10";
             const hasChildren = d._children || (d.children && d.children.length > 0);
             const isCollapsed = !!d._children;

             const expandBtn = hasChildren ? `
                <button class="expand-btn absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-adhd-bg border-2 border-indigo-400 dark:border-adhd-primary rounded-full flex items-center justify-center text-indigo-600 dark:text-adhd-primary shadow-sm hover:scale-110 transition-transform z-30" data-id="${d.data.id}">
                    ${isCollapsed ? 
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M12 5v14M5 12h14"/></svg>' : 
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M5 12h14"/></svg>'
                    }
                </button>
            ` : '';

             return `
                <div class="relative group h-full pr-4">
                    <div class="flex flex-col h-[${CARD_HEIGHT}px] rounded-xl shadow-md overflow-hidden border ${borderColor} transition-all hover:shadow-xl hover:-translate-y-1">
                        <div class="${headerBg} p-3 text-white dark:text-slate-900 flex items-start gap-2 h-[40%]">
                            <div class="mt-0.5 opacity-80"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                            <div class="text-xs font-bold leading-tight line-clamp-2">${qText}</div>
                        </div>
                        <div class="${bodyBg} p-3 text-slate-600 dark:text-adhd-text flex items-start gap-2 h-[60%] relative">
                            <div class="mt-0.5 text-indigo-500 dark:text-adhd-primary opacity-80">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7v-1.27A2 2 0 0 1 12 2z"></path></svg>
                            </div>
                            <div class="text-[11px] leading-relaxed line-clamp-4 flex-1">
                                ${aText}
                            </div>
                        </div>
                    </div>
                    ${expandBtn}
                    <div class="absolute -bottom-2 left-0 w-[${CARD_WIDTH-20}px] opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0 z-20">
                        <div class="bg-white dark:bg-adhd-sidebar rounded-full shadow-lg border border-indigo-200 dark:border-adhd-primary/50 flex items-center p-1 h-8">
                            <div class="pl-2 pr-1 text-indigo-500 dark:text-adhd-primary">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
                            </div>
                            <input 
                            type="text" 
                            class="branch-input bg-transparent border-0 outline-none text-[10px] w-full text-slate-700 dark:text-white placeholder-slate-400"
                            placeholder="Branch off..."
                            data-ai-id="${d.data.aiId || ''}"
                            data-user-id="${d.data.id}"
                            />
                        </div>
                    </div>
                </div>
            `;
        });


        // Exit
        node.exit().transition().duration(500)
            .attr("x", (d: any) => source.x)
            .attr("y", (d: any) => source.y)
            .style("opacity", 0)
            .remove();

        // --- LINKS ---
        // Orthogonal Line Generator (L-Shape)
        // M y,x -> H (y+parentY)/2 -> V parentX -> H parentY
        // Since we swapped X/Y earlier: d.x is left-right pos, d.y is top-bottom
        const diagonal = (s: any, d: any) => {
            const midX = (s.x + d.x) / 2;
            return `M ${s.x + CARD_WIDTH - 20} ${s.y}
                    H ${midX}
                    V ${d.y}
                    H ${d.x}`;
        };

        const link = g.selectAll<SVGPathElement, any>("path.link")
            .data(links, (d: any) => d.target.id);

        const linkEnter = link.enter().insert("path", "foreignObject")
            .attr("class", "link")
            .attr("d", (d: any) => {
                const o = { x: source.x0 || source.x, y: source.y0 || source.y };
                // Start from same position to animate out
                return diagonal(o, o);
            })
            .attr("fill", "none")
            .attr("stroke", isDark ? "#4b5563" : "#cbd5e1")
            .attr("stroke-width", 2);

        const linkUpdate = linkEnter.merge(link as any);
        linkUpdate.transition().duration(500)
            .attr("d", (d: any) => diagonal(d.source, d.target));

        link.exit().transition().duration(500)
            .attr("d", (d: any) => {
                const o = { x: source.x, y: source.y };
                return diagonal(o, o);
            })
            .remove();

        // Stash the old positions for transition.
        nodes.forEach((d: any) => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    };

    update(root);

  }, [rootId, messages]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div 
            ref={wrapperRef}
            className={`bg-slate-50 dark:bg-adhd-bg rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-white/10 transition-all duration-300 ${isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-7xl h-[90vh]'}`}
        >
            <div className="absolute top-6 left-6 z-10 pointer-events-none">
                <div className="bg-white/90 dark:bg-adhd-surface/90 backdrop-blur px-4 py-3 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 pointer-events-auto">
                    <h3 className="font-bold text-slate-800 dark:text-adhd-text flex items-center gap-2 text-lg">
                        <Network size={20} className="text-indigo-500 dark:text-adhd-primary"/>
                        Mind Map
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-adhd-muted mt-1 max-w-xs">
                        Hover a card to branch off. Click <span className="font-bold text-indigo-500">+</span> to expand branches.
                    </p>
                </div>
            </div>
            
            <div className="absolute top-6 right-6 z-10 flex gap-2">
                <button 
                    onClick={toggleFullscreen}
                    className="p-2 bg-white dark:bg-adhd-surface hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-adhd-text transition-colors shadow-sm border border-slate-100 dark:border-white/5"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
                <button 
                    onClick={onClose}
                    className="p-2 bg-white dark:bg-adhd-surface hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-adhd-text transition-colors shadow-sm border border-slate-100 dark:border-white/5"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Pure Color Background */}
            <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-adhd-bg"></svg>
        </div>
    </div>
  );
};


// Recursive Tree Node Component
interface TreeNodeProps {
  nodeId: string;
  messages: ChatMessage[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onViewGraph: (rootId: string) => void;
  depth?: number;
  colorClass?: string; 
}

const TreeNode: React.FC<TreeNodeProps> = ({ 
  nodeId, 
  messages, 
  activeId, 
  onSelect, 
  onViewGraph,
  depth = 0,
  colorClass
}) => {
  const node = messages.find(m => m.id === nodeId);
  const [expanded, setExpanded] = useState(depth === 0); 
  
  if (!node) return null;

  const hasChildren = node.childrenIds.length > 0;
  const isActive = activeId === nodeId;
  const isRoot = depth === 0;
  
  const previewText = node.text.length > 25 ? node.text.substring(0, 25) + '...' : node.text;

  return (
    <div className={`select-none ${isRoot ? 'mb-3' : ''}`}>
      <div 
        className={`flex items-center py-2 px-3 cursor-pointer text-sm transition-all duration-200 border border-transparent group
          ${isRoot 
            ? `rounded-lg shadow-sm font-semibold ${colorClass} hover:brightness-95` 
            : `rounded-md hover:pl-3 ml-2 ${isActive ? 'bg-indigo-100 dark:bg-adhd-primary/20 text-indigo-700 dark:text-adhd-primary font-medium' : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-adhd-muted border-l-slate-200 dark:border-l-white/10'}`
          }
          ${!isRoot && depth > 0 ? 'border-l' : ''}
          ${isActive && isRoot ? 'ring-2 ring-offset-1 ring-offset-slate-50 dark:ring-offset-adhd-sidebar ring-indigo-400 dark:ring-adhd-primary' : ''}
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(nodeId);
        }}
      >
        {/* Expand/Collapse Toggle */}
        {hasChildren ? (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className={`mr-1.5 p-0.5 rounded transition-colors ${isRoot ? 'hover:bg-black/10' : 'hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 dark:text-adhd-muted'}`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 inline-block"></span>
        )}
        
        {/* Node Content */}
        <div className="flex-1 min-w-0 flex justify-between items-center">
          <div className="flex-1 truncate">
            {node.role === 'user' ? (
               <span className="truncate block">{previewText}</span>
            ) : (
               <span className="truncate block italic text-xs opacity-80">AI Response</span>
            )}
          </div>
          
          {/* Visual Graph Button - Only for Root */}
          {isRoot && (
              <button
                onClick={(e) => {
                    e.stopPropagation();
                    onViewGraph(nodeId);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-white/20 rounded ml-2 text-slate-700 dark:text-white transition-all scale-90 hover:scale-105"
                title="View Mind Map"
              >
                  <Network size={14} />
              </button>
          )}
        </div>
      </div>

      {/* Children Recursion */}
      {expanded && hasChildren && (
        <div className={isRoot ? "mt-1 pl-1" : ""}>
          {node.childrenIds.map(childId => (
            <TreeNode 
              key={childId} 
              nodeId={childId} 
              messages={messages} 
              activeId={activeId} 
              onSelect={onSelect}
              onViewGraph={onViewGraph}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Define distinct colors for root topics to create "Blocks"
const TOPIC_COLORS = [
  'bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-100',
  'bg-emerald-100 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-100',
  'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-100',
  'bg-violet-100 border-violet-200 text-violet-900 dark:bg-violet-900/30 dark:border-violet-800 dark:text-violet-100',
  'bg-rose-100 border-rose-200 text-rose-900 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-100',
  'bg-cyan-100 border-cyan-200 text-cyan-900 dark:bg-cyan-900/30 dark:border-cyan-800 dark:text-cyan-100',
];

const ChatMode: React.FC<ChatModeProps> = ({ 
  messages, 
  setMessages, 
  currentChatId, 
  setCurrentChatId,
  initialMessage,
  onMessageConsumed,
  onSwitchToSteps,
  onSaveConcept
}) => {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectionPopup, setSelectionPopup] = useState<{ x: number, y: number, text: string } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  // Graph Modal State
  const [viewingTopicGraphId, setViewingTopicGraphId] = useState<string | null>(null);

  // Filter for root messages (start of conversations)
  const rootMessages = messages.filter(m => m.parentId === null).sort((a, b) => b.timestamp - a.timestamp);

  // Helper to find the root topic for the current chat
  const getCurrentRootTopic = () => {
      if (!currentChatId) return null;
      let curr = messages.find(m => m.id === currentChatId);
      while (curr && curr.parentId) {
          curr = messages.find(m => m.id === curr!.parentId);
      }
      return curr;
  };

  const currentRootTopic = getCurrentRootTopic();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentChatId]);

  // Handle auto-send from other modes
  useEffect(() => {
    if (initialMessage && !isStreaming) {
        handleSend(initialMessage);
        if (onMessageConsumed) onMessageConsumed();
    }
  }, [initialMessage]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
        setSelectionPopup(null);
        return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Check if selection is inside the chat area (simple check: does it have content)
    if (rect.width > 0 && rect.height > 0) {
        setSelectionPopup({
            x: rect.left + (rect.width / 2) - 60, // Center horizontally relative to selection
            y: rect.top - 50 + window.scrollY, // Position above
            text: selection.toString()
        });
        setIsSaved(false);
    }
  };

  const saveSelectedConcept = () => {
      if (selectionPopup) {
          onSaveConcept(selectionPopup.text, 'chat');
          setIsSaved(true);
          setTimeout(() => setSelectionPopup(null), 1500);
          window.getSelection()?.removeAllRanges();
      }
  };

  // Updated handleSend to support branching from a specific parent
  const handleSend = async (text: string = input, specificParentId: string | null = null) => {
    if (!text.trim() || isStreaming) return;

    const targetParentId = specificParentId !== null ? specificParentId : currentChatId;

    const userMsgId = crypto.randomUUID();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: text,
      // If targetParentId is null/empty, this is a new Root Topic (parentId = null)
      parentId: targetParentId || null, 
      childrenIds: [],
      timestamp: Date.now(),
    };

    // Update parent if exists
    if (targetParentId) {
       setMessages(prev => prev.map(m => 
         m.id === targetParentId 
           ? { ...m, childrenIds: [...m.childrenIds, userMsgId] } 
           : m
       ));
    }

    setMessages(prev => [...prev, newUserMsg]);
    setCurrentChatId(userMsgId); // Set focus to new user message
    if (!specificParentId) setInput(''); // Only clear main input if not branching
    setIsStreaming(true);

    try {
      // Construct history for API (traverse up the tree from the NEW message's parent)
      const apiHistory: { role: string; parts: [{ text: string }] }[] = [];
      let curr = targetParentId ? messages.find(m => m.id === targetParentId) : null;
      while (curr) {
        apiHistory.unshift({ role: curr.role, parts: [{ text: curr.text }] });
        curr = curr.parentId ? messages.find(m => m.id === curr.parentId) : null;
      }

      const stream = await streamChatResponse(apiHistory, text);
      
      const aiMsgId = crypto.randomUUID();
      let aiText = '';
      
      const newAiMsg: ChatMessage = {
        id: aiMsgId,
        role: 'model',
        text: '',
        parentId: userMsgId,
        childrenIds: [],
        timestamp: Date.now(),
      };

      // Add AI message placeholder and link to user message
      setMessages(prev => {
        const updated = prev.map(m => 
            m.id === userMsgId ? { ...m, childrenIds: [aiMsgId] } : m
        );
        return [...updated, newAiMsg];
      });
      setCurrentChatId(aiMsgId);

      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text || '';
        aiText += chunkText;
        
        setMessages(prev => prev.map(m => 
          m.id === aiMsgId ? { ...m, text: aiText } : m
        ));
      }

      // Final processing after stream ends
      // Check for suggestions and cleanup
      const suggestionMatch = aiText.match(/Suggested Questions:?([\s\S]*)/i);
      let suggestions: string[] = [];
      if (suggestionMatch) {
          const rawSuggestions = suggestionMatch[1].split('\n').filter(s => s.trim().startsWith('-') || s.trim().match(/^\d\./));
          suggestions = rawSuggestions.map(s => s.replace(/^[-*1-9\.]+\s*/, '').trim()).slice(0, 3);
      }

      setMessages(prev => prev.map(m => 
        m.id === aiMsgId ? { ...m, suggestions } : m
      ));

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.map(m => 
        m.id === currentChatId ? { ...m, text: m.text + "\n[Error generating response]" } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  // Helper to get conversation thread for display
  const getDisplayThread = () => {
    const thread: ChatMessage[] = [];
    let curr = currentChatId ? messages.find(m => m.id === currentChatId) : null;
    
    while (curr) {
      thread.unshift(curr);
      curr = curr.parentId ? messages.find(m => m.id === curr.parentId) : null;
    }
    return thread;
  };

  const displayThread = getDisplayThread();

  // Custom renderer for message content
  const renderMessageContent = (text: string) => {
    // 1. Strip the "Step Mode" tag from display if present
    const cleanText = text.replace(/\[\[SUGGEST_STEP_MODE:.*?\]\]/g, '');

    // 2. Check for sections (double line breaks or headers)
    const sections = cleanText.split(/\n\n+/);
    
    return sections.map((section, idx) => {
      // Heuristic: If section starts with bullet points, give it a card look
      const isList = section.trim().startsWith('-') || section.trim().startsWith('*') || section.trim().match(/^\d\./);
      // Heuristic: Short headers
      const isHeader = section.length < 50 && section.endsWith(':');
      
      let className = "mb-4 text-slate-700 dark:text-adhd-text leading-relaxed";
      if (isList) className = "mb-4 bg-white dark:bg-black/20 p-4 rounded-lg shadow-sm border-l-4 border-emerald-400 dark:border-adhd-primary text-slate-800 dark:text-adhd-text";
      if (isHeader) className = "mb-2 font-bold text-indigo-600 dark:text-adhd-primary mt-4";

      // Process Markdown Bold (**text**)
      const formatBold = (str: string) => {
          return str.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white bg-yellow-100 dark:bg-adhd-accent/20 dark:text-adhd-accent px-0.5 rounded">$1</strong>');
      };

      const htmlContent = formatBold(section.replace(/\n/g, '<br/>'));

      return <div key={idx} className={className} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
    });
  };

  // Helper to detect if a message has the step mode tag
  const getStepSuggestion = (text: string): string | null => {
      const match = text.match(/\[\[SUGGEST_STEP_MODE:\s*(.*?)\]\]/);
      return match ? match[1] : null;
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-adhd-bg relative transition-colors duration-300">
      
      {/* --- VISUAL GRAPH MODAL --- */}
      {viewingTopicGraphId && (
          <ChatGraphModal 
            rootId={viewingTopicGraphId} 
            messages={messages} 
            onClose={() => setViewingTopicGraphId(null)}
            onBranch={(parentId, text) => handleSend(text, parentId)} 
          />
      )}

      {/* Selection Popup */}
      {selectionPopup && (
          <button
              onClick={saveSelectedConcept}
              className="fixed z-50 bg-slate-800 dark:bg-adhd-surface text-white dark:text-adhd-text px-3 py-1.5 rounded-lg shadow-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-700 dark:hover:bg-adhd-surface/80 transition-all duration-200 animate-in zoom-in-95 border dark:border-white/10 hover:-translate-y-1"
              style={{ top: selectionPopup.y, left: selectionPopup.x }}
          >
              {isSaved ? <Check size={16} className="text-emerald-400 dark:text-adhd-accent" /> : <BookmarkPlus size={16} className="text-yellow-400 dark:text-adhd-primary" />}
              {isSaved ? "Saved!" : "Save Concept"}
          </button>
      )}

      {/* Left Sidebar: Topic Tree */}
      <div className="w-72 border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-adhd-sidebar flex flex-col hidden md:flex transition-colors duration-300">
        <div className="p-4 border-b border-slate-100 dark:border-white/5 font-display font-semibold text-slate-500 dark:text-adhd-muted flex justify-between items-center bg-white dark:bg-adhd-sidebar">
            <span className="flex items-center gap-2"><Layers size={18}/> Topics</span>
            <button 
                onClick={() => setCurrentChatId('')} 
                className="p-1.5 bg-indigo-100 dark:bg-white/10 hover:bg-indigo-200 dark:hover:bg-white/20 rounded-lg text-indigo-600 dark:text-adhd-primary transition-all hover:scale-105 flex items-center gap-1.5" 
                title="Start New Topic"
            >
                <MessageSquare size={14} />
                <span className="text-xs font-bold">New</span>
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {rootMessages.length === 0 && (
                <div className="text-center mt-10">
                    <Hash className="w-8 h-8 mx-auto text-slate-300 dark:text-white/10 mb-2" />
                    <p className="text-xs text-slate-400 dark:text-adhd-muted">Start a conversation to see topics here.</p>
                </div>
            )}
            {rootMessages.map((root, index) => (
                <TreeNode 
                    key={root.id} 
                    nodeId={root.id} 
                    messages={messages} 
                    activeId={currentChatId} 
                    onSelect={setCurrentChatId} 
                    onViewGraph={setViewingTopicGraphId}
                    colorClass={TOPIC_COLORS[index % TOPIC_COLORS.length]}
                />
            ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* TOPIC HEADER - Sticky Top */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-white/80 dark:bg-adhd-bg/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shadow-sm transition-colors duration-300">
            <div className="flex items-center gap-3 overflow-hidden">
                {currentRootTopic ? (
                  <>
                     <div className="min-w-0">
                         <h2 className="font-display font-bold text-lg text-slate-800 dark:text-adhd-text truncate max-w-lg">
                            {currentRootTopic.text}
                         </h2>
                         <p className="text-[10px] text-slate-400 dark:text-adhd-muted font-mono uppercase tracking-widest mt-0.5">Current Topic</p>
                     </div>
                     {/* Header Mind Map Trigger */}
                     <button
                        onClick={() => setViewingTopicGraphId(currentRootTopic.id)}
                        className="p-2 bg-indigo-50 dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 rounded-lg text-indigo-600 dark:text-adhd-primary transition-all flex-shrink-0"
                        title="View Conversation Mind Map"
                     >
                         <Network size={18} />
                     </button>
                  </>
                ) : (
                   <h2 className="font-display font-bold text-lg text-slate-400 dark:text-adhd-muted italic">
                      New Topic
                   </h2>
                )}
            </div>
            
            {/* Mobile New Chat Button */}
            <button 
                onClick={() => setCurrentChatId('')} 
                className="md:hidden p-2 bg-slate-100 dark:bg-white/10 rounded-full text-slate-600 dark:text-adhd-text"
            >
                <MessageSquare size={16} />
            </button>
        </div>

        <div 
            className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth" 
            onMouseUp={handleTextSelection}
        >
            {displayThread.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-adhd-muted opacity-60">
                    <Sparkles size={48} className="mb-4 text-indigo-300 dark:text-adhd-primary" />
                    <h2 className="text-2xl font-display font-bold mb-2">FocusFlow Chat</h2>
                    <p>Ask anything. I'll break it down for you.</p>
                </div>
            ) : (
                displayThread.map(msg => {
                    const stepSuggestion = msg.role === 'model' ? getStepSuggestion(msg.text) : null;

                    return (
                        <div key={msg.id} className={`flex mb-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] md:max-w-[75%] flex flex-col items-start ${msg.role === 'user' ? 'items-end' : ''}`}>
                                <div className={`${msg.role === 'user' 
                                    ? 'bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 rounded-2xl rounded-tr-sm p-4 shadow-md' 
                                    : 'w-full dark:text-adhd-text'}`}>
                                    {msg.role === 'user' ? (
                                        <p className="font-medium">{msg.text}</p>
                                    ) : (
                                        <div>
                                            {renderMessageContent(msg.text)}
                                            
                                            {/* Step Mode Suggestion Card */}
                                            {stepSuggestion && (
                                                <div className="mt-4 bg-indigo-50 dark:bg-white/5 border border-indigo-200 dark:border-white/10 rounded-lg p-4 flex flex-col items-start gap-4 animate-in fade-in slide-in-from-bottom-2">
                                                    <div>
                                                        <h4 className="font-bold text-indigo-700 dark:text-adhd-primary flex items-center gap-2">
                                                            <Layers size={16} /> Complex Topic Detected
                                                        </h4>
                                                        <p className="text-sm text-indigo-600 dark:text-adhd-muted mt-1">
                                                            "{stepSuggestion}" seems like a big topic. How would you like to handle it?
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 w-full">
                                                        <button 
                                                            onClick={() => onSwitchToSteps(stepSuggestion, 'learn')}
                                                            className="flex-1 bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95 shadow-sm"
                                                        >
                                                            Start Step Mode
                                                        </button>
                                                        <button 
                                                            onClick={() => onSwitchToSteps(stepSuggestion, 'task')}
                                                            className="flex-1 bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-900 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95 shadow-sm flex items-center justify-center gap-2"
                                                        >
                                                            <Target size={16} /> Task Breakdown
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Suggested Questions Chips */}
                                            {msg.suggestions && msg.suggestions.length > 0 && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {msg.suggestions.map((s, i) => (
                                                        <button 
                                                            key={i}
                                                            onClick={() => handleSend(s)}
                                                            className="text-xs bg-slate-100 dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 text-slate-600 dark:text-adhd-text hover:text-indigo-700 dark:hover:text-white px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/5 hover:border-indigo-200 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 text-left"
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white dark:bg-adhd-sidebar border-t border-slate-200 dark:border-white/5 transition-colors duration-300">
            <div className="max-w-4xl mx-auto relative">
                {/* Tools Toolbar */}
                <div className="flex gap-2 mb-2">
                    {displayThread.length > 2 && (
                        <button 
                            onClick={() => handleSend("Summarize our conversation so far in 3 simple bullet points.")}
                            className="text-xs font-semibold text-slate-500 dark:text-adhd-muted bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 px-3 py-1.5 rounded-full flex items-center gap-1 transition-all duration-200 hover:-translate-y-0.5"
                        >
                            <FileText size={12} /> Summarize
                        </button>
                    )}
                </div>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask a question or clarify a concept..."
                    className="w-full bg-slate-100 dark:bg-adhd-surface border-0 rounded-xl px-4 py-4 pr-12 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-adhd-primary focus:bg-white dark:focus:bg-adhd-surface text-slate-900 dark:text-adhd-text placeholder-slate-400 dark:placeholder-adhd-muted transition-all shadow-inner"
                    disabled={isStreaming}
                />
                <button 
                    onClick={() => handleSend()}
                    disabled={isStreaming || !input.trim()}
                    className="absolute right-2 bottom-2 p-2 bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 rounded-lg hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95"
                >
                    {isStreaming ? (
                        <div className="w-5 h-5 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Send size={20} />
                    )}
                </button>
            </div>
            {/* Quick Helper for ADHD: "I don't know what to ask" */}
            <div className="max-w-4xl mx-auto mt-2 flex gap-4 text-xs text-slate-400 dark:text-adhd-muted justify-center">
                 <span>Pro Tip: Highlight any text to save it as a Concept Card.</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMode;