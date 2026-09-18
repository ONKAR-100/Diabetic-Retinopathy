from pydantic import BaseModel, ConfigDict

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    centre: str

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class LoginRequest(BaseModel):
    username: str
    password: str
