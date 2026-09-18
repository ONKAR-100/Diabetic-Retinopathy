from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    age: int = Field(..., ge=0, le=130)
    sex: str = Field(..., min_length=1, max_length=20)
    diabetes_duration: int = Field(..., ge=0, le=100)
    patient_display_id: Optional[str] = Field(None, max_length=50)
    previous_dr: Optional[str] = Field("None", max_length=50)
    previous_screening: Optional[date] = None
    hba1c: Optional[str] = Field(None, max_length=20)

class PatientResponse(PatientCreate):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
