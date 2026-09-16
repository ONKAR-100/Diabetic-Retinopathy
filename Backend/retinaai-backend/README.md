# RetinaAI Backend

## Setup

1. Create a virtual environment and install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment:
Rename `.env.example` to `.env` and set your paths correctly.

3. Setup Database (Requires PostgreSQL running):
Create a DB `retinaai` and run migrations or let SQLAlchemy create the tables automatically (which it does in `main.py`).

Seed the database:
```bash
python database/seed.py
```

4. Run the server:
```bash
uvicorn main:app --reload
```

## Architecture
- FastAPI
- PostgreSQL + SQLAlchemy
- PyTorch + timm + segmentation_models_pytorch
- ThreadPoolExecutor for parallel AI pipelines
