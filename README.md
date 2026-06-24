# 📟 Hacker Lobby

A secure, real-time, multiplayer terminal chat application built with a zero-dependency Node.js CLI frontend and a Cloudflare Workers/D1 database serverless backend.

---

## 🚀 Getting Started with Node.js, npm, and npx

To run the Hacker Lobby client and server, you need **Node.js** installed on your system. Node.js comes bundled with **npm** (Node Package Manager) and **npx** (Node Package Runner) automatically.

### 📥 1. Installation Guide

#### 🪟 Windows
* **Direct Installer**: Download the recommended LTS installer from the [official Node.js website](https://nodejs.org/). Run the `.msi` file and follow the default prompts.
* **Terminal (Winget)**: Open PowerShell or Command Prompt as administrator and run:
  ```powershell
  winget install OpenJS.NodeJS
  ```

#### 🍎 macOS
* **Direct Installer**: Download the macOS installer (`.pkg`) from the [official Node.js website](https://nodejs.org/) and run it.
* **Homebrew**: Open Terminal and run:
  ```bash
  brew install node
  ```

#### 🐧 Linux (Ubuntu/Debian)
Open Terminal and run the following command to install Node.js and npm:
```bash
sudo apt update
sudo apt install nodejs npm -y
```

---

### 💻 2. Accessing and Verifying via Terminal

Once installed, restart your terminal application (PowerShell, Command Prompt, or bash) and verify the installation:

1. **Verify Node.js** (executes JavaScript code):
   ```bash
   node -v
   ```
2. **Verify npm** (installs and manages dependencies):
   ```bash
   npm -v
   ```
3. **Verify npx** (executes npm packages without globally installing them):
   ```bash
   npx -v
   ```

---

## 🛠️ Project Setup

Follow these steps to set up and run Hacker Lobby locally:

### 1. Install Dependencies
Clone the repository, navigate to the folder, and run:
```bash
npm install
```

### 2. Configure Backend Database
Initialize the local Cloudflare D1 database and apply the SQL schema:
```bash
npx wrangler d1 execute chat-db --local --file=schema.sql
```

### 3. Run the Backend Server
Start the local serverless backend with Wrangler:
```bash
npx wrangler dev
```
The server will start listening at `http://127.0.0.1:8787`.

### 4. Connect with CLI Chat Client
Configure the client to connect to your local backend server using environment variables:

* **PowerShell (Windows)**:
  ```powershell
  $env:API_URL="http://127.0.0.1:8787"; node index.js
  ```
* **macOS / Linux / Git Bash**:
  ```bash
  API_URL="http://127.0.0.1:8787" node index.js
  ```

---

## ✨ Features

- **Real-Time Messaging**: Built on Server-Sent Events (SSE) for zero-latency multiplayer updates.
- **Secure Alias Locking**: Users can register and lock their alias with a password. Password hashes are calculated locally and checked securely using SHA-256 and salt on the database.
- **Input Masking**: Passwords and confirmation queries are muted on the terminal during entry.
- **Anti-Spam Rate Limiting**: Built-in IP-based Token Bucket rate limiting (capacity: 5 requests, refilling 1 token every 1.5 seconds) to prevent bot spam.
- **Auto-Cleanup Cron**: Cloudflare worker triggers hourly routines to automatically prune chat logs older than 6 hours.
- **Terminal XSS Protection**: Strip ANSI escape sequences from incoming user payloads to prevent control character injection attacks.
