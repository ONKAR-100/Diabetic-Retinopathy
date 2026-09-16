# RetinaAI — DR Screening Workstation

Production-style React + TypeScript + Vite frontend prototype for SIH 26038.

## Run

```bash
npm install
npm run dev
```

Open the URL shown by Vite. The demo login accepts any values.

## Environment

Create `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

The current frontend uses mock services in `src/services/api.ts`. Replace these methods with FastAPI calls when the models are ready.

## API seams

- POST `/api/screenings`
- POST `/api/images/upload`
- POST `/api/quality/check`
- POST `/api/dr/predict`
- POST `/api/evidence/analyze`
- POST `/api/explainability`
- POST `/api/reports`
- GET `/api/patients/:id`
- GET `/api/screenings/:id`

## Design system

The UI uses a healthcare-focused clinical-minimal design system inspired by UI/UX Pro Max principles: readable typography, high-contrast status communication, evidence-first layouts, restrained motion, accessible controls, and mobile-safe responsive behavior.

## Medical UX

The app uses AI-assisted screening terminology and does not present mock model confidence as clinical certainty. Results require human review before being treated as a final screening report.
