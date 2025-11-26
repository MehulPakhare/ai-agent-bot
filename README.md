# AI Agent Chatbot & Admin System

This is a full-stack AI application built with Node.js, TypeScript, and Google Gemini. It features a real-time chat interface, an intelligent agent that saves notes to a database, and an Admin Dashboard to view all data.

## 🚀 What it does
1.  **Real-Time Chat:** Users can chat with an AI (Gemini 2.5) via a responsive UI.
2.  **Agent Actions:** If the user asks to "Save a note," the AI detects this intent and saves the data to PostgreSQL.
3.  **RAG (Retrieval Augmented Generation):** The system "vectorizes" notes and uses them to answer future questions (e.g., asking "What is my code?" retrieves the saved note about the code).
4.  **Admin Dashboard:** A secure panel to view hashed passwords, conversation history, and saved embeddings.

---

## 🛠️ How to set up the database
1.  **Install PostgreSQL** on your local machine.
2.  Create a `.env` file in the root folder with the following:
    ```env
    DATABASE_URL="postgresql://postgres:YOUR_DB_PASSWORD@localhost:5432/ai_agent_db?schema=public"
    API_KEY="YOUR_GEMINI_API_KEY"
    ```
3.  **Run Migrations:** This creates the Users, Messages, and Notes tables.
    ```bash
    npx prisma migrate dev --name init
    ```

---

## 🏃‍♂️ How to run the app
1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Start the Server:**
    ```bash
    npx ts-node src/index.ts
    ```
3.  **Open the App:**
    Go to `http://localhost:3000` in your browser.

---

## 📡 How to call APIs (Examples)

### 1. Create User (Signup)
* **Endpoint:** `POST /signup`
* **Body:**
    ```json
    {
      "email": "user@test.com",
      "password": "password123"
    }
    ```

### 2. Login (Get Token)
* **Endpoint:** `POST /login`
* **Body:**
    ```json
    {
      "email": "user@test.com",
      "password": "password123"
    }
    ```
* **Response:** Returns a JWT `token`.

### 3. Admin Data Dump (Protected)
* **Endpoint:** `POST /admin/data`
* **Body:**
    ```json
    {
      "token": "YOUR_ADMIN_JWT_TOKEN"
    }
    ```

---

## 🤖 How Agent Actions Work
The system uses a **Prompt Engineering & Interceptor** pattern:

1.  **Instruction:** The AI is given a system prompt: *"If asked to save a note, start reply with ACTION_SAVE_NOTE:"*.
2.  **Detection:** The backend listens to the AI's response stream.
3.  **Execution:** If the string `ACTION_SAVE_NOTE:` is found:
    * The text is extracted.
    * It is converted into a **Vector Embedding** (using Gemini text-embedding-004).
    * It is saved to the `Note` table in PostgreSQL.
4.  **Feedback:** The system intercepts the raw text and sends a formatted confirmation message `(System: 💾 Saved...)` back to the user via Websockets.


# AI Agent Chatbot Assignment

## 🎥 Watch the Demo
### [Click here to watch the End-to-End Walkthrough Video](https://drive.google.com/file/d/1fcjcGH_StJ-zFjMUoJb74VCQKubsee7T/view?usp=sharing)

---
