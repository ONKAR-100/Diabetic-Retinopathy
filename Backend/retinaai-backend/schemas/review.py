from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ReviewCreate(BaseModel):
    decision: str # 'confirmed' | 'modified' | 'flagged'
    final_grade_left: Optional[int] = None
    final_grade_right: Optional[int] = None
    final_referable: Optional[bool] = None
    notes: Optional[str] = None
    review_duration_seconds: Optional[float] = None

class ReviewResponse(BaseModel):
    id: str
    reviewed_at: datetime
    review_duration_seconds: Optional[float] = None

    class Config:
        from_attributes = True
