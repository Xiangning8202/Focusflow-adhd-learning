import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StepData, Flashcard, ConceptGraph } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION_CHAT = `
You are a supportive, clear, and engaging tutor designed for learners with ADHD. 
Formatting Rules:
1. Break long paragraphs into short, digestible chunks.
2. Use bullet points frequently.
3. Be encouraging and concise.
4. **Bold** key terms and important concepts to make them stand out.
5. If the user asks about a complex, broad topic (e.g., "Teach me Quantum Physics", "How does the immune system work") that would benefit from a structured step-by-step breakdown, end your response with this exact tag: [[SUGGEST_STEP_MODE: Topic Name]]. Replace "Topic Name" with the specific topic.
6. At the end of your response (before the step mode tag if applicable), provide 3 short, relevant follow-up questions labeled as "Suggested Questions".
`;

export const streamChatResponse = async (
  history: { role: string; parts: [{ text: string }] }[],
  message: string
) => {
  const model = "gemini-2.5-flash";
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_CHAT,
    },
    history: history,
  });

  return chat.sendMessageStream({ message });
};

// Schema for Step-by-Step Mode with Checkpoints
const STEP_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: ["learn", "quiz"], description: "Type of step: 'learn' for content, 'quiz' for checkpoint" },
      title: { type: Type.STRING, description: "Short title of this specific step (Level 2 task)" },
      phaseTitle: { type: Type.STRING, description: "The Name of the Major Phase (Level 1 Task) this step belongs to. E.g. 'Preparation', 'Drafting', 'Review'." },
      explanation: { type: Type.STRING, description: "Content for 'learn' type. Max 3 sentences." },
      example: { type: Type.STRING, description: "For 'learn': A concrete analogy. For 'task': The placeholder text for the user input." },
      question: { type: Type.STRING, description: "Question text for 'quiz' type." },
      options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "MANDATORY for 'quiz' type. Exactly 4 distinct options." },
      correctOptionIndex: { type: Type.INTEGER, description: "MANDATORY for 'quiz' type. 0-based index of correct option." },
      icon: { type: Type.STRING, description: "Single emoji" },
      estimatedMinutes: { type: Type.INTEGER, description: "Suggested time in minutes (1-3)" },
      imagePrompt: { type: Type.STRING, description: "A detailed description to generate a clean, simplified, flat-style diagram for this step. No backgrounds, no text." },
      videoId: { type: Type.STRING, description: "The 11-character YouTube Video ID (e.g. 'dQw4w9WgXcQ') of a specific, high-quality, famous educational video." },
      suggestedAnswers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "For 'task' mode: 2-3 short, likely options/responses the user might say to complete this step." },
      feedback: { type: Type.STRING, description: "For 'task' mode: Helpful tips, resources, or interesting facts that appear AFTER the user completes the step." }
    },
    required: ["type", "title", "icon", "estimatedMinutes", "phaseTitle"],
  },
};

export const generateSteps = async (
  topic: string, 
  contextText?: string, 
  videoData?: { mimeType: string, data: string },
  isTaskMode: boolean = false
): Promise<StepData[]> => {
  const parts: any[] = [];
  let prompt = "";

  if (isTaskMode) {
      // Task Decomposition Prompt
      prompt = `You are an ADHD Task Decomposition Assistant. The user wants to complete the task: "${topic}".
      
      1. Break this task down into 3-5 Major Phases (Level 1 Tasks).
      2. For EACH Phase, break it down further into 2-4 micro-steps (Level 2 Tasks).
      3. The 'phaseTitle' field must be the name of the Major Phase.
      4. The 'title' field must be the name of the Micro-step.
      5. TONE: Extremely supportive, calm, and "low pressure".
      6. For each step, provide a clear instruction in the 'explanation' field.
      7. **Crucial**: Provide 2-3 'suggestedAnswers' (e.g., "Done!", "Need 5 mins", "Skipping").
      8. **Crucial**: Provide 'feedback' for each step (tips, cheerleading).
      9. Provide an 'imagePrompt' for a simple illustration.
      10. Use 'learn' type for all steps.
      
      ${contextText ? `Context: ${contextText}` : ''}`;
       parts.push({ text: prompt });

  } else if (videoData) {
    // Video-based generation
    prompt = `Analyze the video content provided and create a step-by-step learning path. The topic is "${topic}".
    1. Break the video's content down into 5-8 logical steps.
    2. Group them into 2-3 logical phases if possible (use 'phaseTitle').
    3. Extract key visual and spoken information for the 'explanation' fields.
    4. Every 2-3 'learn' steps, insert a 'quiz' step based on the video content.
    5. For 'learn' steps, create a concrete 'example' or analogy.
    6. For 'learn' steps, provide an 'imagePrompt'.
    
    ${contextText ? `Additional Context/URLs to consider: ${contextText}` : ''}`;

    parts.push({
      inlineData: {
        mimeType: videoData.mimeType,
        data: videoData.data
      }
    });
    parts.push({ text: prompt });

  } else if (contextText) {
    // Text document-based or URL-based generation
    prompt = `Create a step-by-step learning path based ONLY on the following content. The topic is "${topic}".
    
    1. Break the content down into 5-8 logical steps.
    2. Use 'phaseTitle' to group related steps.
    3. Extract the key information from the text for the 'explanation' fields.
    4. Every 2-3 'learn' steps, insert a 'quiz' step.
    5. For 'learn' steps, generate a relevant 'imagePrompt'.
    6. For 'learn' steps, create a concrete 'example'.
    
    Content (Truncated):
    ${contextText.substring(0, 25000)}`; 
    parts.push({ text: prompt });

  } else {
    // General knowledge-based generation
    prompt = `Create a learning path for "${topic}".
    1. Break it down into 5-8 steps.
    2. Group them into logical phases using 'phaseTitle' (e.g. "Basics", "Advanced", "Application").
    3. Mostly use 'learn' steps with clear explanations.
    4. Every 2-3 'learn' steps, insert a 'quiz' step (Checkpoint).
    5. Keep it gamified and simple.
    6. For 'learn' steps, provide an 'imagePrompt' for a clean diagram.
    7. For 'learn' steps, YOU MUST PROVIDE an 'example' field.
    8. For 'quiz' steps, YOU MUST PROVIDE 'options' and 'correctOptionIndex'.
    `;
    parts.push({ text: prompt });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { parts }, // Pass parts array
    config: {
      responseMimeType: "application/json",
      responseSchema: STEP_SCHEMA,
    },
  });

  if (response.text) {
    return JSON.parse(response.text) as StepData[];
  }
  return [];
};

export const generateLearningImage = async (prompt: string): Promise<string | null> => {
    try {
        const enhancedPrompt = `${prompt}. Style: Vector art, flat design, minimal, white background, educational diagram, high contrast, easy to understand.`;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: enhancedPrompt }]
            }
        });

        // Extract image
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    } catch (e) {
        console.error("Image generation failed", e);
    }
    return null;
};

// Schema for Flashcards & Review
const REVIEW_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
        required: ["term", "definition"],
      },
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Name of the concept node" },
          group: { type: Type.INTEGER, description: "Group ID for coloring (1-5)" },
        },
        required: ["id", "group"],
      },
    },
    links: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, description: "Source node ID" },
          target: { type: Type.STRING, description: "Target node ID" },
        },
        required: ["source", "target"],
      },
    },
  },
  required: ["flashcards", "nodes", "links"],
};

export const generateReviewMaterials = async (content: string): Promise<{ flashcards: Flashcard[], graph: ConceptGraph }> => {
  const prompt = `Analyze the following content and generate study materials. 
  1. Create 5-8 key flashcards.
  2. Create a concept map structure (nodes and links) showing relationships between key terms.
  
  Content:
  ${content.substring(0, 15000)}`; // Increased limit slightly

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: REVIEW_SCHEMA,
    },
  });

  if (response.text) {
    const data = JSON.parse(response.text);
    const flashcards = data.flashcards.map((f: any, i: number) => ({ ...f, id: `fc-${i}`, status: 'new' }));
    const graph: ConceptGraph = {
      nodes: data.nodes.map((n: any) => ({ id: n.id, group: n.group, val: 1 })),
      links: data.links.map((l: any) => ({ source: l.source, target: l.target, value: 1 })),
    };
    return { flashcards, graph };
  }
  
  throw new Error("Failed to generate review materials");
};

// Schema for extraction
const CONCEPT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    term: { type: Type.STRING, description: "The main concept name" },
    definition: { type: Type.STRING, description: "A clear, concise definition based on the text" }
  },
  required: ["term", "definition"]
};

export const extractConcept = async (text: string): Promise<{ term: string, definition: string } | null> => {
    const prompt = `Identify the single most important concept or term in the following text and provide a concise definition for it.
    
    Text: "${text}"`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: CONCEPT_SCHEMA
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
    } catch (e) {
        console.error("Concept extraction failed", e);
    }
    return null;
};

export const askContextQuestion = async (context: string, question: string): Promise<string> => {
    const prompt = `Context: "${context}"
    
    User Question: "${question}"
    
    Answer concisely and clearly.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });
    return response.text || "I couldn't generate an answer.";
}