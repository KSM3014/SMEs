# SME Investor Service - Setup Guide

Complete step-by-step setup instructions for Windows 11.

---

## 📋 Table of Contents

1. [Prerequisites Installation](#1-prerequisites-installation)
2. [Database Setup](#2-database-setup)
3. [Project Configuration](#3-project-configuration)
4. [Initial Data Collection](#4-initial-data-collection)
5. [Running the Server](#5-running-the-server)
6. [Verification](#6-verification)
7. [Common Issues](#7-common-issues)

---

## 1. Prerequisites Installation

### 1.1 Install Node.js (v18+)

1. Download from: https://nodejs.org/ (LTS version)
2. Run installer, accept defaults
3. Verify installation:
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show v9.x.x or higher
```

### 1.2 Install PostgreSQL (v14+)

1. Download from: https://www.postgresql.org/download/windows/
2. Run installer (PostgreSQL 14 or 15)
3. **IMPORTANT**: Remember the password you set for `postgres` user!
4. Default port: 5432 (keep default)
5. Verify installation:
```bash
psql --version  # Should show PostgreSQL 14.x or 15.x
```

### 1.3 Verify Git (usually pre-installed on Windows 11)

```bash
git --version
```

If not installed, download from: https://git-scm.com/

---

## 2. Database Setup

### 2.1 Create Database

**Option A: Using pgAdmin (GUI)**

1. Open pgAdmin (installed with PostgreSQL)
2. Connect to local PostgreSQL server (enter your password)
3. Right-click "Databases" → "Create" → "Database"
4. Name: `sme_investor_db`
5. Click "Save"

**Option B: Using Command Line**

```bash
# Open Command Prompt or PowerShell as Administrator

# Connect to PostgreSQL
psql -U postgres

# Enter your PostgreSQL password when prompted

# Create database
CREATE DATABASE sme_investor_db;

# Verify
\l  # List all databases, you should see sme_investor_db

# Exit
\q
```

### 2.2 Apply Schema

```bash
# Navigate to project directory
cd C:\Users\Administrator\Desktop\Projects\SMEs

# Apply schema
psql -U postgres -d sme_investor_db -f database/schema.sql

# Enter password when prompted
```

**Expected output:**
```
CREATE EXTENSION
CREATE EXTENSION
DROP TABLE
DROP TABLE
...
CREATE TABLE
CREATE TABLE
...
INSERT 0 1
```

### 2.3 Verify Schema

```bash
psql -U postgres -d sme_investor_db

# List tables
\dt

# Should show:
# - my_apis
# - public_apis
# - proposals
# - generated_apps
# - sessions
# - collection_logs
# - schema_version

# Exit
\q
```

---

## 3. Project Configuration

### 3.1 Install Dependencies

```bash
cd C:\Users\Administrator\Desktop\Projects\SMEs\backend
npm install
```

**Expected output:**
```
added 180 packages in 45s
```

### 3.2 Configure Environment Variables

```bash
# Copy template
copy ..\.env.example ..\.env

# Open .env file in your editor (VSCode, Notepad++, etc.)
notepad ..\.env
```

### 3.3 Essential Configuration

**CRITICAL: Update these values in `.env`**

```env
# ============================================
# REQUIRED: data.go.kr Account
# ============================================
DATAGOER_EMAIL=your_actual_email@example.com
DATAGOER_PASSWORD=your_actual_password

# ============================================
# REQUIRED: Database Connection
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sme_investor_db
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE  # ← Change this!

# ============================================
# REQUIRED: Security Keys
# ============================================
# Generate these with commands below
```

### 3.4 Generate Security Keys

**Open PowerShell and run:**

```powershell
cd C:\Users\Administrator\Desktop\Projects\SMEs\backend

# Generate JWT Secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption Key (exactly 32 chars)
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(16).toString('hex'))"

# Generate Encryption IV (exactly 16 chars)
node -e "console.log('ENCRYPTION_IV=' + require('crypto').randomBytes(8).toString('hex'))"
```

**Copy the output and paste into `.env` file:**

```env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
ENCRYPTION_KEY=1234567890abcdef1234567890abcdef
ENCRYPTION_IV=1234567890abcdef
```

### 3.5 Optional: LLM Configuration (for Phase 2)

If you want to use service proposal features (Phase 2), add:

```env
OPENAI_API_KEY=sk-...your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview
```

---

## 4. Initial Data Collection

### 4.1 First-Time Collection (REQUIRED)

**⚠️ This step is MANDATORY before running the server!**

```bash
cd C:\Users\Administrator\Desktop\Projects\SMEs\backend
npm run collect:init
```

### 4.2 What to Expect

**Phase 1: Session Pool Initialization (1-2 minutes)**
```
[SessionPool] Initializing with 5 sessions...
[Login] Attempt 1/5...
[Login] Navigating to https://www.data.go.kr/member/login.do...
[Login] Entering credentials...
[Login] Captcha detected, attempting OCR...
[OCR] Recognized: "XY7K2M" (Confidence: 0.89, Duration: 1234ms)
✅ [Login] Success! (Duration: 5678ms)
✅ [SessionPool] Session sess_abc123 created
```

**Phase 2: My APIs Collection (2-5 minutes)**
```
[Step 3/4] Collecting My APIs (96 authenticated APIs)...
[AuthAPICollector] Navigating to https://www.data.go.kr/mypage/myapi.do...
[AuthAPICollector] Extracted 96 APIs from page
[AuthAPICollector] Saving to database...
✅ My APIs Collection Complete:
   Total extracted: 96
   Successfully saved: 96
   Errors: 0
   Duration: 3.2s
```

**Phase 3: Public APIs Collection (20-40 minutes)**
```
[Step 4/4] Collecting Public APIs (11,992 open APIs)...
[PublicAPICollector] Page 1/120 - 100 APIs (Total: 100/11992)
[PublicAPICollector] Page 2/120 - 100 APIs (Total: 200/11992)
...
[PublicAPICollector] Page 120/120 - 92 APIs (Total: 11992/11992)
✅ Public APIs Collection Complete:
   Total extracted: 11992
   Successfully saved: 11992
   Errors: 0
   Duration: 28.5 minutes
```

**Summary:**
```
═══════════════════════════════════════════════════════════
  COLLECTION SUMMARY
═══════════════════════════════════════════════════════════
Total My APIs:        96
Total Public APIs:    11,992
Grand Total:          12,088
Total Duration:       32.7 minutes
Session Pool Status:  5 active sessions
═══════════════════════════════════════════════════════════

🎉 Initial collection completed successfully!
You can now start the main server with: npm start
```

### 4.3 If Collection Fails

**Common issues:**

1. **Login Failed**: Check `.env` credentials
2. **OCR Low Confidence**: Lower threshold in `.env`:
   ```env
   CAPTCHA_CONFIDENCE_THRESHOLD=0.70
   ```
3. **Network Timeout**: Increase timeout:
   ```env
   API_COLLECTION_TIMEOUT=300000
   ```
4. **Partial Collection**: Resume with:
   ```bash
   npm run collect:public-apis  # Resumes from where it stopped
   ```

---

## 5. Running the Server

### 5.1 Start Server

```bash
cd C:\Users\Administrator\Desktop\Projects\SMEs\backend
npm start
```

**Expected output:**
```
═══════════════════════════════════════════════════════════
  SME Investor Service - Starting Server
═══════════════════════════════════════════════════════════

[1/3] Connecting to database...
✅ Database connected

[2/3] Initializing session pool...
[SessionPool] Initializing with 5 sessions...
...
✅ Session pool initialized: 5/5 sessions

[3/3] Starting scheduled tasks...
✅ Public API refresh scheduled: 0 3 * * *
✅ My API refresh scheduled: 0 9 * * 1
✅ Schedulers started

═══════════════════════════════════════════════════════════
✅ Server running on port 3000
   Environment: development
   API Base URL: http://localhost:3000/api
   Health Check: http://localhost:3000/health
═══════════════════════════════════════════════════════════
```

### 5.2 Development Mode (Auto-restart)

```bash
npm run dev
```

Uses `nodemon` to auto-restart on file changes.

---

## 6. Verification

### 6.1 Health Check

**Open new terminal/PowerShell:**

```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T08:00:00.000Z",
  "database": "connected",
  "sessionPool": {
    "total": 5,
    "active": 5,
    "available": 4
  }
}
```

### 6.2 Check My APIs

```bash
curl http://localhost:3000/api/my-apis?limit=5
```

### 6.3 Check Public APIs

```bash
curl http://localhost:3000/api/public-apis?limit=5
```

### 6.4 Check Statistics

```bash
curl http://localhost:3000/api/stats
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "total_my_apis": "96",
    "active_my_apis": "96",
    "total_public_apis": "11992",
    "total_categories": "42",
    "total_providers": "156"
  }
}
```

### 6.5 Database Verification

```bash
psql -U postgres -d sme_investor_db

-- Check counts
SELECT 'My APIs' as table_name, COUNT(*) FROM my_apis
UNION ALL
SELECT 'Public APIs', COUNT(*) FROM public_apis;

-- Should show:
--  table_name   | count
-- --------------+-------
--  My APIs      |    96
--  Public APIs  | 11992

\q
```

---

## 7. Common Issues

### Issue 1: Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Option A: Kill process using port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Option B: Change port in .env
PORT=3001
```

### Issue 2: PostgreSQL Connection Refused

**Error:**
```
Unable to connect to PostgreSQL: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
```bash
# Check if PostgreSQL is running
sc query postgresql-x64-14

# If not running, start it
net start postgresql-x64-14

# Verify with psql
psql -U postgres -d sme_investor_db -c "SELECT 1"
```

### Issue 3: Module Not Found

**Error:**
```
Cannot find module 'express'
```

**Solution:**
```bash
cd C:\Users\Administrator\Desktop\Projects\SMEs\backend
npm install
```

### Issue 4: Session Pool Initialization Failed

**Error:**
```
Failed to initialize any sessions
```

**Solution:**
1. Check `.env` credentials for data.go.kr
2. Verify network connection
3. Try headless = false:
   ```env
   PUPPETEER_HEADLESS=false
   ```
4. Check if data.go.kr is accessible: https://www.data.go.kr/

### Issue 5: OCR Recognition Failed

**Error:**
```
Low OCR confidence (0.45), retrying...
```

**Solution:**
```env
# Lower confidence threshold
CAPTCHA_CONFIDENCE_THRESHOLD=0.60

# Increase retries
SESSION_MAX_RETRIES=10
```

---

## 🎉 Success Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `sme_investor_db` created
- [ ] Schema applied successfully
- [ ] Node.js dependencies installed
- [ ] `.env` file configured with real credentials
- [ ] Security keys generated and added to `.env`
- [ ] Initial collection completed (12,088 APIs)
- [ ] Server starts without errors
- [ ] Health check returns `"status": "healthy"`
- [ ] API endpoints return data

**If all checkboxes are ✅, you're ready to proceed with Phase 2 and Phase 3!**

---

## 📞 Next Steps

### For Phase 2 (Service Proposals):
- Configure LLM API (OpenAI)
- Implement external research modules
- Create proposal dashboard UI

### For Phase 3 (App Generation):
- Implement API analyzer
- Implement DB designer
- Implement code generators
- Implement security validation

---

## 📚 Additional Resources

- [README.md](README.md) - Complete documentation
- [Design Document](.claude/plans/harmonic-stirring-blossom.md) - System architecture
- [Database Schema](database/schema.sql) - DB structure
- [Skills Documentation](.claude/skills/SME-PROJECT-SKILLS.md) - Skills reference

---

**Support**: If you encounter issues not covered here, check collection logs:
```bash
psql -U postgres -d sme_investor_db

SELECT * FROM collection_logs
WHERE status = 'failed'
ORDER BY timestamp DESC
LIMIT 10;
```
