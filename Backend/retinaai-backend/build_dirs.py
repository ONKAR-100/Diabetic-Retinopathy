import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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
