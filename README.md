# X-trafik Ticket Validation API

A Node.js/Express API service that validates tickets by calling X-trafik's REST API and returns the validation result to Collaktiv.

## Features

- Ticket validation via X-trafik API integration
- Client certificate authentication support
- Comprehensive logging
- Optional API key authentication
- Health check endpoint
- Error handling and validation

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Client certificate files for X-trafik API (if required)

## Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment variables template:

```bash
cp .env.example .env
```

3. Configure your `.env` file with the required values:

```env
XTRAFIK_BASE_URL=https://api.xtrafik.example.com
XTRAFIK_CLIENT_CERT=/path/to/client.crt
XTRAFIK_CLIENT_KEY=/path/to/client.key
PORT=3000
```

## Running the Application

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check

```bash
GET /health
```

Returns server status and timestamp.

### Validate Ticket

```bash
POST /api/validate-ticket
Content-Type: application/json

{
  "ticketId": "T123456789"
}
```

**Response (Success):**
```json
{
  "success": true,
  "ticketId": "T123456789",
  "status": "OK"
}
```

**Response (Error):**
```json
{
  "success": false,
  "ticketId": "T123456789",
  "status": "Rejected",
  "message": "Ticket not found"
}
```

**Status values:**
- `OK` - Ticket is valid
- `Rejected` - Ticket is invalid or not found
- `NotValidated` - Could not validate ticket (error occurred)

## CORS Configuration

The API supports Cross-Origin Resource Sharing (CORS) for frontend integration:

- **Development mode**: All origins are allowed for easier testing
- **Production mode**: Only origins specified in `CORS_ORIGINS` environment variable are allowed

To configure allowed origins in production, set:

```bash
CORS_ORIGINS=https://your-frontend-domain.com,https://app.your-frontend-domain.com
```

The API accepts requests with credentials and supports standard HTTP methods (GET, POST, PUT, DELETE, OPTIONS).

## X-trafik API Integration

The service integrates with X-trafik's REST API. The full API specification is available in `swagger.json`.

**Main endpoint used:**
- **GET** `/api/Tickets/{id}` - Retrieves ticket status
  - Returns: `{ id: string | null, result: 'OK' | 'Rejected' | 'NotValidated' }`
  - See `swagger.json` for complete API documentation

The integration uses client certificate authentication if certificate files are provided via `XTRAFIK_CLIENT_CERT` and `XTRAFIK_CLIENT_KEY` environment variables. Both must be set; if either is missing, no client certificate is sent and the X-trafik API may reject requests (e.g. 403 or visible in their logs as "client cert not set").

**Local:** Set paths in `.env` (e.g. `XTRAFIK_CLIENT_CERT=/path/to/client.crt`) or the full PEM content (including `-----BEGIN ... -----END`).

**Production (Fly.io):** Set cert and key as secrets. Use the **client certificate from Region Gävleborg (Magnus)** in `cert/` (client.crt, client.key), not the Sectigo cert—their IIS trusts the cert they issued. Use the command line with `$(cat file)` so newlines are preserved. From repo root:

```bash
cd backend
fly secrets set \
  XTRAFIK_BASE_URL="https://api-collaktiv.regiongavleborg.se" \
  XTRAFIK_PATH_PREFIX="/rest/collaktiv_api/api" \
  XTRAFIK_CLIENT_CERT="$(cat ../cert/client.crt)" \
  XTRAFIK_CLIENT_KEY="$(cat ../cert/client.key)" \
  -a collaktiv
```

Optionally add `XTRAFIK_CA_CERT` if you have a CA bundle to verify their server. Then deploy or let Fly restart so the app picks up the new secrets.

## Logging

The application uses Winston for logging. Logs are written to:
- `error.log` - Error level logs
- `combined.log` - All logs
- Console output (in development mode)

All API requests are logged with:
- IP address
- Timestamp
- Ticket ID
- Result/status
- Duration

## Error Handling

The API handles various error scenarios:

- **403** - Invalid client certificate (from X-trafik API)
- **404** - Ticket not found
- **500** - Server errors
- **502** - Bad Gateway (X-trafik API certificate issues)

## Development

### Type Checking

```bash
npm run type-check
```

### Project Structure

```
src/
  ├── index.ts           # Application entry point
  ├── app.ts             # Express app configuration
  ├── routes/
  │   └── tickets.ts     # Ticket validation routes
  ├── services/
  │   └── xtrafik-api.ts # X-trafik API client
  ├── middleware/
  │   ├── auth.ts        # API key authentication
  │   └── validation.ts  # Request validation
  ├── utils/
  │   └── logger.ts      # Winston logger setup
  └── types/
      └── index.ts       # TypeScript type definitions
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XTRAFIK_BASE_URL` | Yes | Base URL for X-trafik API |
| `XTRAFIK_PATH_PREFIX` | No | API path prefix (e.g. `/rest/collaktiv_api/api` for prod). Default `/api`. |
| `XTRAFIK_API_KEY` | No | Bearer token if X-trafik requires it (avoids 401 SecurityTokenValidationException). |
| `XTRAFIK_CLIENT_CERT` | No | Path to client certificate file or full PEM content |
| `XTRAFIK_CLIENT_KEY` | No | Path to client key file or full PEM content |
| `XTRAFIK_CA_CERT` | No | Path to CA bundle (e.g. My_CA_Bundle.ca-bundle) used to verify X-trafik's server certificate |
| `XTRAFIK_CLIENT_KEY_PASSPHRASE` | No | Passphrase for encrypted private key (if applicable) |
| `PORT` | No | Server port (default: 3000) |
| `CORS_ORIGINS` | No | Comma-separated list of allowed origins (e.g., `https://example.com,https://app.example.com`). In development mode, all origins are allowed. |
| `LOG_LEVEL` | No | Logging level (default: info) |
| `NODE_ENV` | No | Environment (development/production) |

## Testing

Example curl request:

```bash
curl -X POST http://localhost:3000/api/validate-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "T123456789"
  }'
```

## License

ISC

