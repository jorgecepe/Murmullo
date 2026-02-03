# Murmullo Backend API

Backend API server for Murmullo voice dictation service.

## Features

- **Authentication**: JWT-based auth with refresh tokens
- **Transcription Proxy**: Secure proxy to OpenAI Whisper API
- **AI Processing**: Text correction via Claude/GPT
- **Usage Tracking**: Per-user usage limits and stats
- **Rate Limiting**: Protection against abuse

## Tech Stack

- Node.js 20+
- Express.js
- PostgreSQL
- JWT Authentication

## Quick Start

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Setup database

```bash
# Create PostgreSQL database
createdb murmullo

# Run migrations
npm run db:migrate
```

### 4. Start server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login user |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout user |
| GET | `/api/v1/auth/me` | Get current user |

### Transcription

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transcription` | Transcribe audio |
| GET | `/api/v1/transcription/usage` | Get usage stats |

### AI Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ai/process` | Process text with AI |
| POST | `/api/v1/ai/transcribe-and-process` | Combined endpoint |
| GET | `/api/v1/ai/providers` | List AI providers |

### User

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/user/profile` | Get profile |
| PUT | `/api/v1/user/profile` | Update profile |
| PUT | `/api/v1/user/password` | Change password |
| GET | `/api/v1/user/subscription` | Get subscription |
| DELETE | `/api/v1/user/account` | Delete account |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed health with DB |

## Usage Limits

| Plan | Minutes/Month | Price |
|------|---------------|-------|
| Free | 30 | $0 |
| Pro | 300 | $9.99 |
| Business | Unlimited | $24.99 |

## Deployment

### Render (Recommended)

**Option 1: Using Blueprint (Easiest)**

1. Fork or push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" > "Blueprint"
4. Connect your GitHub repo and select the `backend` folder
5. Render will read `render.yaml` and create:
   - Web service for the API
   - PostgreSQL database
   - Auto-generated JWT secrets
6. Add your API keys in the Environment section:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
7. Deploy!

**Option 2: Manual Setup**

1. Create a PostgreSQL database on Render
2. Create a new Web Service
3. Connect GitHub repo, set root directory to `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables (see below)
7. Deploy

### Railway

1. Create new project on [Railway](https://railway.app)
2. Add PostgreSQL service
3. Connect GitHub repo
4. Set root directory to `backend`
5. Add environment variables
6. Deploy

### Vercel (Serverless)

Not recommended for this backend due to:
- Long-running transcription requests
- PostgreSQL connection pooling needs
- WebSocket requirements for future features

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment | No |
| `DATABASE_URL` | PostgreSQL URL | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `CORS_ORIGIN` | Allowed origins | No |

## Security

- All API keys are stored server-side only
- JWT tokens expire in 7 days
- Refresh tokens expire in 30 days
- Rate limiting on all endpoints
- Input validation with express-validator
- Helmet.js for security headers

## Connecting Electron App

After deploying, update the Electron app to connect:

1. Open Murmullo Control Panel
2. Go to "Cuenta" (Account) tab
3. Enable "Modo de conexión" (online mode)
4. Enter your backend URL (e.g., `https://murmullo-api.onrender.com`)
5. Click "Conectar"
6. Login or register an account

**Note for Production**: Update the CSP in `main.js` to allow connections to your backend URL:

```javascript
// In setupContentSecurityPolicy(), add your backend domain:
"connect-src 'self' https://api.openai.com https://api.anthropic.com https://your-backend.onrender.com"
```
