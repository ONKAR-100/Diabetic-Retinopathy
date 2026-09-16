import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal, Base, engine
from database.models import User, Patient, Screening
from core.security import get_password_hash
import datetime

Base.metadata.create_all(bind=engine)

def seed_data():
    db = SessionLocal()
    
    # 1. Seed users
    if not db.query(User).filter(User.username == "admin").first():
        u1 = User(
            username="admin", 
            password_hash=get_password_hash("admin123"),
            full_name="Admin Worker",
            role="health_worker",
            centre="Centre A"
        )
        db.add(u1)
        
    if not db.query(User).filter(User.username == "doctor1").first():
        u2 = User(
            username="doctor1",
            password_hash=get_password_hash("doc123"),
            full_name="Dr. Anita Sharma",
            role="doctor",
            centre="Main Hospital"
        )
        db.add(u2)
        
    db.commit()
    
    # 2. Seed patients
    if db.query(Patient).count() == 0:
        p1 = Patient(
            patient_display_id="RTA-2401", name="Meena Patil", age=54, sex="F",
            diabetes_duration=8, previous_dr="None"
        )
        p2 = Patient(
            patient_display_id="RTA-2402", name="Ramesh Kumar", age=61, sex="M",
            diabetes_duration=12, previous_dr="Mild"
        )
        db.add_all([p1, p2])
        db.commit()

        # Seed Screening
        admin = db.query(User).filter(User.username == "admin").first()
        scr = Screening(
            screening_display_id="SCR-10291",
            patient_id=p1.id,
            created_by=admin.id,
            status="complete",
            overall_referable=True,
            recommendation="Priority referral — Specialist evaluation recommended.",
            left_dr_grade=2,
            left_referable=True,
            left_confidence_raw=0.8,
            left_confidence_calibrated=0.75,
            review_status="pending"
        )
        db.add(scr)
        db.commit()

    print("Database seeded successfully.")

if __name__ == "__main__":
    seed_data()
