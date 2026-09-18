from typing import Literal
from pydantic import BaseModel, Field

class AnalyzeRequest(BaseModel):
    eye: Literal["left", "right", "both"] = Field(
        ..., description="Eye to assess or analyze: 'left', 'right', or 'both'"
    )

class AnalyzeResponse(BaseModel):
    status: str
    result: dict
