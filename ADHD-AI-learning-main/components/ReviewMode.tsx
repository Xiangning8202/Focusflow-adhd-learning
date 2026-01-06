import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Flashcard, ConceptGraph, ChatMessage, SavedConcept } from '../types';
import { generateReviewMaterials } from '../services/geminiService';
import { RefreshCw, RotateCw, Check, X, BrainCircuit, Trophy, Star, Sparkles, BookOpen, BookmarkPlus, MousePointerClick, History, Layers, MessageSquare, Globe } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ReviewModeProps {
  chatHistory: ChatMessage[];
  addPoints: (n: number) => void;
  externalContext?: string;
  savedConcepts?: SavedConcept[];
}

type ReviewScope = { type: 'all' } | { type: 'chat', id: string, title: string };

const ReviewMode: React.FC<ReviewModeProps> = ({ chatHistory, addPoints, externalContext, savedConcepts = [] }) => {
  // Data State
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [graphData, setGraphData] = useState<ConceptGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // View State
  const [selectedScope, setSelectedScope] = useState<ReviewScope>({ type: 'all' });
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Interaction State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{x: number, y: number, term: string, definition: string} | null>(null);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  
  const d3Container = useRef<SVGSVGElement>(null);

  // Keep refs updated for D3 event closures to access latest data without re-binding
  const currentCardIndexRef = useRef(currentCardIndex);
  const flashcardsRef = useRef(flashcards);
  const savedConceptsRef = useRef(savedConcepts);

  useEffect(() => { currentCardIndexRef.current = currentCardIndex; }, [currentCardIndex]);
  useEffect(() => { flashcardsRef.current = flashcards; }, [flashcards]);
  useEffect(() => { savedConceptsRef.current = savedConcepts; }, [savedConcepts]);

  // Reset view when scope changes
  useEffect(() => {
      setFlashcards([]);
      setGraphData(null);
      setIsSessionComplete(false);
      setCurrentCardIndex(0);
  }, [selectedScope.type, (selectedScope as any).id]);

  // Extract Chat Topics (Root Messages)
  const chatTopics = chatHistory
      .filter(m => m.parentId === null)
      .sort((a, b) => b.timestamp - a.timestamp);

  // Helper: Reconstruct full conversation text for a specific topic
  const getConversationContent = (rootId: string): string => {
      // Find all descendants
      const descendants: ChatMessage[] = [];
      const queue = [rootId];
      const visited = new Set<string>();
      
      while (queue.length > 0) {
          const currId = queue.shift()!;
          if (visited.has(currId)) continue;
          visited.add(currId);

          const msg = chatHistory.find(m => m.id === currId);
          if (msg) {
              descendants.push(msg);
              // Add children to queue
              const children = chatHistory.filter(c => c.parentId === currId).map(c => c.id);
              queue.push(...children);
          }
      }
      
      // Sort by timestamp
      descendants.sort((a, b) => a.timestamp - b.timestamp);
      return descendants.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
  };

  // Trigger Celebration on Complete
  useEffect(() => {
    if (isSessionComplete) {
         const duration = 3000;
         const end = Date.now() + duration;

         (function frame() {
           confetti({
             particleCount: 5,
             angle: 60,
             spread: 55,
             origin: { x: 0 },
             colors: ['#5F9EA0', '#FFA07A']
           });
           confetti({
             particleCount: 5,
             angle: 120,
             spread: 55,
             origin: { x: 1 },
             colors: ['#5F9EA0', '#FFA07A']
           });

           if (Date.now() < end) {
             requestAnimationFrame(frame);
           }
         }());
    }
  }, [isSessionComplete]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setIsSessionComplete(false);
    try {
        let contextContent = "";

        if (selectedScope.type === 'all') {
            // Aggregate recent chat text for context
            const recentText = chatHistory
                .filter(m => m.role === 'model')
                .slice(-5)
                .map(m => m.text)
                .join("\n");
            
            contextContent = (externalContext || "") + "\n\n" + recentText;
        } else {
            // Specific Topic
            contextContent = getConversationContent(selectedScope.id);
        }
        
        // Format manual concepts to force them into the AI context
        const conceptsText = savedConcepts.map(c => `- Term: ${c.term}\n  Definition: ${c.definition}`).join('\n');
        
        let fullContext = contextContent;
        if (conceptsText) {
            fullContext += `\n\nIMPORTANT: The user has explicitly identified the following key concepts. You MUST include these in the concept map and flashcards if relevant:\n${conceptsText}`;
        }

        if (!fullContext.trim()) {
            alert("No content to review! Chat with the AI, save concepts, or add text from Focus Mode first.");
            setIsLoading(false);
            return;
        }

        const data = await generateReviewMaterials(fullContext);
        setFlashcards(data.flashcards);
        setGraphData(data.graph);
        setCurrentCardIndex(0);
        setIsFlipped(false);
    } catch (e) {
        console.error(e);
        alert("Failed to generate review.");
    } finally {
        setIsLoading(false);
    }
  };

  // Helper to find details (definition) for a node ID
  const getNodeDefinition = (nodeId: string): string => {
      // 1. Try Flashcards
      const card = flashcardsRef.current.find(f => f.term.toLowerCase() === nodeId.toLowerCase());
      if (card) return card.definition;
      
      // 2. Try Partial Flashcard Match
      const partialCard = flashcardsRef.current.find(f => f.term.toLowerCase().includes(nodeId.toLowerCase()));
      if (partialCard) return partialCard.definition;

      // 3. Try Saved Concepts
      const saved = savedConceptsRef.current.find(c => c.term.toLowerCase() === nodeId.toLowerCase());
      if (saved) return saved.definition;

      return "Click to explore this concept further.";
  };

  // Main D3 Graph Initialization
  useEffect(() => {
    if (!graphData || !d3Container.current) return;

    // Check if dark mode is active by checking the html class
    const isDark = document.documentElement.classList.contains('dark');
    
    // Clear previous
    const svg = d3.select(d3Container.current);
    svg.selectAll("*").remove(); 

    const width = d3Container.current.clientWidth;
    const height = d3Container.current.clientHeight;

    // 1. Prepare Data & Calculate Connectivity (Degree)
    // Clone to prevent strict mode mutation issues on re-renders
    const nodes = graphData.nodes.map(d => ({ ...d }));
    const links = graphData.links.map(d => ({ ...d }));

    const nodeDegree = new Map<string, number>();
    nodes.forEach(n => nodeDegree.set(n.id, 0));
    links.forEach(l => {
        const s = l.source as string;
        const t = l.target as string;
        nodeDegree.set(s, (nodeDegree.get(s) || 0) + 1);
        nodeDegree.set(t, (nodeDegree.get(t) || 0) + 1);
    });

    const getRadius = (id: string) => {
        const degree = nodeDegree.get(id) || 0;
        // Base radius 15, grow by 3 for each connection, cap at 45
        return Math.min(45, 15 + (degree * 3));
    };

    // 2. Create Layers (Groups) for Z-Index management
    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");
    const labelGroup = svg.append("g").attr("class", "labels");

    // 3. Setup Simulation
    const simulation = d3.forceSimulation(nodes as any)
        .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150)) // Increased distance for neater layout
        .force("charge", d3.forceManyBody().strength(-1000)) // Stronger repulsion to prevent clutter
        .force("x", d3.forceX(width / 2).strength(0.05)) // Gentle pull to center X
        .force("y", d3.forceY(height / 2).strength(0.05)) // Gentle pull to center Y
        .force("collide", d3.forceCollide((d: any) => getRadius(d.id) + 25).iterations(2)); // Increased collision buffer

    // 4. Render Links
    const link = linkGroup
        .attr("stroke", isDark ? "#4b5563" : "#cbd5e1")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", 2);

    // 5. Render Nodes
    const node = nodeGroup
        .attr("stroke", isDark ? "#2D2D2D" : "#fff")
        .attr("stroke-width", 2)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("id", (d: any) => `node-${d.id.replace(/\s+/g, '-')}`) // Assign ID for highlighting
        .attr("r", (d: any) => getRadius(d.id))
        .attr("fill", (d: any) => {
            if (isDark) {
                 const darkColors = ["#5F9EA0", "#8FBC8F", "#FFA07A", "#B0C4DE", "#D8BFD8"];
                 return darkColors[d.group % darkColors.length] || "#5F9EA0";
            }
            return d3.schemeTableau10[d.group % 10] || "#6366f1";
        })
        .attr("cursor", "pointer")
        .on("mouseover", (event, d: any) => {
            // Populate Concept Card Tooltip
            const definition = getNodeDefinition(d.id);
            setHoverTooltip({ 
                x: event.clientX, 
                y: event.clientY, 
                term: d.id, 
                definition: definition 
            });
            
            // Hover effect (expand)
            const currentTerm = flashcardsRef.current[currentCardIndexRef.current]?.term;
            if (d.id !== currentTerm) {
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .attr("r", getRadius(d.id) + 5)
                    .attr("stroke", isDark ? "#E0E0E0" : "#334155");
            }
        })
        .on("mouseout", (event, d: any) => {
            setHoverTooltip(null);
            
            // Restore size
            const currentTerm = flashcardsRef.current[currentCardIndexRef.current]?.term;
            const isActive = d.id === currentTerm;
            const baseR = getRadius(d.id);
            
            d3.select(event.currentTarget)
                .transition().duration(200)
                .attr("r", isActive ? baseR + 10 : baseR)
                .attr("stroke", isDark ? "#2D2D2D" : "#fff");
        })
        .on("click", (event, d: any) => {
            event.stopPropagation();
            setSelectedNodeId(d.id);
        })
        .call(d3.drag<any, any>()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // 6. Render Text Labels
    const labels = labelGroup
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("id", (d: any) => `label-${d.id.replace(/\s+/g, '-')}`) // ID for highlighting
        .text((d: any) => d.id)
        .attr("font-size", "12px") // Uniform font size
        .attr("text-anchor", "middle")
        .attr("dy", (d: any) => getRadius(d.id) + 15) // Position below node, fixed offset from edge
        .attr("fill", isDark ? "#E0E0E0" : "#475569")
        .attr("pointer-events", "none")
        .style("font-weight", "500")
        .style("text-shadow", isDark ? "0 1px 2px rgba(0,0,0,0.8)" : "0 1px 2px rgba(255,255,255,0.8)");

    // 7. Tick Function
    simulation.on("tick", () => {
        link
            .attr("x1", (d: any) => d.source.x)
            .attr("y1", (d: any) => d.source.y)
            .attr("x2", (d: any) => d.target.x)
            .attr("y2", (d: any) => d.target.y);

        node
            .attr("cx", (d: any) => d.x)
            .attr("cy", (d: any) => d.y);

        labels
            .attr("x", (d: any) => d.x)
            .attr("y", (d: any) => d.y);
    });

    function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

  }, [graphData]); // Only re-run if graph data structure changes

  // Separate Effect: Highlight Active Node when Card Switched
  useEffect(() => {
     if (!graphData || !d3Container.current) return;
     const currentTerm = flashcards[currentCardIndex]?.term;
     
     const isDark = document.documentElement.classList.contains('dark');
     const accentColor = isDark ? "#FFA07A" : "#F59E0B";
     const nodeStroke = isDark ? "#2D2D2D" : "#fff";
     const labelColorNormal = isDark ? "#E0E0E0" : "#475569";
     const labelColorActive = isDark ? "#FFA07A" : "#F59E0B";

     const svg = d3.select(d3Container.current);
     
     // 1. Reset all nodes and labels
     svg.selectAll("circle")
        .transition().duration(300)
        .attr("stroke", nodeStroke)
        .attr("stroke-width", 2)
        .style("filter", "none")
        .attr("fill-opacity", 0.7);

     svg.selectAll("text")
        .transition().duration(300)
        .attr("fill", labelColorNormal)
        .style("font-weight", "500")
        .style("font-size", "12px"); // Reset to uniform size

     if (!currentTerm) return;

     // 2. Highlight active node
     svg.selectAll("circle")
        .filter((d: any) => d.id === currentTerm)
        .raise() // Bring to front
        .transition()
        .duration(500)
        .ease(d3.easeElasticOut)
        .attr("r", function(this: any) { 
            // Get current radius and add 10
            const currentR = parseFloat(d3.select(this).attr("r"));
            return currentR < 30 ? 35 : currentR + 10;
        })
        .attr("stroke", accentColor)
        .attr("stroke-width", 4)
        .style("filter", `drop-shadow(0 0 10px ${accentColor})`)
        .attr("fill-opacity", 1);

     // 3. Highlight active label
     svg.selectAll("text")
        .filter((d: any) => d.id === currentTerm)
        .raise()
        .transition()
        .duration(500)
        .attr("fill", labelColorActive)
        .style("font-weight", "bold")
        .style("font-size", "14px"); // Slightly larger for active item

  }, [currentCardIndex, graphData, flashcards]);

  const markCard = (status: 'known' | 'forgot') => {
    // Update status in state to track history
    const updatedCards = [...flashcards];
    if (updatedCards[currentCardIndex]) {
        updatedCards[currentCardIndex] = { ...updatedCards[currentCardIndex], status };
        setFlashcards(updatedCards);
    }

    if (status === 'known') addPoints(5);
    
    setIsFlipped(false);
    setTimeout(() => {
        if (currentCardIndex < flashcards.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
        } else {
            setIsSessionComplete(true);
            addPoints(50); // Bonus for completion
        }
    }, 200);
  };

  const getSelectedNodeDetails = () => {
      if (!selectedNodeId) return null;
      return { term: selectedNodeId, definition: getNodeDefinition(selectedNodeId) };
  };

  const knownCount = flashcards.filter(f => f.status === 'known').length;
  const forgotCount = flashcards.filter(f => f.status === 'forgot').length;

  const renderContent = () => {
     // Gamified Completion Screen
    if (isSessionComplete) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-adhd-bg animate-in fade-in duration-500 w-full">
                <div className="relative mb-8">
                    <Trophy size={80} className="text-yellow-400 dark:text-adhd-accent animate-bounce" />
                    <Sparkles className="absolute -top-2 -right-4 text-amber-400 dark:text-adhd-accent animate-pulse" size={32} />
                    <Sparkles className="absolute -bottom-2 -left-4 text-amber-400 dark:text-adhd-accent animate-pulse delay-75" size={24} />
                </div>
                <h2 className="text-3xl font-display font-bold text-slate-800 dark:text-adhd-text mb-2">Session Complete!</h2>
                <p className="text-slate-500 dark:text-adhd-muted mb-8">You've strengthened your neural pathways.</p>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 shadow-sm flex flex-col items-center">
                        <span className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">{knownCount}</span>
                        <span className="text-xs text-emerald-700 dark:text-emerald-500 uppercase font-bold">Known</span>
                    </div>
                    <div className="bg-white dark:bg-adhd-surface p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col items-center">
                        <span className="text-2xl font-bold text-amber-500 dark:text-adhd-accent">+50</span>
                        <span className="text-xs text-slate-400 uppercase font-bold">XP Gained</span>
                    </div>
                </div>

                {forgotCount > 0 && (
                    <div className="mb-8 w-full max-w-sm">
                        <p className="text-sm font-bold text-red-400 mb-2 text-center">Focus for Next Time:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                        {flashcards.filter(f => f.status === 'forgot').map(f => (
                            <span key={f.id} className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 px-2 py-1 rounded">
                                {f.term}
                            </span>
                        ))}
                        </div>
                    </div>
                )}

                <button 
                onClick={() => setIsSessionComplete(false)}
                className="text-indigo-600 dark:text-adhd-primary font-semibold hover:bg-indigo-50 dark:hover:bg-white/5 px-6 py-2 rounded-full transition-all duration-200 hover:-translate-y-0.5"
                >
                    Review Again
                </button>
                <button 
                onClick={handleGenerate}
                className="mt-2 text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text text-sm flex items-center gap-1 hover:underline"
                >
                    <RefreshCw size={12} /> Regenerate New Set
                </button>
            </div>
        );
    }

    if (flashcards.length === 0 && !isLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 w-full">
              <BrainCircuit size={64} className="text-slate-300 dark:text-adhd-muted mb-6" />
              <h2 className="text-2xl font-bold text-slate-700 dark:text-adhd-text mb-2">Knowledge Review</h2>
              <p className="text-slate-500 dark:text-adhd-muted mb-6 max-w-sm">
                  {selectedScope.type === 'all' 
                      ? "I'll analyze your reading materials, recent chats, and saved concepts to create a review."
                      : `I'll create a targeted review based on the conversation "${selectedScope.title}".`
                  }
              </p>
              
              {savedConcepts.length > 0 && selectedScope.type === 'all' && (
                  <div className="mb-8 p-4 bg-indigo-50 dark:bg-adhd-surface rounded-lg border border-indigo-100 dark:border-white/5 max-w-md w-full text-left">
                      <h4 className="font-bold text-indigo-700 dark:text-adhd-primary mb-2 flex items-center gap-2">
                          <BookmarkPlus size={16} /> Ready to Review ({savedConcepts.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                          {savedConcepts.slice(0, 5).map((c, i) => (
                              <span key={i} className="text-xs bg-white dark:bg-adhd-bg px-2 py-1 rounded border border-indigo-200 dark:border-white/10 text-indigo-600 dark:text-adhd-text">{c.term}</span>
                          ))}
                          {savedConcepts.length > 5 && <span className="text-xs text-indigo-400">+{savedConcepts.length - 5} more</span>}
                      </div>
                  </div>
              )}

              <button 
                onClick={handleGenerate}
                className="bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 px-6 py-3 rounded-lg shadow-md hover:bg-indigo-700 dark:hover:bg-adhd-primary/90 font-semibold flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-95"
              >
                  <RefreshCw size={20} /> Generate Review
              </button>
          </div>
      )
    }

    return (
         <div className="flex flex-col md:flex-row h-full w-full relative">
            {/* Left: Flashcards */}
            <div className="w-full md:w-1/2 p-8 bg-slate-50 dark:bg-adhd-bg flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/5 transition-colors duration-300">
                {isLoading ? (
                    <div className="flex flex-col items-center">
                        <div className="animate-spin text-indigo-500 dark:text-adhd-primary mb-4"><RotateCw size={40} /></div>
                        <p className="text-sm text-slate-400 dark:text-adhd-muted animate-pulse">Building your mind map...</p>
                    </div>
                ) : (
                    <div className="w-full max-w-sm flex flex-col items-center">
                        <div className="w-full flex justify-between text-sm font-bold text-slate-400 dark:text-adhd-muted mb-4 uppercase tracking-wider">
                            <span>Card {currentCardIndex + 1}/{flashcards.length}</span>
                            <span>Flashcards</span>
                        </div>
                        
                        {/* Card Container */}
                        <div 
                            className="group h-80 w-full perspective-1000 cursor-pointer" 
                            onClick={() => setIsFlipped(!isFlipped)}
                        >
                            <div className={`relative h-full w-full transition-all duration-500 transform-style-3d shadow-xl dark:shadow-none rounded-2xl ${isFlipped ? 'rotate-y-180' : 'hover:-translate-y-1 hover:shadow-2xl'}`}>
                                {/* Front */}
                                <div className="absolute inset-0 backface-hidden bg-white dark:bg-adhd-surface rounded-2xl flex flex-col items-center justify-center p-6 border-2 border-slate-100 dark:border-white/5">
                                    <span className="text-xs text-indigo-400 dark:text-adhd-primary font-bold uppercase mb-2">Term</span>
                                    <h3 className="text-3xl font-display font-bold text-slate-800 dark:text-adhd-text text-center">{flashcards[currentCardIndex]?.term}</h3>
                                    <p className="mt-8 text-slate-400 dark:text-adhd-muted text-sm flex items-center gap-1">
                                        <RotateCw size={12} /> Click to flip
                                    </p>
                                </div>
                                {/* Back */}
                                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-adhd-primary text-white dark:text-slate-900 rounded-2xl flex flex-col items-center justify-center p-6">
                                    <span className="text-xs text-indigo-200 dark:text-slate-700 font-bold uppercase mb-2">Definition</span>
                                    <p className="text-lg text-center font-medium leading-relaxed">{flashcards[currentCardIndex]?.definition}</p>
                                </div>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex justify-center gap-6 mt-8">
                            <button 
                                onClick={() => markCard('forgot')}
                                className="flex flex-col items-center gap-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors group hover:-translate-y-1 active:scale-95 duration-200"
                            >
                                <div className="w-12 h-12 rounded-full border-2 border-red-200 dark:border-red-900/50 flex items-center justify-center bg-white dark:bg-adhd-surface group-hover:border-red-400 group-hover:bg-red-50 dark:group-hover:bg-red-900/20 transition-all">
                                    <X />
                                </div>
                                <span className="text-xs font-semibold">Forgot</span>
                            </button>
                            <button 
                                onClick={() => markCard('known')}
                                className="flex flex-col items-center gap-1 text-emerald-500 dark:text-adhd-accent hover:text-emerald-600 dark:hover:text-adhd-accent/80 transition-colors group hover:-translate-y-1 active:scale-95 duration-200"
                            >
                                <div className="w-12 h-12 rounded-full border-2 border-emerald-200 dark:border-adhd-accent/30 flex items-center justify-center bg-white dark:bg-adhd-surface group-hover:border-emerald-400 dark:group-hover:border-adhd-accent group-hover:bg-emerald-50 dark:group-hover:bg-adhd-accent/10 transition-all">
                                    <Check />
                                </div>
                                <span className="text-xs font-semibold">Know it</span>
                            </button>
                        </div>

                        {/* Session Record */}
                        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 w-full">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold uppercase text-slate-400 dark:text-adhd-muted flex items-center gap-1">
                                    <History size={12}/> Session Record
                                </span>
                                <span className="text-[10px] text-slate-300 dark:text-adhd-muted/50">{Math.round(((knownCount + forgotCount) / Math.max(1, flashcards.length)) * 100)}% Complete</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-500/20 flex flex-col items-center">
                                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{knownCount}</span>
                                    <span className="text-[10px] uppercase font-bold text-emerald-400 dark:text-emerald-500/80">Known</span>
                                </div>
                                <div className="bg-red-50 dark:bg-red-500/10 p-3 rounded-xl border border-red-100 dark:border-red-500/20 flex flex-col items-center">
                                    <span className="text-2xl font-bold text-red-500 dark:text-red-400">{forgotCount}</span>
                                    <span className="text-[10px] uppercase font-bold text-red-400 dark:text-red-500/80">Forgot</span>
                                </div>
                            </div>

                            {forgotCount > 0 && (
                                <div className="bg-white dark:bg-black/20 rounded-lg p-3 border border-slate-100 dark:border-white/5 max-h-32 overflow-y-auto custom-scrollbar">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-adhd-muted uppercase block mb-2">Review Later</span>
                                    <div className="flex flex-wrap gap-2">
                                        {flashcards.filter(f => f.status === 'forgot').map(f => (
                                            <span key={f.id} className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded font-medium border border-red-200 dark:border-red-900/50">
                                                {f.term}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right: Concept Map */}
            <div className="w-full md:w-1/2 bg-white dark:bg-adhd-bg relative transition-colors duration-300">
                <div className="absolute top-4 left-4 z-10 bg-white/80 dark:bg-adhd-surface/80 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-500 dark:text-adhd-muted border border-slate-200 dark:border-white/5 shadow-sm flex items-center gap-1">
                    <BrainCircuit size={14} /> Interactive Map
                </div>
                <div className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-adhd-surface/80 backdrop-blur px-3 py-2 rounded-lg text-xs text-slate-500 dark:text-adhd-muted border border-slate-200 dark:border-white/5 shadow-sm max-w-xs flex items-center gap-2">
                    <MousePointerClick size={14} />
                    <p>Hover nodes for details. Click to lock.</p>
                </div>
                <svg ref={d3Container} className="w-full h-full" style={{ minHeight: '400px' }}></svg>
            </div>
         </div>
    );
  };

  const selectedNodeDetails = getSelectedNodeDetails();

  return (
    <div className="flex h-full w-full overflow-hidden transition-colors duration-300">
        
        {/* LEFT SIDEBAR: Topic Selection */}
        <div className="w-64 bg-white dark:bg-adhd-sidebar border-r border-slate-200 dark:border-white/5 flex flex-col shrink-0 z-20">
             <div className="p-4 border-b border-slate-100 dark:border-white/5 font-display font-semibold text-slate-500 dark:text-adhd-muted flex items-center gap-2 bg-white dark:bg-adhd-sidebar">
                <Layers size={18}/> Review Topics
             </div>
             
             <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                 {/* General Review */}
                 <div>
                     <h4 className="px-2 text-[10px] font-bold text-slate-400 dark:text-adhd-muted uppercase tracking-wider mb-2">
                         Overview
                     </h4>
                     <button
                        onClick={() => setSelectedScope({ type: 'all' })}
                        className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
                            selectedScope.type === 'all' 
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30' 
                            : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                        }`}
                     >
                         <div className={`p-2 rounded-lg ${selectedScope.type === 'all' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-adhd-text'}`}>
                             <Globe size={18} />
                         </div>
                         <div>
                             <p className={`text-sm font-bold ${selectedScope.type === 'all' ? 'text-indigo-700 dark:text-adhd-text' : 'text-slate-700 dark:text-adhd-text'}`}>General Review</p>
                             <p className="text-[10px] text-slate-400 dark:text-adhd-muted">All active contexts</p>
                         </div>
                     </button>
                 </div>

                 {/* Chat Topics */}
                 {chatTopics.length > 0 && (
                     <div>
                         <h4 className="px-2 text-[10px] font-bold text-slate-400 dark:text-adhd-muted uppercase tracking-wider mb-2">
                             From Conversations
                         </h4>
                         <div className="space-y-2">
                             {chatTopics.map(topic => {
                                 const isActive = selectedScope.type === 'chat' && (selectedScope as any).id === topic.id;
                                 return (
                                     <button
                                         key={topic.id}
                                         onClick={() => setSelectedScope({ type: 'chat', id: topic.id, title: topic.text })}
                                         className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
                                             isActive
                                             ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30' 
                                             : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                                         }`}
                                     >
                                         <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-adhd-text'}`}>
                                             <MessageSquare size={18} />
                                         </div>
                                         <div className="min-w-0 flex-1">
                                             <p className={`text-sm font-bold truncate ${isActive ? 'text-indigo-700 dark:text-adhd-text' : 'text-slate-700 dark:text-adhd-text'}`}>
                                                 {topic.text}
                                             </p>
                                             <p className="text-[10px] text-slate-400 dark:text-adhd-muted">
                                                 {new Date(topic.timestamp).toLocaleDateString()}
                                             </p>
                                         </div>
                                     </button>
                                 );
                             })}
                         </div>
                     </div>
                 )}
             </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
            
            {/* Concept Card Tooltip */}
            {hoverTooltip && (
                <div 
                    className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-4 animate-in fade-in zoom-in-95 duration-150"
                    style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
                >
                    <div className="bg-white dark:bg-adhd-surface rounded-xl shadow-2xl p-4 w-64 border-l-4 border-indigo-500 dark:border-adhd-primary ring-1 ring-black/5 dark:ring-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={14} className="text-indigo-500 dark:text-adhd-primary" />
                            <h4 className="font-bold text-slate-800 dark:text-adhd-text text-sm">{hoverTooltip.term}</h4>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-adhd-text/80 leading-relaxed line-clamp-4">
                            {hoverTooltip.definition}
                        </p>
                    </div>
                    {/* Arrow */}
                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white dark:border-t-adhd-surface mx-auto drop-shadow-sm"></div>
                </div>
            )}

            {/* Node Detail Overlay (Modal) for Click */}
            {selectedNodeId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4" onClick={() => setSelectedNodeId(null)}>
                    <div className="bg-white dark:bg-adhd-surface rounded-2xl shadow-2xl p-6 max-w-md w-full transform transition-all scale-100 border border-slate-100 dark:border-white/5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-adhd-text font-display">{selectedNodeId}</h3>
                            <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-adhd-text"><X size={20}/></button>
                        </div>
                        
                        {selectedNodeDetails ? (
                            <div className="bg-indigo-50 dark:bg-black/20 p-4 rounded-xl border border-indigo-100 dark:border-white/5">
                                <h4 className="text-xs font-bold text-indigo-400 dark:text-adhd-primary uppercase mb-2">Definition</h4>
                                <p className="text-slate-700 dark:text-adhd-text leading-relaxed font-medium">{selectedNodeDetails.definition}</p>
                            </div>
                        ) : (
                            <p className="text-slate-500 dark:text-adhd-muted italic">No specific definition found for this node in the current set.</p>
                        )}
                        
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setSelectedNodeId(null)} className="bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-adhd-text px-4 py-2 rounded-lg font-medium hover:-translate-y-0.5 transition-transform">Close</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Split Content */}
            {renderContent()}

        </div>
    </div>
  );
};

export default ReviewMode;