import numpy as np
import time

from config import settings
from services.quality_service import QualityService
from services.enhancement_service import EnhancementService
from services.dr_service import DRService
from services.gradcam_service import GradCAMService
from services.vessel_service import VesselService
from services.od_fovea_service import ODFoveaService
from services.lesion_service import LesionService
from services.calibration_service import CalibrationService
from services.pipeline_service import PipelineService
from services.report_service import ReportService

# Global instances
quality_service = QualityService()
enhancement_service = EnhancementService()
dr_service = DRService()
gradcam_service = GradCAMService()
vessel_service = VesselService()
od_fovea_service = ODFoveaService()
lesion_service = LesionService()
calibration_service = CalibrationService()
report_service = ReportService()

pipeline_service = PipelineService(
    quality_service, enhancement_service, dr_service, 
    gradcam_service, vessel_service, od_fovea_service, 
    lesion_service, calibration_service
)

def load_all_models():
    print("Loading DR model...")
    dr_service.load(settings.DR_MODEL_PATH)
    
    print("Loading Vessel model...")
    vessel_service.load(settings.VESSEL_MODEL_PATH)
    
    print("Loading OD/Fovea model...")
    od_fovea_service.load(settings.OD_FOVEA_MODEL_PATH)
    
    print("Loading Lesion model (plug-in)...")
    lesion_service.load(settings.LESION_MODEL_PATH)
    
    print("All models loaded successfully.")
