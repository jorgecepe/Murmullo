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

### Railway

1. Create new project on Railway
2. Add PostgreSQL service
3. Connect GitHub repo
4. Set environment variables
5. Deploy

### Render

1. Create new Web Service
2. Connect GitHub repo
3. Add PostgreSQL database
4. Set environment variables
5. Deploy

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
