from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    eye: str # "left" | "right" | "both"

class AnalyzeResponse(BaseModel):
    status: str
    result: dict
