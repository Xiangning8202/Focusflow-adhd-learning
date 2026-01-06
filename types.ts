
export enum AppMode {
  HOME = 'HOME',
  CHAT = 'CHAT',
  STEPS = 'STEPS',
  FOCUS = 'FOCUS',
  REVIEW = 'REVIEW',
  RECORD = 'RECORD',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  parentId: string | null;
  childrenIds: string[];
  timestamp: number;
  suggestions?: string[]; // For model responses
}

export interface StepData {
  type: 'learn' | 'quiz';
  title: string;
  explanation?: string; // For learn
  example?: string; // For learn
  question?: string; // For quiz
  options?: string[]; // For quiz
  correctOptionIndex?: number; // For quiz
  icon?: string;
  estimatedMinutes?: number;
  imagePrompt?: string; // Prompt for generating a visual
  videoId?: string; // YouTube Video ID
  userResponse?: string; // For Task Breakdown mode input
  suggestedAnswers?: string[]; // Pre-set answers for the user to choose
  feedback?: string; // Helpful info/tips shown after interaction
  phaseTitle?: string; // Level 1 Task Grouping
}

export interface StepSession {
  id: string; // Unique session ID
  topic: string;
  steps: StepData[];
  currentStep: number;
  completed: boolean;
  isTaskMode?: boolean; // Distinguish between Learning and Task Breakdown
}

export interface StepRecord {
  id: string;
  topic: string;
  timestamp: number;
  totalSteps: number;
  completedSteps: number;
  lastActive: number;
  status: 'in-progress' | 'completed';
  type?: 'learn' | 'task';
}

export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  status: 'new' | 'known' | 'forgot';
}

export interface SavedConcept {
  id: string;
  term: string;
  definition: string;
  sourceText: string;
  sourceType: 'chat' | 'focus';
  timestamp: number;
}

export interface StoredFile {
    id: string;
    name: string;
    content: string;
    type: 'pdf' | 'docx' | 'txt' | 'raw';
    category?: string; // Grouping category
    timestamp: number;
}

export interface Distraction {
  id: string;
  text: string;
  timestamp: number;
}

export interface ConceptNode {
  id: string;
  group: number;
  val: number; // size
}

export interface ConceptLink {
  source: string;
  target: string;
  value: number;
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  links: ConceptLink[];
}

export interface UserStats {
  points: number;
  streak: number;
  itemsLearned: number;
}