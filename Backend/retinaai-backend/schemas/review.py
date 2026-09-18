from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class ReviewCreate(BaseModel):
    decision: Literal["confirmed", "modified", "flagged"]
    final_grade_left: Optional[int] = Field(None, ge=0, le=4)
    final_grade_right: Optional[int] = Field(None, ge=0, le=4)
    final_referable: Optional[bool] = None
    notes: Optional[str] = None
    review_duration_seconds: Optional[float] = Field(None, ge=0.0)

class ReviewResponse(BaseModel):
    id: str
    reviewed_at: datetime
    review_duration_seconds: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
