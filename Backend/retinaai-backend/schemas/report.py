from pydantic import BaseModel
from datetime import datetime

class ReportResponse(BaseModel):
    report_id: str
    screening_id: str
    pdf_url: str
    generated_at: datetime

    class Config:
        from_attributes = True
