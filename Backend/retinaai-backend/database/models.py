import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Date, JSON, Text
from sqlalchemy.orm import relationship
from database.db import Base


def generate_uuid():
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """Return current UTC time as naive datetime for database compatibility."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_display_id = Column(String, unique=True, index=True)
    name = Column(String)
    age = Column(Integer)
    sex = Column(String)
    diabetes_duration = Column(Integer)
    previous_dr = Column(String)
    previous_screening = Column(Date, nullable=True)
    hba1c = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    screenings = relationship("Screening", back_populates="patient")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    full_name = Column(String)
    role = Column(String)
    centre = Column(String)
    created_at = Column(DateTime, default=utc_now)


class Screening(Base):
    __tablename__ = "screenings"

    id = Column(String, primary_key=True, default=generate_uuid)
    screening_display_id = Column(String, unique=True, index=True)
    patient_id = Column(String, ForeignKey("patients.id"))
    previous_screening_id = Column(String, ForeignKey("screenings.id"), nullable=True)
    created_by = Column(String, ForeignKey("users.id"))
    status = Column(String)

    # LEFT EYE
    left_image_path = Column(String, nullable=True)
    left_quality_status = Column(String, nullable=True)
    left_quality_scores = Column(JSON, nullable=True)
    left_quality_reason = Column(String, nullable=True)
    left_enhanced = Column(Boolean, default=False)
    left_dr_grade = Column(Integer, nullable=True)
    left_class_probabilities = Column(JSON, nullable=True)
    left_confidence_raw = Column(Float, nullable=True)
    left_confidence_calibrated = Column(Float, nullable=True)
    left_referable = Column(Boolean, nullable=True)
    left_gradcam_path = Column(String, nullable=True)
    left_vessel_mask_path = Column(String, nullable=True)
    left_vessel_overlay_path = Column(String, nullable=True)
    left_vessel_density = Column(Float, nullable=True)
    left_od_x = Column(Float, nullable=True)
    left_od_y = Column(Float, nullable=True)
    left_od_confidence = Column(Float, nullable=True)
    left_fovea_x = Column(Float, nullable=True)
    left_fovea_y = Column(Float, nullable=True)
    left_fovea_confidence = Column(Float, nullable=True)
    left_od_fovea_overlay_path = Column(String, nullable=True)
    left_lesion_result = Column(JSON, nullable=True)
    left_biomarkers = Column(JSON, nullable=True)
    left_avr = Column(Float, nullable=True)
    left_tortuosity = Column(Float, nullable=True)
    left_fractal_dim = Column(Float, nullable=True)

    # RIGHT EYE
    right_image_path = Column(String, nullable=True)
    right_quality_status = Column(String, nullable=True)
    right_quality_scores = Column(JSON, nullable=True)
    right_quality_reason = Column(String, nullable=True)
    right_enhanced = Column(Boolean, default=False)
    right_dr_grade = Column(Integer, nullable=True)
    right_class_probabilities = Column(JSON, nullable=True)
    right_confidence_raw = Column(Float, nullable=True)
    right_confidence_calibrated = Column(Float, nullable=True)
    right_referable = Column(Boolean, nullable=True)
    right_gradcam_path = Column(String, nullable=True)
    right_vessel_mask_path = Column(String, nullable=True)
    right_vessel_overlay_path = Column(String, nullable=True)
    right_vessel_density = Column(Float, nullable=True)
    right_od_x = Column(Float, nullable=True)
    right_od_y = Column(Float, nullable=True)
    right_od_confidence = Column(Float, nullable=True)
    right_fovea_x = Column(Float, nullable=True)
    right_fovea_y = Column(Float, nullable=True)
    right_fovea_confidence = Column(Float, nullable=True)
    right_od_fovea_overlay_path = Column(String, nullable=True)
    right_lesion_result = Column(JSON, nullable=True)
    right_biomarkers = Column(JSON, nullable=True)
    right_avr = Column(Float, nullable=True)
    right_tortuosity = Column(Float, nullable=True)
    right_fractal_dim = Column(Float, nullable=True)

    # Overall
    overall_referable = Column(Boolean, nullable=True)
    recommendation = Column(String, nullable=True)
    review_status = Column(String, default="not_required")
    created_at = Column(DateTime, default=utc_now)
    analyzed_at = Column(DateTime, nullable=True)
    pipeline_time_seconds = Column(Float, nullable=True)

    patient = relationship("Patient", back_populates="screenings")
    reviews = relationship("Review", back_populates="screening")
    reports = relationship("Report", back_populates="screening")

    longitudinal_as_current = relationship(
        "LongitudinalComparison",
        foreign_keys="LongitudinalComparison.current_screening_id",
        back_populates="current_screening",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    longitudinal_as_previous = relationship(
        "LongitudinalComparison",
        foreign_keys="LongitudinalComparison.previous_screening_id",
        back_populates="previous_screening",
        cascade="all, delete-orphan",
        passive_deletes=True
    )


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=generate_uuid)
    screening_id = Column(String, ForeignKey("screenings.id"))
    reviewer_id = Column(String, ForeignKey("users.id"))
    decision = Column(String)
    final_grade_left = Column(Integer, nullable=True)
    final_grade_right = Column(Integer, nullable=True)
    final_referable = Column(Boolean, nullable=True)
    notes = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, default=utc_now)
    review_duration_seconds = Column(Float, nullable=True)

    screening = relationship("Screening", back_populates="reviews")
    reviewer = relationship("User")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    screening_id = Column(String, ForeignKey("screenings.id"))
    pdf_path = Column(String)
    generated_at = Column(DateTime, default=utc_now)

    screening = relationship("Screening", back_populates="reports")


class LongitudinalComparison(Base):
    """
    Longitudinal progression record between two screenings of the same patient.

    Safety guarantees:
    - Ungradable images are never compared (handled in service).
    - progression_status = 'indeterminate' when registration fails.
    - Clinical language is always cautious: 'possible worsening', not 'confirmed'.
    - Lesion comparison stays null until lesion models expose multi-visit delta.
    """
    __tablename__ = "longitudinal_comparisons"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    previous_screening_id = Column(String, ForeignKey("screenings.id"), nullable=True)
    current_screening_id = Column(String, ForeignKey("screenings.id"), nullable=False, unique=True, index=True)

    # Image Registration (ORB + RANSAC homography)
    left_registration_status = Column(String, nullable=True)
    left_registration_quality = Column(Float, nullable=True)
    left_registration_transform = Column(JSON, nullable=True)
    left_diff_overlay_path = Column(String, nullable=True)

    right_registration_status = Column(String, nullable=True)
    right_registration_quality = Column(Float, nullable=True)
    right_registration_transform = Column(JSON, nullable=True)
    right_diff_overlay_path = Column(String, nullable=True)

    # DR Grade Comparison
    left_grade_prev = Column(Integer, nullable=True)
    left_grade_curr = Column(Integer, nullable=True)
    left_prob_prev = Column(JSON, nullable=True)
    left_prob_curr = Column(JSON, nullable=True)

    right_grade_prev = Column(Integer, nullable=True)
    right_grade_curr = Column(Integer, nullable=True)
    right_prob_prev = Column(JSON, nullable=True)
    right_prob_curr = Column(JSON, nullable=True)

    # Structural Comparison
    left_od_distance = Column(Float, nullable=True)
    left_fovea_distance = Column(Float, nullable=True)
    left_vessel_density_prev = Column(Float, nullable=True)
    left_vessel_density_curr = Column(Float, nullable=True)

    right_od_distance = Column(Float, nullable=True)
    right_fovea_distance = Column(Float, nullable=True)
    right_vessel_density_prev = Column(Float, nullable=True)
    right_vessel_density_curr = Column(Float, nullable=True)

    # Retinal Microvascular Biomarkers Comparison
    left_avr_prev = Column(Float, nullable=True)
    left_avr_curr = Column(Float, nullable=True)
    right_avr_prev = Column(Float, nullable=True)
    right_avr_curr = Column(Float, nullable=True)

    left_tortuosity_prev = Column(Float, nullable=True)
    left_tortuosity_curr = Column(Float, nullable=True)
    right_tortuosity_prev = Column(Float, nullable=True)
    right_tortuosity_curr = Column(Float, nullable=True)

    left_fractal_dim_prev = Column(Float, nullable=True)
    left_fractal_dim_curr = Column(Float, nullable=True)
    right_fractal_dim_prev = Column(Float, nullable=True)
    right_fractal_dim_curr = Column(Float, nullable=True)

    # Lesion Comparison (modular placeholder)
    lesion_comparison = Column(JSON, nullable=True)

    # Assessment
    progression_status = Column(String, nullable=False, default="indeterminate")
    supporting_evidence = Column(JSON, nullable=True)
    recommendation = Column(Text, nullable=True)
    ai_explanation = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now)

    patient = relationship("Patient")
    current_screening = relationship(
        "Screening",
        foreign_keys=[current_screening_id],
        back_populates="longitudinal_as_current"
    )
    previous_screening = relationship(
        "Screening",
        foreign_keys=[previous_screening_id],
        back_populates="longitudinal_as_previous"
    )
