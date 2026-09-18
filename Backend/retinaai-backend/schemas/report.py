from pydantic import BaseModel, ConfigDict
from datetime import datetime

class ReportResponse(BaseModel):
    report_id: str
    screening_id: str
    pdf_url: str
    generated_at: datetime

    model_config = ConfigDict(from_attributes=True)
