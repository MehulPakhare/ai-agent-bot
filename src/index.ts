import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

// --- CONFIGURATION ---
const app = express();
const prisma = new PrismaClient();
const PORT = 3000;
const SECRET_KEY = "super-secret-key-change-this-later"; // For JWT login

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.API_KEY || "");
// Use the modern 2025 standard model
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Middleware
app.use(cors());
app.use(express.json());

// --- HELPER: "THE AGENT" ---
// This function decides if the AI wants to perform an action
async function handleAgentAction(aiResponseText: string, userId: number) {
  // We teach the AI (in the prompt) to start with "ACTION_SAVE_NOTE:" if it wants to save data.
  if (aiResponseText.startsWith("ACTION_SAVE_NOTE:")) {
    const noteContent = aiResponseText.replace("ACTION_SAVE_NOTE:", "").trim();
    
    // 1. Perform the action (Save to DB)
    await prisma.note.create({
      data: { content: noteContent, userId: userId }
    });

    // 2. Return a system message confirming the action
    return `(System: I have saved the note: "${noteContent}" to your database.)`;
  }
  return null; // No action needed
}

// --- API ROUTES ---

// 1. SIGNUP (Create Account)
app.post('/signup', async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword }
    });
    res.json({ message: "User created!", userId: user.id });
  } catch (error) {
    res.status(400).json({ error: "User likely already exists" });
  }
});

// 2. LOGIN (Get Token)
app.post('/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Create a simple token containing the User ID
  const token = jwt.sign({ userId: user.id }, SECRET_KEY);
  res.json({ token });
});

// 3. CHAT (The Main Brain)
app.post('/chat', async (req: any, res: any) => {
  const { token, message, conversationId } = req.body;

  try {
    // Verify User
    const decoded: any = jwt.verify(token, SECRET_KEY);
    const userId = decoded.userId;

    // Get or Create Conversation
    let chatId = conversationId;
    if (!chatId) {
      const newConv = await prisma.conversation.create({ data: { userId } });
      chatId = newConv.id;
    }

    // Save User Message to DB
    await prisma.message.create({
      data: { conversationId: chatId, role: 'user', content: message }
    });

    // --- AI LOGIC START ---
    // We give the AI a "System Instruction" so it knows how to be an Agent.
    const systemPrompt = `
      You are a helpful assistant. 
      IMPORTANT: If the user explicitly asks you to "save a note" or "remember this", 
      do not reply with normal text. Instead, start your reply exactly with:
      ACTION_SAVE_NOTE: followed by the content to save.
    `;
    
    const result = await model.generateContent(systemPrompt + "\nUser: " + message);
    const aiText = result.response.text();
    
    // Check if Agent needs to act
    const agentResult = await handleAgentAction(aiText, userId);

    // Final Response (either the Agent confirmation or the AI's normal chat)
    const finalResponse = agentResult ? agentResult : aiText;

    // Save AI Message to DB
    await prisma.message.create({
      data: { conversationId: chatId, role: 'assistant', content: finalResponse }
    });

    res.json({ response: finalResponse, conversationId: chatId });

  } catch (error) {
    console.error(error);
    res.status(401).json({ error: "Invalid Token or AI Error" });
  }
});

// 4. GET HISTORY (Fetch old messages)
app.get('/history/:conversationId', async (req: any, res: any) => {
  const { conversationId } = req.params;
  const messages = await prisma.message.findMany({
    where: { conversationId: parseInt(conversationId) },
    orderBy: { createdAt: 'asc' }
  });
  res.json(messages);
});

// 5. GET NOTES (See what the agent saved)
app.post('/my-notes', async (req: any, res: any) => {
  const { token } = req.body;
  try {
    const decoded: any = jwt.verify(token, SECRET_KEY);
    const notes = await prisma.note.findMany({ where: { userId: decoded.userId } });
    res.json(notes);
  } catch(e) {
    res.status(401).json({error: "Unauthorized"});
  }
});

app.listen(PORT, () => {
  console.log(`ROBO-SERVER running on http://localhost:${PORT}`);
});