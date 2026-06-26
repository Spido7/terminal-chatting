# 📟 Hacker Lobby

A secure, real-time, multiplayer terminal chat application that connects hackers globally. The application runs entirely within your terminal, utilizing a serverless Cloudflare Workers and D1 database backend on the edge to deliver real-time messaging without latency.

---

## 🌍 Global Access & Connecting Globally

Hacker Lobby is designed to connect people globally. When you run the application, it connects to a production server deployed on Cloudflare's serverless edge network. This allows you to chat in real-time with developers and terminal enthusiasts from all around the world.

* **Global API Backend URL**: `https://hacker-lobby-backend.spidozx.workers.dev`

---

## 📥 Prerequisites: Downloading Node.js and npm

To run the Hacker Lobby client, you need **Node.js** installed on your system. 

When you install Node.js, it automatically installs:
1. **npm (Node Package Manager)**: Used for installing and managing Node.js packages.
2. **npx (Node Package Runner)**: Used to execute Node.js CLI packages directly without manual global installation.

### How to Download and Install

#### 🪟 Windows
* **Direct Installer**: Download the recommended LTS installer from the [official Node.js website](https://nodejs.org/). Run the downloaded `.msi` file and follow the installer prompts.
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
Open Terminal and run the following commands to install Node.js and npm:
```bash
sudo apt update
sudo apt install nodejs npm -y
```

### Verifying Your Installation
Once the installation is complete, restart your terminal application (PowerShell, Command Prompt, or bash) and verify the setup:

1. **Verify Node.js**:
   ```bash
   node -v
   ```
2. **Verify npm**:
   ```bash
   npm -v
   ```
3. **Verify npx**:
   ```bash
   npx -v
   ```

---

## 🚀 How to Access Hacker Lobby

You can connect to the global chat room instantly using `npx`. There is no need to clone the repository, download files, or configure local databases.

Simply open your terminal and run:
```bash
npx hacker-lobby
```
*This command runs the client and automatically connects to the global production server.*

### Using a Custom Server URL (Optional)
If you wish to connect to a custom/different backend, you can specify the `API_URL` environment variable:

* **PowerShell (Windows)**:
  ```powershell
  $env:API_URL="https://your-custom-backend.workers.dev"; npx hacker-lobby
  ```
* **Command Prompt (Windows)**:
  ```cmd
  set API_URL=https://your-custom-backend.workers.dev && npx hacker-lobby
  ```
* **macOS / Linux / Git Bash**:
  ```bash
  API_URL="https://your-custom-backend.workers.dev" npx hacker-lobby
  ```

---

## 💬 How to Use

Once inside the lobby, you can interact with the global room:

1. **Choose an Alias**: Type your nickname and press **Enter**.
2. **Lock Your Alias (Optional)**: If you choose to lock your alias, you will be prompted to create a password. For security, characters are hidden as you type.
3. **Chatting**: Type your message and press **Enter** to broadcast it.
4. **Commands**:
   * Type `/exit` or `/quit` to close the application.

---

## ✨ Features

- **Real-Time Messaging**: Built on Server-Sent Events (SSE) for zero-latency multiplayer updates.
- **Secure Alias Locking**: Register your nickname with a password. Passwords are salted and hashed using SHA-256 for secure database verification.
- **Input Masking**: Passwords and confirmation queries are hidden on the terminal screen during entry.
- **Anti-Spam Rate Limiting**: Token-bucket rate limiting prevents message spamming.
- **Terminal XSS Protection**: Filters ANSI escape sequences to prevent control character injection attacks.
