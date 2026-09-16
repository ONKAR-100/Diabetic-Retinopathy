from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class PatientCreate(BaseModel):
    name: str
    age: int
    sex: str
    diabetes_duration: int
    patient_display_id: Optional[str] = None
    previous_dr: Optional[str] = "None"
    previous_screening: Optional[date] = None
    hba1c: Optional[str] = None

class PatientResponse(PatientCreate):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
