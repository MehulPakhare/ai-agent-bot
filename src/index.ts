import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const prisma = new PrismaClient();
const PORT = 3000;
const SECRET_KEY = "my-secret-key"; 

const genAI = new GoogleGenerativeAI(process.env.API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- HELPERS ---
async function getEmbedding(text: string) {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
}

async function findRelevantNotes(queryText: string, userId: number) {
  const queryVector = await getEmbedding(queryText);
  const allNotes = await prisma.note.findMany({ where: { userId } });
  
  const scoredNotes = allNotes.map(note => {
    if (!note.embedding) return { note, score: 0 };
    const noteVector = JSON.parse(note.embedding);
    return { note, score: cosineSimilarity(queryVector, noteVector) };
  });

  return scoredNotes.sort((a, b) => b.score - a.score).filter(i => i.score > 0.5).slice(0, 3).map(i => i.note.content);
}

// --- API ROUTES ---

app.post('/signup', async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    // 🔒 THIS LINE HASHES THE PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hashedPassword } });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "User exists" }); }
});

app.post('/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  
  if (email === "admin" && password === "admin123") {
      const token = jwt.sign({ userId: 9999, email: "admin", isAdmin: true }, SECRET_KEY);
      return res.json({ token, userId: 9999, email: "admin", isAdmin: true });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Invalid" });
  
  const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: false }, SECRET_KEY);
  res.json({ token, userId: user.id, email: user.email, isAdmin: false });
});

app.get('/history/:userId', async (req: any, res: any) => {
    const history = await prisma.message.findMany({
        where: { conversation: { userId: parseInt(req.params.userId) } },
        orderBy: { createdAt: 'asc' },
        take: 50
    });
    res.json(history);
});

// --- UPDATED ADMIN ENDPOINT ---
app.post('/admin/data', async (req: any, res: any) => {
    const { token } = req.body;
    try {
        const decoded: any = jwt.verify(token, SECRET_KEY);
        if (!decoded.isAdmin) throw new Error("Not Admin");

        // Fetch EVERYTHING
        const users = await prisma.user.findMany();
        const notes = await prisma.note.findMany({ include: { user: { select: { email: true } } } });
        const conversations = await prisma.conversation.findMany({ include: { user: { select: { email: true } } } });
        const messages = await prisma.message.findMany({ 
            include: { conversation: { include: { user: { select: { email: true } } } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ users, notes, conversations, messages });
    } catch(e) {
        res.status(403).json({ error: "Access Denied" });
    }
});

// --- WEBSOCKETS ---
io.on('connection', (socket) => {
  socket.on('join_room', (userId) => { socket.join(userId.toString()); });

  socket.on('send_message', async (data) => {
    const { text, userId, token } = data;
    try { jwt.verify(token, SECRET_KEY); } catch(e) { return; }

    const relevantNotes = await findRelevantNotes(text, userId);
    let contextText = relevantNotes.length > 0 ? `\n(Context: ${relevantNotes.join(" | ")})` : "";

    const systemPrompt = `You are a helpful assistant. If asked to save a note, reply starting with ACTION_SAVE_NOTE:. ${contextText}`;
    const result = await model.generateContent(systemPrompt + "\nUser: " + text);
    const aiText = result.response.text();

    let conv = await prisma.conversation.findFirst({ where: { userId }});
    if (!conv) conv = await prisma.conversation.create({ data: { userId } });
    await prisma.message.create({ data: { conversationId: conv.id, role: 'user', content: text }});
    await prisma.message.create({ data: { conversationId: conv.id, role: 'assistant', content: aiText }});

    if (aiText.startsWith("ACTION_SAVE_NOTE:")) {
        const noteContent = aiText.replace("ACTION_SAVE_NOTE:", "").trim();
        const vector = await getEmbedding(noteContent);
        await prisma.note.create({ data: { content: noteContent, userId, embedding: JSON.stringify(vector) } });
        socket.emit('receive_message', { text: `(System: 💾 Saved: "${noteContent}")` });
    } else {
        socket.emit('receive_message', { text: aiText });
    }
  });
});

httpServer.listen(PORT, () => { console.log(`SERVER on http://localhost:${PORT}`); });