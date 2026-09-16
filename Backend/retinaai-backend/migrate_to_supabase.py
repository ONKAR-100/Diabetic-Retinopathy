import os
import sys
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# We need to manually load the environment and models
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from config import settings
from database.models import Base, User, Patient, Screening, Review, Report, LongitudinalComparison
from services.storage_service import storage_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# --- Configuration ---
LOCAL_DB_URL = "postgresql://postgres:Onkar8194@localhost:8888/retinaai"
SUPABASE_DB_URL = settings.DATABASE_URL

def migrate_data():
    if "PASTE_" in settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.error("Please add your SUPABASE_SERVICE_ROLE_KEY to .env before running this script.")
        logger.error("Storage migration cannot proceed without it.")
        return

    logger.info("Initializing Supabase Storage...")
    storage_service._init()
    if not storage_service._client:
        logger.error("Failed to initialize Supabase Storage client.")
        return

    logger.info("Connecting to local database...")
    local_engine = create_engine(LOCAL_DB_URL)
    LocalSession = sessionmaker(bind=local_engine)
    local_db = LocalSession()

    logger.info("Connecting to Supabase database...")
    supa_engine = create_engine(SUPABASE_DB_URL, pool_pre_ping=True)
    # Ensure tables exist
    Base.metadata.create_all(bind=supa_engine)
    SupaSession = sessionmaker(bind=supa_engine)
    supa_db = SupaSession()

    # --- 1. Migrate Users ---
    logger.info("Migrating Users...")
    local_users = local_db.query(User).all()
    for lu in local_users:
        if not supa_db.query(User).filter_by(id=lu.id).first():
            new_u = User(
                id=lu.id, username=lu.username, password_hash=lu.password_hash,
                full_name=lu.full_name, role=lu.role, centre=lu.centre, created_at=lu.created_at
            )
            supa_db.add(new_u)
    supa_db.commit()

    # --- 2. Migrate Patients ---
    logger.info("Migrating Patients...")
    local_patients = local_db.query(Patient).all()
    for lp in local_patients:
        if not supa_db.query(Patient).filter_by(id=lp.id).first():
            new_p = Patient(
                id=lp.id, patient_display_id=lp.patient_display_id, name=lp.name, age=lp.age,
                sex=lp.sex, diabetes_duration=lp.diabetes_duration, previous_dr=lp.previous_dr,
                previous_screening=lp.previous_screening, hba1c=lp.hba1c, created_at=lp.created_at,
                updated_at=lp.updated_at
            )
            supa_db.add(new_p)
    supa_db.commit()

    # Helper function to migrate a file and get the public URL
    def migrate_file(local_path: str, bucket: str, storage_path: str) -> str:
        if not local_path:
            return None
        # If it's already a URL, return it
        if local_path.startswith("http"):
            return local_path
        
        # Resolve absolute path based on the backend root
        abs_path = local_path
        if not os.path.isabs(abs_path):
            abs_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), local_path)
        
        # Fallback if stored as /static/...
        if abs_path.startswith("/") and "static" in abs_path:
            idx = abs_path.find("static")
            abs_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), abs_path[idx:])

        if os.path.exists(abs_path):
            logger.info(f"Uploading {abs_path} to {bucket}/{storage_path}...")
            return storage_service.upload_local_file(abs_path, bucket, storage_path)
        else:
            logger.warning(f"File not found on disk: {abs_path}")
            return local_path # Return original path if missing

    # --- 3. Migrate Screenings ---
    logger.info("Migrating Screenings & Images...")
    local_screenings = local_db.query(Screening).all()
    for ls in local_screenings:
        if supa_db.query(Screening).filter_by(id=ls.id).first():
            continue # Skip if already migrated

        logger.info(f"Processing screening {ls.screening_display_id}...")
        
        # Upload images and get URLs
        l_img = migrate_file(ls.left_image_path, settings.STORAGE_BUCKET_UPLOADS, f"{ls.id}_left.jpg")
        r_img = migrate_file(ls.right_image_path, settings.STORAGE_BUCKET_UPLOADS, f"{ls.id}_right.jpg")
        
        l_gradcam = migrate_file(ls.left_gradcam_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/left_gradcam_overlay.jpg")
        r_gradcam = migrate_file(ls.right_gradcam_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/right_gradcam_overlay.jpg")
        
        l_vessel = migrate_file(ls.left_vessel_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/left_vessel_overlay.jpg")
        r_vessel = migrate_file(ls.right_vessel_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/right_vessel_overlay.jpg")
        
        l_vessel_mask = migrate_file(ls.left_vessel_mask_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/left_vessel_mask.png")
        r_vessel_mask = migrate_file(ls.right_vessel_mask_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/right_vessel_mask.png")
        
        l_od = migrate_file(ls.left_od_fovea_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/left_od_fovea_overlay.jpg")
        r_od = migrate_file(ls.right_od_fovea_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ls.id}/right_od_fovea_overlay.jpg")

        new_s = Screening(
            id=ls.id, screening_display_id=ls.screening_display_id, patient_id=ls.patient_id,
            previous_screening_id=ls.previous_screening_id, created_by=ls.created_by, status=ls.status,
            
            # Left Eye
            left_image_path=l_img, left_quality_status=ls.left_quality_status, left_quality_scores=ls.left_quality_scores,
            left_quality_reason=ls.left_quality_reason, left_enhanced=ls.left_enhanced, left_dr_grade=ls.left_dr_grade,
            left_class_probabilities=ls.left_class_probabilities, left_confidence_raw=ls.left_confidence_raw,
            left_confidence_calibrated=ls.left_confidence_calibrated, left_referable=ls.left_referable,
            left_gradcam_path=l_gradcam, left_vessel_mask_path=l_vessel_mask, left_vessel_overlay_path=l_vessel,
            left_vessel_density=ls.left_vessel_density, left_od_x=ls.left_od_x, left_od_y=ls.left_od_y,
            left_od_confidence=ls.left_od_confidence, left_fovea_x=ls.left_fovea_x, left_fovea_y=ls.left_fovea_y,
            left_fovea_confidence=ls.left_fovea_confidence, left_od_fovea_overlay_path=l_od, left_lesion_result=ls.left_lesion_result,
            
            # Right Eye
            right_image_path=r_img, right_quality_status=ls.right_quality_status, right_quality_scores=ls.right_quality_scores,
            right_quality_reason=ls.right_quality_reason, right_enhanced=ls.right_enhanced, right_dr_grade=ls.right_dr_grade,
            right_class_probabilities=ls.right_class_probabilities, right_confidence_raw=ls.right_confidence_raw,
            right_confidence_calibrated=ls.right_confidence_calibrated, right_referable=ls.right_referable,
            right_gradcam_path=r_gradcam, right_vessel_mask_path=r_vessel_mask, right_vessel_overlay_path=r_vessel,
            right_vessel_density=ls.right_vessel_density, right_od_x=ls.right_od_x, right_od_y=ls.right_od_y,
            right_od_confidence=ls.right_od_confidence, right_fovea_x=ls.right_fovea_x, right_fovea_y=ls.right_fovea_y,
            right_fovea_confidence=ls.right_fovea_confidence, right_od_fovea_overlay_path=r_od, right_lesion_result=ls.right_lesion_result,
            
            # Overall
            overall_referable=ls.overall_referable, recommendation=ls.recommendation, review_status=ls.review_status,
            created_at=ls.created_at, analyzed_at=ls.analyzed_at, pipeline_time_seconds=ls.pipeline_time_seconds
        )
        supa_db.add(new_s)
    supa_db.commit()

    # --- 4. Migrate Reviews ---
    logger.info("Migrating Reviews...")
    local_reviews = local_db.query(Review).all()
    for lr in local_reviews:
        if not supa_db.query(Review).filter_by(id=lr.id).first():
            new_r = Review(
                id=lr.id, screening_id=lr.screening_id, reviewer_id=lr.reviewer_id, decision=lr.decision,
                final_grade_left=lr.final_grade_left, final_grade_right=lr.final_grade_right,
                final_referable=lr.final_referable, notes=lr.notes, reviewed_at=lr.reviewed_at,
                review_duration_seconds=lr.review_duration_seconds
            )
            supa_db.add(new_r)
    supa_db.commit()

    # --- 5. Migrate Reports ---
    logger.info("Migrating Reports...")
    local_reports = local_db.query(Report).all()
    for lr in local_reports:
        if not supa_db.query(Report).filter_by(id=lr.id).first():
            # Get the screening ID for the path
            scr = local_db.query(Screening).filter_by(id=lr.screening_id).first()
            if scr:
                rep_url = migrate_file(lr.pdf_path, settings.STORAGE_BUCKET_REPORTS, f"{scr.screening_display_id}/report.pdf")
                new_rep = Report(id=lr.id, screening_id=lr.screening_id, pdf_path=rep_url, generated_at=lr.generated_at)
                supa_db.add(new_rep)
    supa_db.commit()

    # --- 6. Migrate Longitudinal Comparisons ---
    logger.info("Migrating Longitudinal Comparisons...")
    local_longs = local_db.query(LongitudinalComparison).all()
    for ll in local_longs:
        if not supa_db.query(LongitudinalComparison).filter_by(id=ll.id).first():
            # Upload diff overlays if they exist
            l_diff = migrate_file(ll.left_diff_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ll.current_screening_id}/left_diff_overlay.jpg")
            r_diff = migrate_file(ll.right_diff_overlay_path, settings.STORAGE_BUCKET_RESULTS, f"{ll.current_screening_id}/right_diff_overlay.jpg")
            
            new_ll = LongitudinalComparison(
                id=ll.id, patient_id=ll.patient_id, previous_screening_id=ll.previous_screening_id,
                current_screening_id=ll.current_screening_id,
                left_registration_status=ll.left_registration_status, left_registration_quality=ll.left_registration_quality,
                left_registration_transform=ll.left_registration_transform, left_diff_overlay_path=l_diff,
                right_registration_status=ll.right_registration_status, right_registration_quality=ll.right_registration_quality,
                right_registration_transform=ll.right_registration_transform, right_diff_overlay_path=r_diff,
                left_grade_prev=ll.left_grade_prev, left_grade_curr=ll.left_grade_curr,
                left_prob_prev=ll.left_prob_prev, left_prob_curr=ll.left_prob_curr,
                right_grade_prev=ll.right_grade_prev, right_grade_curr=ll.right_grade_curr,
                right_prob_prev=ll.right_prob_prev, right_prob_curr=ll.right_prob_curr,
                left_od_distance=ll.left_od_distance, left_fovea_distance=ll.left_fovea_distance,
                left_vessel_density_prev=ll.left_vessel_density_prev, left_vessel_density_curr=ll.left_vessel_density_curr,
                right_od_distance=ll.right_od_distance, right_fovea_distance=ll.right_fovea_distance,
                right_vessel_density_prev=ll.right_vessel_density_prev, right_vessel_density_curr=ll.right_vessel_density_curr,
                lesion_comparison=ll.lesion_comparison, progression_status=ll.progression_status,
                supporting_evidence=ll.supporting_evidence, recommendation=ll.recommendation, ai_explanation=ll.ai_explanation,
                created_at=ll.created_at
            )
            supa_db.add(new_ll)
    supa_db.commit()

    logger.info("✅ Migration complete! All data and files have been moved to Supabase.")

if __name__ == "__main__":
    migrate_data()

