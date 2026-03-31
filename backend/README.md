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

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/set-plan` | Set user plan (requires `X-Admin-Secret` header) |
| POST | `/api/v1/admin/reset-usage` | Reset monthly usage for a user |
| GET | `/api/v1/admin/users` | List all users |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed health with DB |

## Usage Limits

| Plan | Minutes/Month | Price |
|------|---------------|-------|
| Free | 120 | $0 |
| Pro | 300 | $9.99 |
| Business | Unlimited | $24.99 |

## Deployment

### Self-hosted VPS with Docker (Current)

Murmullo backend runs on a Hetzner VPS using Docker containers.

```bash
# Build and run the API container
docker build -t murmullo-api ./backend
docker run -d \
  --name murmullo-api \
  --env-file ./backend/.env \
  -p 127.0.0.1:3001:3001 \
  --restart unless-stopped \
  murmullo-api

# PostgreSQL runs in a separate container
# Connect via DATABASE_URL in the .env
```

### Alternative: Render

1. Fork or push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" > "Blueprint"
4. Connect your GitHub repo and select the `backend` folder
5. Render will read `render.yaml` and create the services
6. Add your API keys in the Environment section
7. Deploy

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment | No |
| `DATABASE_URL` | PostgreSQL URL | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `ADMIN_SECRET` | Secret for admin endpoints | Yes |
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
4. Enter your backend URL (e.g., `https://murmullo-api.luminaconsulting.ai`)
5. Click "Conectar"
6. Login or register an account

**Note for Production**: Update the CSP in `main.js` to allow connections to your backend URL:

```javascript
// In setupContentSecurityPolicy(), add your backend domain:
"connect-src 'self' https://api.openai.com https://api.anthropic.com https://murmullo-api.luminaconsulting.ai"
```
