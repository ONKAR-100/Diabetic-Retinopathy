import os

BASE_DIR = r"C:\Users\onkar\Projects\SIH2026\Backend\retinaai-backend"

directories = [
    "alembic/versions",
    "core",
    "database",
    "api",
    "services",
    "schemas",
    "models_loader",
    "static/uploads",
    "static/results",
]

for d in directories:
    os.makedirs(os.path.join(BASE_DIR, d), exist_ok=True)

print("Directories created successfully.")
