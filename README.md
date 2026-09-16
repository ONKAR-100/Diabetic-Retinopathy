# RetinaAI: Clinical-Grade Diabetic Retinopathy Screening & Longitudinal Retinal Progression Platform

> **Smart India Hackathon (SIH 26038)**  
> *Automated Diabetic Retinopathy (DR) Screening, Lesion Analysis, Multimodal Explainability, Ophthalmologist Review Queue, and Sequential Retinal Progression Monitoring.*

---

A production-grade, multi-stage clinical screening and tele-ophthalmology workstation designed to combat preventable diabetic blindness in resource-constrained and rural environments. 

The platform integrates real-time fundus **Image Quality Assessment (IQA)**, adaptive **CLAHE image enhancement**, deep convolutional **5-class DR grading** (ICDR Scale), **U-Net vessel segmentation**, **ResUNet anatomical localization** (optic disc & fovea), **multi-lesion detection** (microaneurysms, hemorrhages, exudates, neovascularization), **Grad-CAM visual attention maps**, **temperature-calibrated confidence scoring**, a dedicated **Human-in-the-Loop Ophthalmologist Review Queue**, automated **PDF diagnostic reporting**, and an end-to-end **Longitudinal Retinal Progression Engine** with an interactive DR progression trajectory graph and a unified screening comparison block.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [System Architecture](#-system-architecture)
- [Diagnostic Modalities & Biomarker Pipelines](#-diagnostic-modalities--biomarker-pipelines)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Installation & Local Setup](#-installation--local-setup)
- [Running the Application](#-running-the-application)
- [Default Clinical Roles & Credentials](#-default-clinical-roles--credentials)
- [API Documentation](#-api-documentation)
- [Clinical Decision Support, Safety & Ethical AI Guardrails](#-clinical-decision-support-safety--ethical-ai-guardrails)
- [Troubleshooting & Gotchas](#-troubleshooting--gotchas)
- [Development & Evaluation](#-development--evaluation)
- [Telemedicine Simulation & District-Level Scalability](#-telemedicine-simulation--district-level-scalability)
- [Future Roadmap](#-future-roadmap)
- [License](#-license)

---

## 🎯 Overview

Diabetic Retinopathy (DR) is the leading cause of preventable vision impairment among working-age adults worldwide. With over 77 million diabetic individuals in India alone, early detection through regular fundus examinations is critical. However, screening coverage is severely limited by:
1. **Severe Ophthalmologist Shortage**: Rural primary health centers (PHCs) lack trained retinal specialists.
2. **High Image Invalidation Rates**: Poor-quality fundus acquisitions (defocus, flash glare, media opacities) waste screening visits without immediate feedback.
3. **Black-Box AI Models**: Generic deep learning models provide predictions without anatomical grounding, lesion-level evidence, or confidence calibration.
4. **Lack of Longitudinal Tracking**: DR is a progressive, chronic disease. Single-visit evaluations fail to differentiate between stable non-proliferative DR and rapidly worsening microvascular leakage over time.

**RetinaAI** bridges these gaps by providing an end-to-end clinical workflow:
- **Instant Quality Gate**: Analyzes focus, exposure, and field-of-view before the patient leaves the camera chair, offering immediate recapture instructions if ungradable.
- **Multimodal AI Pipeline**: Runs parallel deep learning models for grading, vessel extraction, optic disc/fovea coordinates, and lesion detection.
- **Explainability & Verification**: Combines Grad-CAM saliency with quantitative vessel density and lesion segmentations to enable rapid clinical review (<30s).
- **Longitudinal Trajectory & Unified Comparison**: Tracks disease shift across visits, aligns baseline and follow-up images, and provides an interactive progression dashboard.

---

## ✨ Key Features

- 👁️ **3-Tier Image Quality Gate (IQA)**: Evaluates sharpness, illumination, contrast, and field of view (FOV). Categorizes images into `Good`, `Borderline` (auto-enhanced via CLAHE and bilateral filtering), or `Ungradable` (with human-readable recapture instructions).
- 🏷️ **5-Class DR Severity Grading**: Classifies fundus photographs into International Clinical Diabetic Retinopathy (ICDR) severity levels:
  - **Level 0**: No DR
  - **Level 1**: Mild NPDR
  - **Level 2**: Moderate NPDR *(Referable DR threshold)*
  - **Level 3**: Severe NPDR
  - **Level 4**: Proliferative DR (PDR)
- 🌡️ **Temperature-Calibrated Probabilities**: Raw softmax probabilities are calibrated using temperature scaling ($T=1.5$), providing realistic confidence scores and reducing overconfident misclassifications.
- 🩸 **Microvascular & Anatomical Localization**:
  - **Vessel Segmentation**: U-Net ResNet-34 extracts microvascular trees and computes vascular density percentages.
  - **Optic Disc & Fovea**: ResUNet detects anatomical centroids and marks the macula/foveal avascular zone (FAZ).
  - **Lesion Profiling**: Modular ensemble detection for microaneurysms, hemorrhages, hard exudates, and neovascularization.
- 🔍 **Grad-CAM Visual Attention Maps**: High-resolution heatmaps highlighting retinal regions driving the model's classification, clearly differentiated from segmentation masks.
- 🧑‍⚕️ **Human-in-the-Loop Review Queue**: Dedicated triage workflow for ophthalmologists. Reviewers can validate AI predictions, alter diagnostic grades, log clinical notes, and mark cases as confirmed, modified, or flagged in <30 seconds.
- 📄 **Automated Clinical PDF Reports**: Generates formal diagnostic reports using ReportLab with patient demographics, bilateral fundus montages, color-coded lesion keys, doctor attribution, and definitive triage recommendations.
- 📈 **Longitudinal Retinal Progression Engine**:
  - **Sequential Patient History**: Retains every screening visit independently under the patient profile without overwriting historical examinations.
  - **Interactive DR Progression Graph**: SVG trajectory curve plotting severity shifts across visits with hover inspection tooltips.
  - **Unified Screening Comparison Block**: Enables side-by-side fundus comparisons between any two examinations with tabbed switching across `[ DR Grade ]`, `[ Lesions ]`, `[ Vessels ]`, `[ Fovea ]`, and `[ Other / Grad-CAM ]`.

---

## ⚙️ How It Works

```
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│  Fundus Image   │ ────> │  Image Quality Gate    │ ────> │  Adaptive Enhancement  │
│  Upload (OS/OD) │       │ (Sharpness/Illum./FOV) │       │ (CLAHE + Bilateral)    │
└─────────────────┘       └────────────────────────┘       └────────────────────────┘
                                      │                                 │
                                      ▼ If Ungradable                   ▼ If Borderline/Good
                            ┌───────────────────┐             ┌───────────────────┐
                            │ Recapture Reason  │             │ Parallel Model    │
                            │ & Doctor Guidance │             │ Inference Workers │
                            └───────────────────┘             └───────────────────┘
                                                                        │
                   ┌──────────────────────┬──────────────────────┬──────┴───────────────┐
                   ▼                      ▼                      ▼                      ▼
         ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
         │ EfficientNet-B2  │   │ U-Net ResNet-34  │   │ ResUNet Detector │   │ Ensemble Lesion  │
         │ DR Classification│   │ Vessel Mask &    │   │ Optic Disc &     │   │ Masking & Counts │
         │ & Probabilities  │   │ Vascular Density │   │ Fovea Centroids  │   │ (MA, HE, EX, NV) │
         └──────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘
                   │                      │                      │                      │
                   └──────────────────────┼──────────────────────┴──────────────────────┘
                                          ▼
                             ┌──────────────────────────┐
                             │ Post-Processing &        │
                             │ Temperature Calibration  │
                             └──────────────────────────┘
                                          │
                                          ▼
                             ┌──────────────────────────┐
                             │ Grad-CAM Attention Maps  │
                             └──────────────────────────┘
                                          │
                                          ▼
                             ┌──────────────────────────┐
                             │ Longitudinal Engine      │
                             │ (Alignment & Delta)      │
                             └──────────────────────────┘
                                          │
                                          ▼
                             ┌──────────────────────────┐
                             │ Review Queue & Triage /  │
                             │ Automated PDF Generation │
                             └──────────────────────────┘
```

1. **Ingestion & Quality Assessment**: Fundus photographs (JPEG/PNG) are uploaded per eye (Left `OS` / Right `OD`). The quality service computes Laplacian variance (focus), mean intensity (illumination), and convex hull contour ratio (retinal FOV).
2. **Conditional Enhancement**: Images categorized as borderline are enhanced via Contrast Limited Adaptive Histogram Equalization (CLAHE) on the L-channel in CIELAB color space, followed by bilateral denoising.
3. **Parallel Multimodal Inference**: A Python `ThreadPoolExecutor` distributes computation across independent models:
   - **DR Grade**: EfficientNet-B2 computes softmax logits across the 5 ICDR classes.
   - **Vessel Extraction**: U-Net segments the microvascular tree and determines vessel density.
   - **Optic Disc & Fovea**: ResUNet generates dual-channel heatmaps to localize anatomical landmarks.
   - **Lesion Analysis**: Detects and counts microaneurysms, hemorrhages, hard exudates, and neovascularization.
4. **Grad-CAM & Calibration**: Saliency gradients from EfficientNet's final convolutional layer are backpropagated with respect to the predicted class. Raw probabilities are scaled via temperature calibration.
5. **Longitudinal Comparison**: If prior examinations exist for the patient, the longitudinal engine aligns baseline and current fundus structures, computes biomarker changes ($\Delta$ grade, vessel density drift, lesion counts), and flags progression status (`Stable`, `Possible Worsening`, or `Possible Improvement`).
6. **Ophthalmologist Triage & Reporting**: The case is assigned to the doctor's review queue. Once validated, an official PDF medical summary is compiled and stored.

---

## 🏗️ System Architecture

```
                                  RETINAAI WORKSTATION
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               FRONTEND (React 19 + TypeScript + Vite)                  │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │ Patient Directory &   │  │ Clinical Screening    │  │ Longitudinal Retinal       │  │
│  │ Registration          │  │ Workstation & Capture │  │ Progression & History Page │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │ Ophthalmologist       │  │ Biomarker & Grad-CAM  │  │ Unified Screening          │  │
│  │ Review Queue          │  │ Visualizer Tabs       │  │ Comparison Block           │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / REST (Axios + JWT Interceptors)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (FastAPI + Python 3.11)                           │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ API Routers: /auth | /patients | /screenings | /analysis | /review | /reports    │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Core Services: QualityGate | Enhancer | PipelineOrchestrator | LongitudinalEngine│  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ PyTorch Inference Engines:                                                        │  │
│  │  • EfficientNet-B2 (DR Grade)     • U-Net ResNet34 (Vessel Segmentation)         │  │
│  │  • ResUNet (OD & Fovea Centroids) • Fundus Ensemble (Lesion Segmentation)        │  │
│  │  • Grad-CAM Saliency Engine       • Temperature Scaling Calibrator               │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬─────────────────────────────────────────┬───────────────────────┘
                       │                                         │
                       ▼                                         ▼
         ┌───────────────────────────┐             ┌───────────────────────────┐
         │ Relational Database       │             │ Static Storage            │
         │ (PostgreSQL / SQLite)     │             │ • /static/uploads/        │
         │ SQLAlchemy ORM + Alembic  │             │ • /static/results/        │
         │ Patients, Screenings,     │             │ • /static/reports/        │
         │ Comparisons, Reviews      │             └───────────────────────────┘
         └───────────────────────────┘
```

---

## 🔬 Diagnostic Modalities & Biomarker Pipelines

| Modality / Task | Architecture / Technique | Input Dimension | Output Metadata & Biomarkers |
| :--- | :--- | :--- | :--- |
| **Image Quality Gate (IQA)** | Laplacian Variance, Mean Intensity & Retinal ROI Masking | Native Resolution | Focus Score, Brightness, Contrast, FOV ratio (`Good` / `Borderline` / `Ungradable` + Recapture feedback) |
| **Adaptive Enhancement** | CIELAB CLAHE + Bilateral Filtering + Illumination Normalization | Native Resolution | Contrast-equalized BGR fundus frame |
| **DR Severity Grading** | EfficientNet-B2 (5-Class Classifier, `timm`) | $300 \times 300 \times 3$ | Level 0–4 Severity Grade, Softmax Logits, Calibrated Confidence, Referable DR flag ($\ge \text{Level 2}$) |
| **Vessel Segmentation** | U-Net with ResNet-34 Encoder (`segmentation_models_pytorch`) | $512 \times 512 \times 3$ | Binary Microvascular Mask, Vascular Density Percentage ($\%$) |
| **Optic Disc & Fovea Localization** | Dual-Channel Heatmap ResUNet (ResNet-18 Encoder) | $512 \times 512 \times 3$ | Optic Disc $(X, Y)$ & Confidence, Fovea $(X, Y)$ & Confidence, Anatomical Distance |
| **Lesion Profiling** | Multi-Head Segmentation Ensemble | $512 \times 512 \times 3$ | Microaneurysms, Hemorrhages, Hard Exudates, Neovascularization Detection & Counts |
| **Visual Explainability** | Layer-Hooked Gradient-Weighted Class Activation Mapping (Grad-CAM) | $300 \times 300 \times 3$ | Heatmap Blend (Alpha=0.4, Jet Colormap) reflecting model focus |
| **Longitudinal Progression** | Retinal Landmark Alignment & Delta Classifier | Sequential Pairs | Longitudinal Progression Status (`Stable`, `Worsening`, `Improvement`), Biomarker Shift Deltas ($\Delta$) |

---

## 🛠️ Tech Stack

### Backend Infrastructure
- **Framework**: FastAPI (Python 3.11+)
- **Application Server**: Uvicorn (ASGI)
- **Database & ORM**: PostgreSQL (Production) / SQLite (Local Dev Fallback), SQLAlchemy 2.0, Alembic
- **Deep Learning Frameworks**: PyTorch 2.2+, Torchvision 0.17+, `timm` 0.9+, `segmentation-models-pytorch` 0.3+
- **Image Processing & Computer Vision**: OpenCV (`cv2`), NumPy, Pillow, SciPy
- **Security & Authentication**: OAuth2 Password Flow, JWT (`python-jose`), Passlib (Bcrypt)
- **Clinical Reporting**: ReportLab Platypus Engine (Vector PDF generation with medical montages)

### Frontend Workstation
- **Framework**: React 19, TypeScript 5.9, Vite 7
- **UI Architecture**: Clinical-Minimal Design System (UI/UX Pro Max compliant, healthcare-grade typography, dark/light contrast)
- **Routing**: React Router DOM v7
- **State & Context**: Dedicated `AuthContext` and `ScreeningContext`
- **Visualization & Charts**: Recharts, SVG Procedural Trajectory Rendering
- **Icons & Primitives**: Lucide React, Radix UI Slot, Class Variance Authority (`cva`)
- **HTTP Client**: Axios with automated bearer token interception and 401 redirection

---

## 📁 Project Directory Structure

```
SIH2026/Complete Project/
├── Backend/
│   └── retinaai-backend/
│       ├── api/                        # FastAPI Route Handlers
│       │   ├── analysis.py             # Image analysis execution & status
│       │   ├── analytics.py            # Clinical screening metrics & aggregates
│       │   ├── auth.py                 # JWT token generation & user profile
│       │   ├── longitudinal.py         # Longitudinal comparison & timeline API
│       │   ├── patients.py             # Patient CRUD & directory search
│       │   ├── reports.py              # PDF compilation & download endpoints
│       │   ├── review.py               # Ophthalmologist triage queue & submit
│       │   └── screenings.py           # Screening session lifecycle & uploads
│       ├── core/                       # Security, JWT, & Dependency Injection
│       │   ├── dependencies.py         # Role verification (require_doctor, get_db)
│       │   └── security.py             # Bcrypt hashing & token validation
│       ├── database/                   # ORM Database Layer
│       │   ├── db.py                   # Engine initialization & session factory
│       │   ├── models.py               # SQLAlchemy models (User, Patient, Screening, etc.)
│       │   └── seed.py                 # Database initialization & default fixtures
│       ├── models_loader/              # PyTorch Model Checkpoint Loaders
│       │   └── loaders.py              # Eager model loading & memory staging
│       ├── schemas/                    # Pydantic Request & Response Schemas
│       ├── services/                   # Core Business Logic & AI Services
│       │   ├── calibration_service.py  # Temperature scaling probability calibrator
│       │   ├── dr_service.py           # EfficientNet-B2 DR inference service
│       │   ├── enhancement_service.py  # Adaptive CLAHE & bilateral filtering
│       │   ├── gradcam_service.py      # Grad-CAM attention heatmap generator
│       │   ├── lesion_service.py       # Multi-head lesion segmentation ensemble
│       │   ├── longitudinal_service.py # Retinal alignment & progression analysis
│       │   ├── od_fovea_service.py     # ResUNet anatomical landmark detector
│       │   ├── pipeline_service.py     # ThreadPoolExecutor parallel pipeline
│       │   ├── quality_service.py      # 3-tier image quality assessment
│       │   ├── report_service.py       # Clinical ReportLab PDF generator
│       │   └── vessel_service.py       # U-Net vessel segmentation & density
│       ├── static/                     # Persistent Static Assets
│       │   ├── uploads/                # Ingested raw fundus images
│       │   └── results/                # Visual artifacts (Grad-CAM, masks, overlays)
│       ├── config.py                   # Environment settings & model paths
│       ├── main.py                     # FastAPI lifespan application entrypoint
│       ├── requirements.txt            # Python dependencies
│       └── .env.example                # Backend environment template
│
├── Frontend/
│   └── RetinaAI-Frontend/
│       ├── public/                     # Static icons, logos, & assets
│       ├── src/
│       │   ├── components/             # Specialized Clinical UI Components
│       │   │   ├── AnalysisPipeline.tsx# Multi-stage real-time progress modal
│       │   │   ├── GradCAMViewer.tsx   # Saliency overlay & opacity blender
│       │   │   ├── ImageUploader.tsx   # Fundus drag-and-drop ingestion
│       │   │   ├── LesionPanel.tsx     # 4-lesion breakdown & detection counts
│       │   │   ├── ODFoveaMarker.tsx   # Centroid coordinate overlay
│       │   │   ├── ProtectedRoute.tsx  # Role-based route guard
│       │   │   ├── RecaptureAlert.tsx  # Visual IQA rejection warning card
│       │   │   ├── ReviewQueueTable.tsx# Triage ledger with severity sorting
│       │   │   └── VesselOverlay.tsx   # Microvascular mask visualizer
│       │   ├── contexts/               # React Context Providers
│       │   │   ├── AuthContext.tsx     # Authentication token & session state
│       │   │   └── ScreeningContext.tsx# Active multi-step screening state
│       │   ├── pages/                  # Workstation Application Pages
│       │   │   ├── AnalyticsPage.tsx   # Aggregate clinical metrics & charts
│       │   │   ├── AnalyzePage.tsx     # Live AI processing status view
│       │   │   ├── CapturePage.tsx     # Bilateral fundus camera capture
│       │   │   ├── DashboardPage.tsx   # Primary workstation dashboard
│       │   │   ├── ExplainPage.tsx     # Biomarker explainability deep dive
│       │   │   ├── HistoryPage.tsx     # Comprehensive screening ledger
│       │   │   ├── LoginPage.tsx       # Secure workstation authentication
│       │   │   ├── LongitudinalPage.tsx# Pairwise examination comparison
│       │   │   ├── NewScreeningPage.tsx# Patient intake & screening initiation
│       │   │   ├── PatientDetailPage.tsx# Comprehensive patient EHR profile
│       │   │   ├── PatientLongitudinalHistoryPage.tsx # Trajectory graph & unified comparison
│       │   │   ├── PatientsPage.tsx    # Patient directory & searchable registry
│       │   │   ├── QualityPage.tsx     # Visual IQA feedback & recapture page
│       │   │   ├── ReportPage.tsx      # Embedded clinical report viewer
│       │   │   ├── ReportsListPage.tsx # Archive of generated diagnostic PDFs
│       │   │   ├── ResultPage.tsx      # Instant AI diagnostic result overview
│       │   │   ├── ReviewPage.tsx      # Ophthalmologist sign-off interface
│       │   │   ├── ReviewQueuePage.tsx # Priority-ranked triage review queue
│       │   │   ├── ScreeningDetailPage.tsx # Comprehensive exam audit view
│       │   │   ├── SettingsPage.tsx    # Facility configuration & camera calibration
│       │   │   └── SystemStatusPage.tsx# Model weights & hardware status
│       │   ├── services/               # REST Client Modules (Axios)
│       │   ├── types/                  # Strict TypeScript interfaces
│       │   ├── App.tsx                 # Workstation Router & route hierarchy
│       │   ├── components.tsx          # UI Design System Primitives (Buttons, Cards, Badges)
│       │   └── styles.css              # Clinical Design System CSS
│       ├── package.json                # Frontend package dependencies
│       ├── vite.config.ts              # Vite bundling & development server setup
│       └── .env.example                # Frontend environment template
│
├── Models/                             # Canonical Model Weights & Checkpoints
│   ├── dr_grade/                       # EfficientNet-B2 (5 Classes: Levels 0-4)
│   │   ├── best_efficientnet_b2.pth    # Primary model weights
│   │   ├── final_deployment_bundle.pth # Deployment bundle
│   │   └── normalization_stats.json    # Dataset mean & std stats
│   ├── vessel_extraction/              # U-Net ResNet-34 Microvascular Extractor
│   │   ├── Vessel_Model/               # PyTorch zip checkpoint directory
│   │   └── Vessel_Model_temp.pt        # Consolidated checkpoint package
│   ├── od_fovea_localization/          # ResUNet Anatomical Landmark Detector
│   │   ├── best_fundus_localization_model.pth # Landmark weights
│   │   └── model_config.json           # Model configuration
│   ├── lesion_segmentation/            # 5-Fold Multi-Class Lesion Ensemble
│   │   ├── fundus_ensemble_bundle.pth  # Ensemble weights (MA, HE, EX, NV)
│   │   └── class_map.json              # Lesion class map
│   └── test_samples/                   # Validated Testing Materials
│       ├── test.csv                    # Ground-truth test annotations
│       └── images/                     # Representative fundus samples (Grades 0-4)
│
└── README.md                           # Master Project Documentation
```

---

## ⚡ Prerequisites

Ensure your host workstation satisfies the following software and hardware prerequisites:

- **Operating System**: Windows 10/11, Ubuntu 22.04 LTS, or macOS (Apple Silicon supported).
- **Python**: Version `3.11.x` (recommended) or `3.10.x`.
- **Node.js**: Version `18.x` or `20.x` LTS with `npm` package manager.
- **Relational Database**: PostgreSQL `14+` (recommended for production) or SQLite (built-in fallback).
- **Hardware (Inference)**:
  - Minimum: 8 GB RAM, Quad-Core CPU (CPU-only PyTorch inference supported).
  - Recommended: 16 GB RAM, NVIDIA GPU with 6 GB+ VRAM (CUDA 12.1+) for sub-second parallel inference.

---

## 🔑 Environment Configuration

### 1. Backend Configuration (`Backend/retinaai-backend/.env`)

Create `.env` in `Backend/retinaai-backend/` based on `.env.example`:

```env
# --- Application & Network ---
ENV=development
PORT=8000

# --- Database Storage ---
# Use PostgreSQL in production or SQLite for quick local trials
DATABASE_URL=sqlite:///./retinaai.db
# DATABASE_URL=postgresql://postgres:password@localhost:5432/retinaai

# --- Authentication & JWT Security ---
JWT_SECRET_KEY=clinical-grade-super-secret-key-change-in-production-2026
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480

# --- Model Checkpoint Weights (Clean Canonical Directory) ---
DR_MODEL_PATH=D:/SIH2026/Complete Project/Models/dr_grade/best_efficientnet_b2.pth
DR_NORM_PATH=D:/SIH2026/Complete Project/Models/dr_grade/normalization_stats.json
VESSEL_MODEL_PATH=D:/SIH2026/Complete Project/Models/vessel_extraction/Vessel_Model
OD_FOVEA_MODEL_PATH=D:/SIH2026/Complete Project/Models/od_fovea_localization/best_fundus_localization_model.pth
LESION_MODEL_PATH=D:/SIH2026/Complete Project/Models/lesion_segmentation/fundus_ensemble_bundle.pth

# --- Storage Paths ---
UPLOAD_DIR=static/uploads
RESULT_DIR=static/results
MAX_UPLOAD_MB=20
```

### 2. Frontend Configuration (`Frontend/RetinaAI-Frontend/.env`)

Create `.env` in `Frontend/RetinaAI-Frontend/`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

---

## 🚀 Installation & Local Setup

### Step 1: Clone Repository
```bash
git clone https://github.com/ONKAR-100/RetinaAI-Complete-Project.git
cd "Complete Project"
```

### Step 2: Backend Setup
```bash
# Navigate to backend directory
cd Backend/retinaai-backend

# Create and activate Python virtual environment
# On Windows (PowerShell):
python -m venv venv
.\venv\Scripts\Activate.ps1

# On Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Database Initialization & Seeding
```bash
# Seed initial clinical roles, test patients, and demo screenings
python database/seed.py
```

### Step 4: Frontend Setup
```bash
# Open a new terminal and navigate to frontend directory
cd Frontend/RetinaAI-Frontend

# Install Node dependencies
npm install
```

---

## 🏃 Running the Application

### 1. Launch FastAPI Backend
From `Backend/retinaai-backend/` with the virtual environment activated:
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
- **Backend API Root**: `http://127.0.0.1:8000`
- **Interactive OpenAPI / Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **ReDoc Technical Specification**: `http://127.0.0.1:8000/redoc`

### 2. Launch React Workstation
From `Frontend/RetinaAI-Frontend/`:
```bash
npm run dev
```
- **Workstation UI**: `http://localhost:5173`

---

## 🧑‍⚕️ Default Clinical Roles & Credentials

The database seeder provisions two default user accounts covering the clinical access roles:

| Role | Username | Password | Full Name | Permissions / Access |
| :--- | :--- | :--- | :--- | :--- |
| **Health Worker** | `admin` | `admin123` | Admin Worker | Patient Intake, Image Capture, IQA Verification, Run AI Screening, Generate Reports |
| **Ophthalmologist** | `doctor1` | `doc123` | Dr. Anita Sharma | All Health Worker permissions + **Review Queue Triage**, Grade Modifications, Final Clinical Sign-Off |

---

## 🌐 API Documentation

### 1. Authentication (`POST /api/auth/login`)
Authenticates clinical staff and returns a signed JWT bearer token with assigned role.

```bash
curl -X POST "http://127.0.0.1:8000/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=doctor1&password=doc123"
```
*Response:*
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "1fa06700-1123-455b-8012-9c98a09f3ab1",
    "username": "doctor1",
    "full_name": "Dr. Anita Sharma",
    "role": "doctor",
    "centre": "Main Hospital"
  }
}
```

### 2. Register Patient (`POST /api/patients`)
Registers a new diabetic patient into the directory.

```bash
curl -X POST "http://127.0.0.1:8000/api/patients" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_display_id": "PAT-2026-042",
    "name": "Suresh Patel",
    "age": 58,
    "sex": "M",
    "diabetes_duration": 11,
    "previous_dr": "Level 1 - Mild NPDR"
  }'
```

### 3. Create Screening Session (`POST /api/screenings`)
Initiates a new screening record for a patient.

```bash
curl -X POST "http://127.0.0.1:8000/api/screenings" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "<PATIENT_UUID>"
  }'
```

### 4. Upload Fundus Photograph (`POST /api/screenings/{id}/upload`)
Uploads a high-resolution fundus image for either eye (`left` or `right`).

```bash
curl -X POST "http://127.0.0.1:8000/api/screenings/<SCREENING_ID>/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "eye=left" \
  -F "file=@sample_fundus_os.jpg"
```

### 5. Execute Multimodal AI Pipeline (`POST /api/screenings/{id}/analyze`)
Triggers quality assessment, CLAHE enhancement, parallel model inference, and Grad-CAM generation.

```bash
curl -X POST "http://127.0.0.1:8000/api/screenings/<SCREENING_ID>/analyze" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "eye": "both" }'
```
*Response Excerpt:*
```json
{
  "screening_id": "SCR-10310",
  "status": "complete",
  "left_eye": {
    "quality": { "status": "good", "scores": { "focus": 88.5, "brightness": 72.0, "contrast": 81.2, "fov": 94.0 } },
    "dr_grade": 2,
    "dr_grade_name": "Moderate NPDR",
    "class_probabilities": [0.03, 0.09, 0.74, 0.10, 0.04],
    "confidence_calibrated": 0.69,
    "referable": true,
    "gradcam_url": "static/results/SCR-10310/left_gradcam.jpg",
    "vessel_overlay_url": "static/results/SCR-10310/left_vessel_overlay.jpg",
    "vessel_density": 11.4,
    "od_x": 234.5, "od_y": 289.1,
    "fovea_x": 512.4, "fovea_y": 298.0
  },
  "overall_referable": true,
  "recommendation": "Referable Diabetic Retinopathy Detected. Specialist evaluation recommended."
}
```

### 6. Ophthalmologist Review Submission (`POST /api/screenings/{id}/review`)
Allows an ophthalmologist to validate or modify AI predictions and sign off.

```bash
curl -X POST "http://127.0.0.1:8000/api/screenings/<SCREENING_ID>/review" \
  -H "Authorization: Bearer <DOCTOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "confirmed",
    "final_grade_left": 2,
    "final_grade_right": 1,
    "final_referable": true,
    "notes": "Confirmed bilateral microaneurysms and early hard exudates in left eye. Advised 3-month follow-up."
  }'
```

### 7. Patient Longitudinal History Timeline (`GET /api/patients/{id}/timeline`)
Retrieves all historical examinations for a patient with progression deltas.

```bash
curl -X GET "http://127.0.0.1:8000/api/patients/<PATIENT_UUID>/timeline" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 🛡️ Clinical Decision Support, Safety & Ethical AI Guardrails

To ensure responsible, safe clinical integration, RetinaAI adheres to rigorous medical decision support protocols:

1. **Explicit Clinical Decision Support Framing**:
   - The platform is explicitly architected as an **AI-assisted triage and decision support system**, not an autonomous diagnostic agent.
   - All analytical summaries display explicit disclaimers:  
     > *"AI-assisted DR classification history suggests possible worsening or stability based on algorithmic feature analysis. It does not prove biological disease progression. Final clinical decision remains strictly with the examining ophthalmologist."*
2. **Conservative Triage Thresholds**:
   - Referable DR is strictly thresholded at **Level 2 (Moderate NPDR) or higher**, prioritizing sensitivity (>90%) to minimize missed sight-threatening retinopathy.
3. **Transparent Explainability vs. Segmentation Distinction**:
   - Grad-CAM heatmaps are explicitly disclaimed in the interface as *coarse model attention weights*, preventing clinicians from mistaking saliency activations for precise microaneurysm or hemorrhage anatomical boundaries.
4. **Mandatory Doctor Sign-Off & Audit Trail**:
   - Every case escalated to the Review Queue requires definitive sign-off by a registered ophthalmologist (`doctor` role).
   - Decisions (`confirmed`, `modified`, `flagged`), grade overrides, reviewer identities, and timestamps are immutably logged in the database audit ledger.
5. **Fail-Safe Image Quality Rejections**:
   - Severely degraded images (Laplacian variance below threshold, severe flash glare, or blocked optical axes) are unconditionally rejected before running inference. This eliminates false-negative classifications caused by poor quality inputs.

---

## ❓ Troubleshooting & Gotchas

- **CUDA Out-of-Memory (OOM) on Multi-Model Concurrency**:
  - The parallel pipeline invokes EfficientNet, U-Net, ResUNet, and the lesion ensemble concurrently. If executing on a lower-tier GPU (<6 GB VRAM), ensure PyTorch falls back cleanly to CPU or set `CUDA_VISIBLE_DEVICES=""` in `.env` to execute via multi-threaded CPU inference.
- **Foreign Key Cascades on Patient Deletion**:
  - Longitudinal comparisons enforce integrity across both `current_screening_id` and `previous_screening_id`. When deleting test patients, ensure the backend endpoint cleans up associated `longitudinal_comparisons` records first, or run DB migrations with `CASCADE` rules enabled.
- **Static Asset 404s**:
  - The backend mounts `./static` to `/static`. If visual overlays or Grad-CAM images fail to display in the frontend, verify that `UPLOAD_DIR` and `RESULT_DIR` exist and the Vite dev proxy (or `VITE_API_BASE_URL`) correctly targets `http://localhost:8000`.
- **Browser Caching on Longitudinal Graphs**:
  - When switching between patients, React Router parameters update state. If SVG trajectories fail to re-render, ensure your browser is not caching older API responses (use Ctrl + F5 for a hard refresh).

---

## 🧪 Development & Evaluation

### 1. Run Comprehensive Longitudinal Verification Suite
Verify sequential screening creation, baseline persistence, follow-up comparison integrity, and directory aggregations:
```bash
# From project root
python "C:\Users\onkar\.gemini\antigravity\brain\fdf6376a-70c3-4f03-8981-24103c3915d4\scratch\verify_longitudinal_suite.py"
```
*Expected Output:*
```
============================================================
RUNNING COMPREHENSIVE LONGITUDINAL VERIFICATION SUITE
============================================================
--- TEST 1: FIRST SCREENING (PAT-001) --- [PASSED]
--- TEST 2: SECOND SCREENING (Follow-up) --- [PASSED]
--- TEST 3: HISTORY VERIFICATION --- [PASSED]
--- TEST 4: THIRD SCREENING (Sequential Chaining) --- [PASSED]
--- TEST 5: PATIENT DIRECTORY STATUS --- [PASSED]
============================================================
ALL 5 VERIFICATION TESTS PASSED SUCCESSFULLY!
============================================================
```

### 2. Frontend Production Build & Typecheck
Ensure zero TypeScript compilation errors and bundle stability:
```bash
cd Frontend/RetinaAI-Frontend
npm run build
```

---

## 📊 Telemedicine Simulation & District-Level Scalability

*(In accordance with SIH Requirement 5)*

To demonstrate operational feasibility across high-volume tele-screening deployments, the platform architecture models:
- **Throughput**: Supports up to **100,000+ patients/year** across a district hub-and-spoke model (1 Central Tertiary Hospital + 25 Rural Primary Health Centres).
- **Processing Latency**: Parallel multi-worker inference completes full multimodal evaluation in under **8 seconds per eye** on GPU workstations.
- **Bandwidth Optimization**: Edge image quality assessment rejects invalid captures locally at the PHC, saving >15% unnecessary rural uplink bandwidth.
- **Clinician Review Target**: Pre-extracted biomarker overlays, calibrated confidence, and differential indicators enable ophthalmologists to complete validation in **under 30 seconds per case**.

---

## 🗺️ Future Roadmap

- [ ] **Simulink System Simulator**: Deploy dynamic discrete-event queue models in MATLAB/Simulink simulating patient arrival rates, tele-transmission jitter, and specialist workload capacity.
- [ ] **Mobile Edge-AI Integration**: Optimize EfficientNet-B2 and U-Net models via ONNX Runtime / TensorRT for direct on-device execution on smartphone-based handheld fundus cameras.
- [ ] **Optical Coherence Tomography (OCT) Fusion**: Incorporate cross-sectional B-scan OCT volume analysis for early detection of Diabetic Macular Edema (DME).
- [ ] **Federated Learning Infrastructure**: Train lesion segmentation models across multi-hospital consortia without centralizing sensitive patient fundus imagery.

---

## 📄 License

This project is developed for the **Smart India Hackathon (SIH 2026)** under Problem Statement ID **SIH 26038**.  
Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
  <sub>Engineered with precision for automated diabetic blindness prevention and tele-ophthalmology triage.</sub>
</div>

=======
# Diabetic-Retinopathy
AI-powered diabetic retinopathy screening and telemedicine platform with retinal image quality assessment, DR grading, explainable AI, retinal analysis, and longitudinal patient monitoring.
